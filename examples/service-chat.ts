// Section 4 of the sketch: a service agent opens a chat from a logged-in app session.
// Run: npm run example

import { ContextLayer, type PolicyConfig } from "../src/index.ts";

const policy: PolicyConfig = {
  version: "pol-example-1",
  purposes: {
    service: { tags: ["contact", "account", "derived.service"], actions: ["reply", "open_ticket", "issue_refund"], requiresConsent: false },
    marketing: { tags: ["account", "behavioral"], actions: ["send_email"], requiresConsent: true },
  },
  grants: { "agent:service-chat": ["service"] },
  probabilisticTags: ["account"],
  minConfidence: 0.3,
};

const layer = new ContextLayer({
  policy,
  schema: { name: "contact", plan: "account", open_issues: "account", lifetime_value: "financial", contact_summary: "derived.service" },
  derived: {
    // Stands in for a model call. Runs on change, off the read path (D3).
    generator: async ({ facts }) => [{
      field: "contact_summary", kind: "summary", model: "stub-summarizer", version: "0.1", policyTag: "derived.service",
      value: `Customer on ${facts.find((f) => f.field === "plan")?.value} plan with ${facts.find((f) => f.field === "open_issues")?.value} open issues.`,
    }],
  },
});

const user = { namespace: "app_user", id: "u-42" };
const device = { namespace: "device", id: "ios-7f3a" };

layer.ingest({ type: "profile", entity: user, source: "crm", at: Date.now(), attributes: { name: "Ana", plan: "pro", open_issues: 2, lifetime_value: 1800 } });
layer.link(user, device, "deterministic");
await layer.settle(); // let DRV precompute the summary

const t0 = performance.now();
const bundle = layer.getContext(device, { purpose: "service", requester: "agent:service-chat", maxStalenessMs: 3_600_000 });
const ms = (performance.now() - t0).toFixed(2);

console.log(JSON.stringify(bundle, null, 2));
console.log(`\ncontext read took ${ms} ms in-process (sketch target: < 50 ms p99 with real stores)`);

layer.recordOutcome(bundle.readId, { type: "resolved" });
await layer.settle();
console.log(`audit records: ${layer.aud.all().map((r) => r.kind).join(", ")}`);
