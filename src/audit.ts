// AUD · Audit and provenance. Every read records requester, purpose, fields returned,
// fields withheld and the policy version. Writes are queued off the read path.

import type { AgentId, CanonicalId, Millis, Purpose, ReadId, Redaction } from "./types.ts";

export interface AuditRecord {
  readId: ReadId;
  kind: "context_read" | "transition" | "plan_run" | "denied";
  at: Millis;
  requester: AgentId;
  purpose: Purpose;
  canonicalId?: CanonicalId;
  returned: string[];
  withheld: Redaction[];
  policyVersion: string;
  note?: string;
}

export class AuditLog {
  private records: AuditRecord[] = [];
  private pending: AuditRecord[] = [];
  private scheduled = false;

  /** Enqueue a record. Returns immediately; persistence happens on a later tick. */
  record(r: AuditRecord): void {
    this.pending.push(r);
    if (!this.scheduled) {
      this.scheduled = true;
      setImmediate(() => this.drain());
    }
  }

  private drain(): void {
    this.scheduled = false;
    this.records.push(...this.pending.splice(0));
  }

  /** Wait until every enqueued record is persisted. */
  async flush(): Promise<void> {
    this.drain();
  }

  all(): readonly AuditRecord[] {
    return this.records;
  }

  find(readId: ReadId): AuditRecord | undefined {
    return this.records.find((r) => r.readId === readId) ?? this.pending.find((r) => r.readId === readId);
  }
}
