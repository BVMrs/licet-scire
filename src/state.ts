// HOT · Entity state store (current state, millisecond reads).
// LAKE · Append-only raw history. Stands in for open tables read zero-copy.
// DRV · Derived context store (model-written, versioned, async).

import type { CanonicalId, Derived, Fact, IngestEvent, Purpose } from "./types.ts";

export class EntityStateStore {
  private facts = new Map<CanonicalId, Map<string, Fact>>();
  private consent = new Map<CanonicalId, Map<Purpose, boolean>>();

  put(id: CanonicalId, fact: Fact): void {
    let m = this.facts.get(id);
    if (!m) this.facts.set(id, (m = new Map()));
    const prev = m.get(fact.field);
    // Out-of-order events must not overwrite newer state.
    if (!prev || prev.observedAt <= fact.observedAt) m.set(fact.field, fact);
  }

  get(id: CanonicalId): Fact[] {
    return [...(this.facts.get(id)?.values() ?? [])];
  }

  setConsent(id: CanonicalId, purpose: Purpose, granted: boolean): void {
    let m = this.consent.get(id);
    if (!m) this.consent.set(id, (m = new Map()));
    m.set(purpose, granted);
  }

  /** Absent consent is treated as not granted. */
  hasConsent(id: CanonicalId, purpose: Purpose): boolean {
    return this.consent.get(id)?.get(purpose) === true;
  }

  entities(): CanonicalId[] {
    return [...this.facts.keys()];
  }
}

export interface LakeRow {
  canonicalId: CanonicalId;
  event: IngestEvent;
}

export class Lake {
  readonly rows: LakeRow[] = [];
  append(row: LakeRow): void {
    this.rows.push(row);
  }
}

export class DerivedContextStore {
  private items = new Map<CanonicalId, Map<string, Derived>>();

  put(id: CanonicalId, d: Derived): void {
    let m = this.items.get(id);
    if (!m) this.items.set(id, (m = new Map()));
    m.set(d.field, d);
  }

  get(id: CanonicalId): Derived[] {
    return [...(this.items.get(id)?.values() ?? [])];
  }
}
