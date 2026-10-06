import { test } from "node:test";
import assert from "node:assert/strict";
import { gateOutbound } from "./outbound-gate.ts";

test("blocks a reminder that names an allergen from the record", () => {
  const r = gateOutbound("Dinner: kuli kuli with plantain", { conditions: [], allergies: ["groundnuts"], cleared: false } as any);
  assert.equal(r.ok, false);
});

test("lets a clean reminder through", () => {
  const r = gateOutbound("Dinner: jollof rice with chicken", { conditions: [], allergies: ["groundnuts"], cleared: false } as any);
  assert.equal(r.ok, true);
});
