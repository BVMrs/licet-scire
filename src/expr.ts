// Evaluation of declarative predicates (used by TRG/SUB and CMP).

import type { Expr } from "./types.ts";

export function fieldsOf(e: Expr): string[] {
  if ("all" in e) return e.all.flatMap(fieldsOf);
  if ("any" in e) return e.any.flatMap(fieldsOf);
  if ("not" in e) return fieldsOf(e.not);
  return [e.field];
}

/** Evaluate against a view that holds only the fields the requester may see. Missing fields never match. */
export function evaluate(e: Expr, view: Record<string, unknown>): boolean {
  if ("all" in e) return e.all.every((x) => evaluate(x, view));
  if ("any" in e) return e.any.some((x) => evaluate(x, view));
  if ("not" in e) return !evaluate(e.not, view);
  const has = Object.prototype.hasOwnProperty.call(view, e.field);
  if (e.op === "exists") return has;
  if (!has) return false;
  const v = view[e.field] as any;
  const w = e.value as any;
  switch (e.op) {
    case "eq": return v === w;
    case "neq": return v !== w;
    case "gt": return v > w;
    case "gte": return v >= w;
    case "lt": return v < w;
    case "lte": return v <= w;
  }
}
