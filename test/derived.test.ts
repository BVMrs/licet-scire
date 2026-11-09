import { test } from "node:test";
import assert from "node:assert/strict";
import { app, makeLayer } from "./fixtures.ts";
import type { DerivedGenerator } from "../src/index.ts";

function withGenerator(isActive?: (facts: any[]) => boolean) {
  let calls = 0;
  const generator: DerivedGenerator = async ({ facts }) => {
    calls++;
    const issues = facts.find((f) => f.field === "open_issues")?.value ?? 0;
    return [{ field: "contact_summary", kind: "summary", value: `${issues} open issues`, model: "stub-model", version: "1", policyTag: "derived.service" }];
  };
  const ctx = makeLayer({ derived: { generator, isActive } });
  return { ...ctx, calls: () => calls };
}

test("design rule 1: getContext never calls the model", async () => {
  const { layer, clock, calls } = withGenerator();
  layer.ingest({ type: "profile", entity: app, source: "crm", at: clock(), attributes: { open_issues: 3 } });
  const before = calls();
  const b = layer.getContext(app, { purpose: "service", requester: "agent:service" });
  assert.equal(calls(), before);
  assert.equal(b.derived.length, 0, "summary not generated yet, and the read did not wait for it");
});

test("D3: derived context is precomputed on change, versioned and timestamped", async () => {
  const { layer, clock } = withGenerator();
  layer.ingest({ type: "profile", entity: app, source: "crm", at: clock(), attributes: { open_issues: 3 } });
  await layer.settle();
  const [d] = layer.getContext(app, { purpose: "service", requester: "agent:service" }).derived;
  assert.equal(d.value, "3 open issues");
  assert.equal(d.model, "stub-model");
  assert.equal(d.version, "1");
  assert.equal(d.generatedAt, clock());
});

test("D3: only active entities are precomputed", async () => {
  const { layer, clock, calls } = withGenerator((facts) => facts.some((f) => f.field === "open_issues" && (f.value as number) > 0));
  layer.ingest({ type: "profile", entity: app, source: "crm", at: clock(), attributes: { open_issues: 0 } });
  await layer.settle();
  assert.equal(calls(), 0);
});

test("nunc: derived context older than maxStalenessMs is withheld as stale", async () => {
  const { layer, clock } = withGenerator();
  layer.ingest({ type: "profile", entity: app, source: "crm", at: clock(), attributes: { open_issues: 1 } });
  await layer.settle();
  clock.advance(60_000);
  const b = layer.getContext(app, { purpose: "service", requester: "agent:service", maxStalenessMs: 30_000 });
  assert.equal(b.derived.length, 0);
  assert.deepEqual(b.withheld, [{ field: "contact_summary", reason: "stale" }]);
});

test("derived context is still subject to purpose policy", async () => {
  const { layer, clock } = withGenerator();
  layer.ingest({ type: "profile", entity: app, source: "crm", at: clock(), attributes: { open_issues: 1 }, consent: { marketing: true } });
  await layer.settle();
  const b = layer.getContext(app, { purpose: "marketing", requester: "agent:marketing" });
  assert.equal(b.derived.length, 0);
  assert.ok(b.withheld.some((r) => r.field === "contact_summary" && r.reason === "purpose_not_permitted"));
});
