// The context layer: ING → IDN → HOT/LAKE → DRV/TRG → PDP → CTX/SUB/CMP, with AUD and OUT.
//
// Design rules this file encodes (from the handover):
//  1. No model call on the context read path. getContext() only reads stores; the only model-backed
//     pieces (DRV generator, CMP compiler) run asynchronously or before review.
//  2. Identity, consent and eligibility are deterministic and never pass through a model.
//  3. Policy is a hard filter at read time (PDP), not an instruction in a prompt.
//  4. Every read is auditable: requester, purpose, fields returned and withheld, policy version.
//  5. Precomputed audiences exist only as materialized, approved plans (D2).

import { randomUUID } from "node:crypto";
import { AuditLog } from "./audit.ts";
import { evaluate, fieldsOf } from "./expr.ts";
import { IdentityGraph } from "./identity.ts";
import { AccessDenied, PolicyDecisionPoint, type PolicyConfig } from "./policy.ts";
import { DerivedContextStore, EntityStateStore, Lake } from "./state.ts";
import type {
  AgentId, CanonicalId, Clock, ContextBundle, ContextRequest, Derived, EntityRef, Expr, Fact,
  IngestEvent, Outcome, PolicyTag, Purpose, ReadId, Redaction, Transition,
} from "./types.ts";

export class UnknownEntity extends Error {}

/** Thin canonical model: field → policy tag. Fields outside it land only in LAKE. */
export type Schema = Record<string, PolicyTag>;

/** DRV generator. May call a model. Never invoked on the read path. */
export type DerivedGenerator = (input: { canonicalId: CanonicalId; facts: Fact[] }) =>
  Promise<Omit<Derived, "generatedAt">[]>;

/** CMP compiler. May call a model. Its output is a plan that must be reviewed before it runs. */
export type IntentCompiler = (intent: string, purpose: Purpose, schema: Schema) => Promise<Expr>;

export interface LayerConfig {
  policy: PolicyConfig;
  schema: Schema;
  clock?: Clock;
  derived?: {
    generator: DerivedGenerator;
    /** D3: only precompute for active entities. Defaults to every entity. */
    isActive?: (facts: Fact[]) => boolean;
  };
  compiler?: IntentCompiler;
}

export interface IngestResult {
  canonicalId: CanonicalId;
  accepted: string[];
  lakeOnly: string[];
}

export interface QueryPlan {
  planId: string;
  intent: string;
  purpose: Purpose;
  predicate: Expr;
  status: "pending_review";
}

export interface ApprovedPlan extends Omit<QueryPlan, "status"> {
  status: "approved";
  approvedBy: string;
  approvedAt: number;
}

export interface AudienceHandle {
  planId: string;
  readId: ReadId;
  members: CanonicalId[];
}

interface Subscription {
  id: string;
  predicate: Expr;
  purpose: Purpose;
  requester: AgentId;
  onTransition: (t: Transition) => void;
  members: Set<CanonicalId>;
}

export class ContextLayer {
  readonly idn = new IdentityGraph();
  readonly hot = new EntityStateStore();
  readonly lake = new Lake();
  readonly drv = new DerivedContextStore();
  readonly aud = new AuditLog();
  readonly pdp: PolicyDecisionPoint;

  private readonly schema: Schema;
  private readonly clock: Clock;
  private readonly cfg: LayerConfig;
  private subs = new Map<string, Subscription>();
  private approved = new Set<string>();
  private inflight = new Set<Promise<void>>();

  constructor(cfg: LayerConfig) {
    this.cfg = cfg;
    this.pdp = new PolicyDecisionPoint(cfg.policy);
    this.schema = cfg.schema;
    this.clock = cfg.clock ?? Date.now;
  }

  // ── ING ────────────────────────────────────────────────────────────────────

  ingest(event: IngestEvent): IngestResult {
    if (!event.type || !event.entity?.namespace || !event.entity?.id || !event.source) {
      throw new TypeError("event needs type, entity {namespace, id} and source");
    }
    if (!Number.isFinite(event.at)) throw new TypeError("event.at must be a timestamp");
    const { canonicalId } = this.idn.resolveOrCreate(event.entity);
    return this.apply(canonicalId, event);
  }

  /** IDN link, exposed for identity evidence (login, hashed email match, probabilistic device match). */
  link(anchor: EntityRef, ref: EntityRef, kind: "deterministic" | "probabilistic", confidence?: number) {
    return this.idn.link(anchor, ref, kind, confidence);
  }

  private apply(canonicalId: CanonicalId, event: IngestEvent): IngestResult {
    this.lake.append({ canonicalId, event });
    for (const [purpose, granted] of Object.entries(event.consent ?? {})) {
      this.hot.setConsent(canonicalId, purpose, granted);
    }
    const accepted: string[] = [];
    const lakeOnly: string[] = [];
    for (const [field, value] of Object.entries(event.attributes ?? {})) {
      const tag = this.schema[field];
      if (!tag) { lakeOnly.push(field); continue; }
      this.hot.put(canonicalId, { field, value, source: event.source, observedAt: event.at, policyTag: tag });
      accepted.push(field);
    }
    if (accepted.length || event.consent) {
      this.evaluateSubscriptions(canonicalId);
      this.scheduleDerived(canonicalId);
    }
    return { canonicalId, accepted, lakeOnly };
  }

  // ── DRV (async, off the read path) ─────────────────────────────────────────

  private scheduleDerived(canonicalId: CanonicalId): void {
    const d = this.cfg.derived;
    if (!d) return;
    const facts = this.hot.get(canonicalId);
    if (d.isActive && !d.isActive(facts)) return;
    const job = (async () => {
      await new Promise((r) => setImmediate(r));
      const out = await d.generator({ canonicalId, facts: this.hot.get(canonicalId) });
      for (const item of out) {
        const tag = this.schema[item.field];
        if (!tag || tag !== item.policyTag) throw new Error(`derived field "${item.field}" not in schema with tag ${item.policyTag}`);
        this.drv.put(canonicalId, { ...item, generatedAt: this.clock() });
      }
    })();
    const tracked = job.catch(() => {}).finally(() => this.inflight.delete(tracked));
    this.inflight.add(tracked);
  }

  /** Wait for background derived-context jobs and audit writes. For tests and demos. */
  async settle(): Promise<void> {
    while (this.inflight.size) await Promise.all([...this.inflight]);
    await this.aud.flush();
  }

  // ── CTX ────────────────────────────────────────────────────────────────────

  /** What may this requester know about this entity, for this purpose, right now. */
  getContext(entity: EntityRef, req: ContextRequest): ContextBundle {
    const identity = this.idn.resolve(entity);
    if (!identity) throw new UnknownEntity(`${entity.namespace}:${entity.id}`);
    const readId = newReadId();
    const now = this.clock();

    let decision;
    try {
      decision = this.pdp.decide({
        identity, purpose: req.purpose, requester: req.requester,
        consented: this.hot.hasConsent(identity.canonicalId, req.purpose),
      });
    } catch (e) {
      if (e instanceof AccessDenied) {
        this.aud.record({
          readId, kind: "denied", at: now, requester: req.requester, purpose: req.purpose,
          canonicalId: identity.canonicalId, returned: [], withheld: [], policyVersion: this.pdp.config.version, note: e.reason,
        });
      }
      throw e;
    }

    const wanted = req.fields ? new Set(req.fields) : undefined;
    const withheld: Redaction[] = [];
    const facts = this.hot.get(identity.canonicalId).filter((f) => {
      if (wanted && !wanted.has(f.field)) return false;
      const r = decision.check(f.field, f.policyTag);
      if (r) withheld.push(r);
      return !r;
    });
    const derived = this.drv.get(identity.canonicalId).filter((d) => {
      if (wanted && !wanted.has(d.field)) return false;
      const r = decision.check(d.field, d.policyTag);
      if (r) { withheld.push(r); return false; }
      if (req.maxStalenessMs !== undefined && now - d.generatedAt > req.maxStalenessMs) {
        withheld.push({ field: d.field, reason: "stale" });
        return false;
      }
      return true;
    });

    this.aud.record({
      readId, kind: "context_read", at: now, requester: req.requester, purpose: req.purpose,
      canonicalId: identity.canonicalId,
      returned: [...facts.map((f) => f.field), ...derived.map((d) => d.field)],
      withheld, policyVersion: decision.policyVersion,
    });

    return { identity, facts, derived, allowed: decision.actions, withheld, readId, policyVersion: decision.policyVersion, servedAt: now };
  }

  // ── SUB / TRG ──────────────────────────────────────────────────────────────

  /** Replaces streaming segment membership: emits a transition whenever the predicate flips. */
  subscribe(predicate: Expr, purpose: Purpose, requester: AgentId, onTransition: (t: Transition) => void): () => void {
    this.checkPredicate(predicate, purpose, requester);
    const sub: Subscription = { id: randomUUID(), predicate, purpose, requester, onTransition, members: new Set() };
    this.subs.set(sub.id, sub);
    for (const id of this.hot.entities()) this.evaluateOne(sub, id);
    return () => this.subs.delete(sub.id);
  }

  /** PDP on subscriptions: a predicate may only read fields its requester may read for that purpose. */
  private checkPredicate(predicate: Expr, purpose: Purpose, requester: AgentId): void {
    const p = this.pdp.config.purposes[purpose];
    if (!p) throw new AccessDenied(`unknown purpose "${purpose}"`);
    if (!(this.pdp.config.grants[requester] ?? []).includes(purpose)) {
      throw new AccessDenied(`requester "${requester}" has no grant for purpose "${purpose}"`);
    }
    for (const f of fieldsOf(predicate)) {
      const tag = this.schema[f];
      if (!tag) throw new TypeError(`predicate field "${f}" is not in the schema`);
      if (!p.tags.includes(tag)) throw new AccessDenied(`purpose "${purpose}" may not read "${f}"`);
    }
  }

  private evaluateSubscriptions(canonicalId: CanonicalId): void {
    for (const sub of this.subs.values()) this.evaluateOne(sub, canonicalId);
  }

  /** The policy-filtered view of an entity, or null if the requester may not read it at all. */
  private viewFor(canonicalId: CanonicalId, purpose: Purpose, requester: AgentId): Record<string, unknown> | null {
    const identity = { canonicalId, matchKind: "deterministic" as const, matchConfidence: 1, linkedIds: [] };
    let decision;
    try {
      decision = this.pdp.decide({ identity, purpose, requester, consented: this.hot.hasConsent(canonicalId, purpose) });
    } catch (e) {
      if (e instanceof AccessDenied) return null;
      throw e;
    }
    const view: Record<string, unknown> = {};
    for (const f of this.hot.get(canonicalId)) if (!decision.check(f.field, f.policyTag)) view[f.field] = f.value;
    return view;
  }

  private evaluateOne(sub: Subscription, canonicalId: CanonicalId): void {
    const view = this.viewFor(canonicalId, sub.purpose, sub.requester);
    const now = view !== null && evaluate(sub.predicate, view);
    const was = sub.members.has(canonicalId);
    if (now === was) return;
    if (now) sub.members.add(canonicalId); else sub.members.delete(canonicalId);
    const readId = newReadId();
    const at = this.clock();
    this.aud.record({
      readId, kind: "transition", at, requester: sub.requester, purpose: sub.purpose, canonicalId,
      returned: fieldsOf(sub.predicate), withheld: [], policyVersion: this.pdp.config.version,
    });
    sub.onTransition({ canonicalId, from: was, to: now, at, readId });
  }

  // ── CMP ────────────────────────────────────────────────────────────────────

  /** Intent in, reviewable plan out. The plan cannot run until a person or policy approves it. */
  async compile(intent: string, purpose: Purpose): Promise<QueryPlan> {
    if (!this.cfg.compiler) throw new Error("no IntentCompiler configured");
    if (!this.pdp.config.purposes[purpose]) throw new AccessDenied(`unknown purpose "${purpose}"`);
    const predicate = await this.cfg.compiler(intent, purpose, this.schema);
    return { planId: `plan_${randomUUID()}`, intent, purpose, predicate, status: "pending_review" };
  }

  approve(plan: QueryPlan, approvedBy: string): ApprovedPlan {
    const approved: ApprovedPlan = { ...plan, status: "approved", approvedBy, approvedAt: this.clock() };
    this.approved.add(this.planKey(approved));
    return approved;
  }

  /** D2: precomputed membership survives only as the materialization of an approved plan. */
  run(plan: ApprovedPlan, requester: AgentId): AudienceHandle {
    if (plan.status !== "approved" || !this.approved.has(this.planKey(plan))) {
      throw new AccessDenied("plan was not approved through approve()");
    }
    this.checkPredicate(plan.predicate, plan.purpose, requester);
    const members = this.hot.entities().filter((id) => {
      const view = this.viewFor(id, plan.purpose, requester);
      return view !== null && evaluate(plan.predicate, view);
    });
    const readId = newReadId();
    this.aud.record({
      readId, kind: "plan_run", at: this.clock(), requester, purpose: plan.purpose,
      returned: fieldsOf(plan.predicate), withheld: [], policyVersion: this.pdp.config.version,
      note: `${plan.planId} approved by ${plan.approvedBy}; ${members.length} members`,
    });
    return { planId: plan.planId, readId, members };
  }

  private planKey(p: Omit<QueryPlan, "status">): string {
    return JSON.stringify([p.planId, p.purpose, p.predicate]);
  }

  // ── OUT ────────────────────────────────────────────────────────────────────

  /** Agents report outcomes against the read ID. Outcomes re-enter at ING as events. */
  recordOutcome(readId: ReadId, outcome: Outcome): void {
    const rec = this.aud.find(readId);
    if (!rec || rec.kind === "denied") throw new Error(`unknown read ${readId}`);
    if (!rec.canonicalId) throw new Error(`read ${readId} is not tied to one entity`);
    this.apply(rec.canonicalId, {
      type: "outcome", entity: { namespace: "canonical", id: rec.canonicalId }, source: rec.requester,
      at: this.clock(),
      attributes: { last_outcome: outcome.type, last_outcome_read: readId, ...(outcome.detail ?? {}) },
    });
  }
}

function newReadId(): ReadId {
  return `rd_${randomUUID()}`;
}
