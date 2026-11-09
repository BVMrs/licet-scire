import { ContextLayer, type LayerConfig, type PolicyConfig, type Schema } from "../src/index.ts";

export const schema: Schema = {
  name: "contact",
  email: "contact",
  plan: "account",
  open_issues: "account",
  lifetime_value: "financial",
  last_page: "behavioral",
  contact_summary: "derived.service",
  last_outcome: "outcome",
  last_outcome_read: "outcome",
};

export const policy: PolicyConfig = {
  version: "pol-2026-11-09",
  purposes: {
    service: { tags: ["contact", "account", "derived.service", "outcome"], actions: ["reply", "open_ticket"], requiresConsent: false },
    marketing: { tags: ["account", "behavioral", "financial"], actions: ["send_email"], requiresConsent: true },
    external: { tags: ["account"], actions: [], requiresConsent: true },
  },
  grants: {
    "agent:service": ["service"],
    "agent:marketing": ["marketing"],
  },
  probabilisticTags: ["account"],
  minConfidence: 0.3,
};

export function makeClock(start = 1_000_000) {
  let t = start;
  const clock = () => t;
  clock.advance = (ms: number) => { t += ms; };
  return clock;
}

export function makeLayer(extra: Partial<LayerConfig> = {}) {
  const clock = makeClock();
  const layer = new ContextLayer({ policy, schema, clock, ...extra });
  return { layer, clock };
}

export const app = { namespace: "app_user", id: "u-42" };
export const device = { namespace: "device", id: "d-9" };
export const cookie = { namespace: "cookie", id: "c-7" };
