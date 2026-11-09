// Shared types for the Licet Scire reference implementation.
// Component IDs (ING, IDN, HOT, ...) follow the architecture sketch v0.1.

export type CanonicalId = string;
export type Purpose = string; // "service" | "marketing" | "sales" | "external" | ...
export type AgentId = string;
export type PolicyTag = string; // e.g. "contact", "behavioral", "financial", "derived.service"
export type Action = string; // e.g. "reply", "offer_discount", "send_email"
export type ReadId = string;
export type Millis = number;

/** A reference to an entity in some source namespace, e.g. { namespace: "device", id: "d-123" }. */
export interface EntityRef {
  namespace: string;
  id: string;
}

export type MatchKind = "deterministic" | "probabilistic";

/** IDN output. Match confidence is exposed so agents can tell a guess from a match (D5). */
export interface Identity {
  canonicalId: CanonicalId;
  matchKind: MatchKind;
  matchConfidence: number; // 1.0 for deterministic
  linkedIds: EntityRef[];
}

/** A current-state value held in HOT. */
export interface Fact {
  field: string;
  value: unknown;
  source: string;
  observedAt: Millis;
  policyTag: PolicyTag;
}

/** Model-written context held in DRV. Always carries model, version and generation time. */
export interface Derived {
  field: string;
  kind: "summary" | "intent" | "open_issues" | string;
  value: string;
  model: string;
  version: string;
  generatedAt: Millis;
  policyTag: PolicyTag;
}

export type RedactionReason =
  | "purpose_not_permitted" // the purpose does not cover this field's policy tag
  | "probabilistic_link" // field may not flow through a probabilistic identity link (D5)
  | "stale" // older than the requester's maxStalenessMs
  | "no_consent"; // the entity has not consented to this purpose

export interface Redaction {
  field: string;
  reason: RedactionReason;
}

/** CTX request: quid (fields), cui (requester), cur (purpose), nunc (maxStalenessMs). */
export interface ContextRequest {
  purpose: Purpose;
  requester: AgentId;
  fields?: string[];
  maxStalenessMs?: Millis;
}

export interface ContextBundle {
  identity: Identity;
  facts: Fact[];
  derived: Derived[];
  allowed: Action[];
  withheld: Redaction[];
  readId: ReadId;
  policyVersion: string;
  servedAt: Millis;
}

/** A raw event arriving at ING. */
export interface IngestEvent {
  type: string;
  entity: EntityRef;
  source: string;
  at: Millis;
  attributes?: Record<string, unknown>;
  /** Consent captured at collection, per purpose. */
  consent?: Record<Purpose, boolean>;
}

/** Declarative predicate over entity state. Declarative so PDP can see which fields it reads. */
export type Expr =
  | { field: string; op: "eq" | "neq" | "gt" | "gte" | "lt" | "lte"; value: unknown }
  | { field: string; op: "exists" }
  | { all: Expr[] }
  | { any: Expr[] }
  | { not: Expr };

export interface Transition {
  canonicalId: CanonicalId;
  from: boolean;
  to: boolean;
  at: Millis;
  readId: ReadId;
}

export interface Outcome {
  type: string; // e.g. "resolved", "converted", "escalated"
  detail?: Record<string, unknown>;
}

export type Clock = () => Millis;
