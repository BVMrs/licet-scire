import { test } from "node:test";
import assert from "node:assert/strict";
import { AccessDenied, type IntentCompiler } from "../src/index.ts";
import { app, makeLayer } from "./fixtures.ts";

const compiler: IntentCompiler = async () => ({ all: [{ field: "plan", op: "eq", value: "pro" }, { field: "lifetime_value", op: "gte", value: 1000 }] });

function seeded() {
  const ctx = makeLayer({ compiler });
  const { layer, clock } = ctx;
  layer.ingest({ type: "p", entity: app, source: "crm", at: clock(), attributes: { plan: "pro", lifetime_value: 1800 }, consent: { marketing: true } });
  layer.ingest({ type: "p", entity: { namespace: "app_user", id: "u-2" }, source: "crm", at: clock(), attributes: { plan: "pro", lifetime_value: 5000 } });
  layer.ingest({ type: "p", entity: { namespace: "app_user", id: "u-3" }, source: "crm", at: clock(), attributes: { plan: "free", lifetime_value: 5000 }, consent: { marketing: true } });
  return ctx;
}

test("CMP: a compiled plan cannot run until approved", async () => {
  const { layer } = seeded();
  const plan = await layer.compile("high-value pro customers", "marketing");
  assert.equal(plan.status, "pending_review");
  assert.throws(() => layer.run({ ...plan, status: "approved", approvedBy: "me", approvedAt: 0 }, "agent:marketing"), AccessDenied);
});

test("CMP: an approved plan materializes only consented members (D2)", async () => {
  const { layer } = seeded();
  const approved = layer.approve(await layer.compile("high-value pro customers", "marketing"), "reviewer@example.com");
  const aud = layer.run(approved, "agent:marketing");
  assert.equal(aud.members.length, 1, "u-2 has no marketing consent, u-3 is not pro");
  assert.equal(aud.members[0], layer.idn.resolve(app)!.canonicalId);
});

test("CMP: editing a plan after approval invalidates it", async () => {
  const { layer } = seeded();
  const approved = layer.approve(await layer.compile("x", "marketing"), "reviewer");
  const tampered = { ...approved, predicate: { field: "plan", op: "exists" as const } };
  assert.throws(() => layer.run(tampered, "agent:marketing"), AccessDenied);
});

test("OUT: an outcome against a read ID re-enters at ING", async () => {
  const { layer } = makeLayer();
  layer.ingest({ type: "p", entity: app, source: "crm", at: 1, attributes: { plan: "pro" } });
  const b = layer.getContext(app, { purpose: "service", requester: "agent:service" });
  layer.recordOutcome(b.readId, { type: "resolved" });
  const after = layer.getContext(app, { purpose: "service", requester: "agent:service", fields: ["last_outcome", "last_outcome_read"] });
  assert.deepEqual(Object.fromEntries(after.facts.map((f) => [f.field, f.value])), { last_outcome: "resolved", last_outcome_read: b.readId });
  assert.equal(after.facts[0].source, "agent:service");
  assert.ok(layer.lake.rows.some((r) => r.event.type === "outcome"));
});

test("OUT: unknown read IDs are rejected", () => {
  const { layer } = makeLayer();
  assert.throws(() => layer.recordOutcome("rd_fake", { type: "resolved" }), /unknown read/);
});
