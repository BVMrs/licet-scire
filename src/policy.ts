// PDP · Policy decision point. Sits on every read and every subscription.
// Policy is a hard filter applied in code, never an instruction in a prompt.

import type { Action, AgentId, Identity, PolicyTag, Purpose, Redaction } from "./types.ts";

export interface PurposePolicy {
  /** Policy tags this purpose may read. */
  tags: PolicyTag[];
  /** Actions a requester may take under this purpose (returned as `allowed`, D4). */
  actions: Action[];
  /** Whether the entity must have consented to this purpose. */
  requiresConsent: boolean;
}

export interface PolicyConfig {
  version: string;
  purposes: Record<Purpose, PurposePolicy>;
  /** Which purposes each requesting agent is granted. */
  grants: Record<AgentId, Purpose[]>;
  /** D5: tags that may flow through a probabilistic identity link. Everything else is withheld. */
  probabilisticTags: PolicyTag[];
  /** D5: below this confidence, nothing but identity itself is returned. */
  minConfidence: number;
}

export class AccessDenied extends Error {
  readonly reason: string;
  constructor(reason: string) {
    super(`access denied: ${reason}`);
    this.reason = reason;
  }
}

export interface Decision {
  policyVersion: string;
  actions: Action[];
  /** Decide one field. Returns null when it may be returned, or the redaction otherwise. */
  check(field: string, tag: PolicyTag): Redaction | null;
}

export class PolicyDecisionPoint {
  readonly config: PolicyConfig;
  constructor(config: PolicyConfig) {
    this.config = config;
  }

  /**
   * Decide whether `requester` may read this entity for `purpose`. Throws AccessDenied when the
   * whole read is refused (no grant, unknown purpose, no consent). Otherwise returns a per-field check.
   */
  decide(args: { identity: Identity; purpose: Purpose; requester: AgentId; consented: boolean }): Decision {
    const { identity, purpose, requester, consented } = args;
    const p = this.config.purposes[purpose];
    if (!p) throw new AccessDenied(`unknown purpose "${purpose}"`);
    if (!(this.config.grants[requester] ?? []).includes(purpose)) {
      throw new AccessDenied(`requester "${requester}" has no grant for purpose "${purpose}"`);
    }
    if (p.requiresConsent && !consented) throw new AccessDenied(`no consent for purpose "${purpose}"`);

    const tags = new Set(p.tags);
    const probabilistic = identity.matchKind === "probabilistic";
    const belowFloor = identity.matchConfidence < this.config.minConfidence;
    const probTags = new Set(this.config.probabilisticTags);

    return {
      policyVersion: this.config.version,
      // A probabilistic match may not trigger actions; the agent can still read and ask.
      actions: probabilistic ? [] : [...p.actions],
      check(field, tag) {
        if (!tags.has(tag)) return { field, reason: "purpose_not_permitted" };
        if (belowFloor) return { field, reason: "probabilistic_link" };
        if (probabilistic && !probTags.has(tag)) return { field, reason: "probabilistic_link" };
        return null;
      },
    };
  }
}
