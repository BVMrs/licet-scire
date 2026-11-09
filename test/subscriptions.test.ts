import { test } from "node:test";
import assert from "node:assert/strict";
import { AccessDenied, type Transition } from "../src/index.ts";
import { app, makeLayer } from "./fixtures.ts";

test("SUB emits a transition when the predicate flips, and only then", () => {
  const { layer, clock } = makeLayer();
  const got: Transition[] = [];
  layer.subscribe({ field: "open_issues", op: "gt", value: 0 }, "service", "agent:service", (t) => got.push(t));
  layer.ingest({ type: "ticket", entity: app, source: "support", at: clock(), attributes: { open_issues: 1 } });
  layer.ingest({ type: "ticket", entity: app, source: "support", at: clock() + 1, attributes: { open_issues: 2 } });
  layer.ingest({ type: "ticket", entity: app, source: "support", at: clock() + 2, attributes: { open_issues: 0 } });
  assert.deepEqual(got.map((t) => [t.from, t.to]), [[false, true], [true, false]]);
  assert.ok(got.every((t) => t.readId.startsWith("rd_")));
});

test("PDP on subscriptions: a predicate may not read fields the purpose does not cover", () => {
  const { layer } = makeLayer();
  assert.throws(
    () => layer.subscribe({ field: "lifetime_value", op: "gt", value: 1000 }, "service", "agent:service", () => {}),
    AccessDenied,
  );
  assert.throws(() => layer.subscribe({ field: "plan", op: "eq", value: "pro" }, "service", "agent:marketing", () => {}), AccessDenied);
});

test("withdrawing consent removes the entity from a consent-gated subscription", () => {
  const { layer, clock } = makeLayer();
  const got: Transition[] = [];
  layer.ingest({ type: "profile", entity: app, source: "crm", at: clock(), attributes: { plan: "pro" }, consent: { marketing: true } });
  layer.subscribe({ field: "plan", op: "eq", value: "pro" }, "marketing", "agent:marketing", (t) => got.push(t));
  layer.ingest({ type: "consent", entity: app, source: "cmp", at: clock() + 1, consent: { marketing: false } });
  assert.deepEqual(got.map((t) => t.to), [true, false]);
});

test("unsubscribe stops transitions", () => {
  const { layer, clock } = makeLayer();
  let n = 0;
  const off = layer.subscribe({ field: "open_issues", op: "exists" }, "service", "agent:service", () => n++);
  off();
  layer.ingest({ type: "ticket", entity: app, source: "support", at: clock(), attributes: { open_issues: 1 } });
  assert.equal(n, 0);
});
