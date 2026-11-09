// IDN · Identity graph. Streaming resolution with match confidence per link.

import { randomUUID } from "node:crypto";
import type { CanonicalId, EntityRef, Identity, MatchKind } from "./types.ts";

interface Link {
  canonicalId: CanonicalId;
  kind: MatchKind;
  confidence: number;
}

const key = (ref: EntityRef) => `${ref.namespace}:${ref.id}`;

export class IdentityGraph {
  private links = new Map<string, Link>();
  private members = new Map<CanonicalId, EntityRef[]>();

  /** Resolve a ref, creating a new canonical entity (deterministic, confidence 1) if unseen. */
  resolveOrCreate(ref: EntityRef): Identity {
    if (!this.links.has(key(ref))) {
      const canonicalId = `ent_${randomUUID()}`;
      this.links.set(key(ref), { canonicalId, kind: "deterministic", confidence: 1 });
      this.members.set(canonicalId, [ref]);
    }
    return this.resolve(ref)!;
  }

  /** Resolve a ref without creating anything. Returns undefined for unknown refs. */
  resolve(ref: EntityRef): Identity | undefined {
    const link = this.links.get(key(ref));
    if (!link) return undefined;
    return {
      canonicalId: link.canonicalId,
      matchKind: link.kind,
      matchConfidence: link.confidence,
      linkedIds: [...(this.members.get(link.canonicalId) ?? [])],
    };
  }

  /**
   * Link `ref` to the entity `anchor` already resolves to. A link inherits the weaker of the
   * anchor's own link and the new evidence, so confidence never increases along a chain.
   */
  link(anchor: EntityRef, ref: EntityRef, kind: MatchKind, confidence = kind === "deterministic" ? 1 : 0.5): Identity {
    if (confidence <= 0 || confidence > 1) throw new RangeError("confidence must be in (0, 1]");
    if (kind === "deterministic" && confidence !== 1) throw new RangeError("deterministic links have confidence 1");
    const base = this.resolveOrCreate(anchor);
    const existing = this.links.get(key(ref));
    if (existing && existing.canonicalId !== base.canonicalId) {
      // Merging two canonical entities is a governed operation; out of scope for this reference.
      throw new Error(`ref ${key(ref)} already belongs to ${existing.canonicalId}`);
    }
    const effective = Math.min(base.matchConfidence, confidence);
    const effectiveKind: MatchKind = base.matchKind === "probabilistic" || kind === "probabilistic" ? "probabilistic" : "deterministic";
    this.links.set(key(ref), { canonicalId: base.canonicalId, kind: effectiveKind, confidence: effective });
    if (!existing) this.members.get(base.canonicalId)!.push(ref);
    return this.resolve(ref)!;
  }
}
