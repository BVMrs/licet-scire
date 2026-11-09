import { test } from "node:test";
import assert from "node:assert/strict";
import { AccessDenied, UnknownEntity } from "../src/index.ts";
import { app, cookie, device, makeLayer } from "./fixtures.ts";

function seed() {
  const ctx = makeLayer();
  const { layer, clock } = ctx;
  layer.ingest({
    type: "profile", entity: app, source: "crm", at: clock(),
    attributes: { name: "Ana", email: "ana@example.com", plan: "pro", open_issues: 2, lifetime_value: 1800, shoe_size: 38 },
    consent: { marketing: true },
  });
  layer.link(app, device, "deterministic");
  layer.link(app, cookie, "probabilistic", 0.6);
  return ctx;
}

test("CTX returns only fields the purpose covers and says what it withheld", async () => {
  const { layer } = seed();
  const b = layer.getContext(device, { purpose: "service", requester: "agent:service" });
  assert.deepEqual(b.facts.map((f) => f.field).sort(), ["email", "name", "open_issues", "plan"]);
  assert.deepEqual(b.withheld, [{ field: "lifetime_value", reason: "purpose_not_permitted" }]);
  assert.deepEqual(b.allowed, ["reply", "open_ticket"]);
  assert.equal(b.identity.matchKind, "deterministic");
  assert.equal(b.policyVersion, "pol-2026-11-09");
});

test("fields outside the canonical schema land in LAKE only", () => {
  const { layer } = seed();
  assert.ok(layer.lake.rows.some((r) => (r.event.attributes as any).shoe_size === 38));
  assert.ok(!layer.hot.get(layer.idn.resolve(app)!.canonicalId).some((f) => f.field === "shoe_size"));
});

test("facts carry source and observedAt", () => {
  const { layer, clock } = seed();
  const b = layer.getContext(app, { purpose: "service", requester: "agent:service", fields: ["plan"] });
  assert.deepEqual(b.facts, [{ field: "plan", value: "pro", source: "crm", observedAt: clock(), policyTag: "account" }]);
});

test("out-of-order events do not overwrite newer state", () => {
  const { layer, clock } = seed();
  layer.ingest({ type: "upgrade", entity: app, source: "billing", at: clock() + 10, attributes: { plan: "enterprise" } });
  layer.ingest({ type: "late", entity: app, source: "billing", at: clock() - 10, attributes: { plan: "free" } });
  const b = layer.getContext(app, { purpose: "service", requester: "agent:service", fields: ["plan"] });
  assert.equal(b.facts[0].value, "enterprise");
});

test("PDP refuses a requester without a grant for the purpose", () => {
  const { layer } = seed();
  assert.throws(() => layer.getContext(app, { purpose: "marketing", requester: "agent:service" }), AccessDenied);
  assert.throws(() => layer.getContext(app, { purpose: "nonsense", requester: "agent:service" }), AccessDenied);
});

test("PDP refuses a purpose that needs consent the entity has not given", () => {
  const { layer, clock } = seed();
  layer.ingest({ type: "consent", entity: app, source: "cmp", at: clock(), consent: { marketing: false } });
  assert.throws(() => layer.getContext(app, { purpose: "marketing", requester: "agent:marketing" }), /no consent/);
});

test("unknown entities are an error, not an empty bundle", () => {
  const { layer } = seed();
  assert.throws(() => layer.getContext({ namespace: "device", id: "nope" }, { purpose: "service", requester: "agent:service" }), UnknownEntity);
});

test("D5: probabilistic link exposes confidence, restricts fields and removes actions", () => {
  const { layer } = seed();
  const b = layer.getContext(cookie, { purpose: "service", requester: "agent:service" });
  assert.equal(b.identity.matchKind, "probabilistic");
  assert.equal(b.identity.matchConfidence, 0.6);
  assert.deepEqual(b.facts.map((f) => f.field).sort(), ["open_issues", "plan"]);
  assert.ok(b.withheld.some((r) => r.field === "name" && r.reason === "probabilistic_link"));
  assert.deepEqual(b.allowed, []);
});

test("D5: below the confidence floor nothing but identity is returned", () => {
  const { layer } = seed();
  const weak = { namespace: "cookie", id: "c-weak" };
  layer.link(app, weak, "probabilistic", 0.2);
  const b = layer.getContext(weak, { purpose: "service", requester: "agent:service" });
  assert.equal(b.facts.length, 0);
  assert.equal(b.identity.matchConfidence, 0.2);
});

test("confidence never increases along a chain of links", () => {
  const { layer } = seed();
  const next = { namespace: "email_hash", id: "h-1" };
  const id = layer.link(cookie, next, "deterministic");
  assert.equal(id.matchKind, "probabilistic");
  assert.equal(id.matchConfidence, 0.6);
});

test("AUD records every read, including refusals, with returned and withheld fields", async () => {
  const { layer } = seed();
  const b = layer.getContext(app, { purpose: "service", requester: "agent:service" });
  assert.throws(() => layer.getContext(app, { purpose: "marketing", requester: "agent:service" }));
  await layer.settle();
  const reads = layer.aud.all();
  const ok = reads.find((r) => r.readId === b.readId)!;
  assert.equal(ok.kind, "context_read");
  assert.equal(ok.requester, "agent:service");
  assert.equal(ok.purpose, "service");
  assert.deepEqual(ok.withheld, b.withheld);
  assert.equal(ok.policyVersion, "pol-2026-11-09");
  assert.ok(reads.some((r) => r.kind === "denied" && /no grant/.test(r.note!)));
});

test("AUD writes are off the read path", () => {
  const { layer } = seed();
  const before = layer.aud.all().length;
  layer.getContext(app, { purpose: "service", requester: "agent:service" });
  assert.equal(layer.aud.all().length, before, "audit record should not be persisted synchronously");
});
