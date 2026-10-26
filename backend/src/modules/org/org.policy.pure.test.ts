import test from "node:test";
import assert from "node:assert/strict";
import { isModelAllowed } from "./org.policy.pure.js";

const policy = (mode: "ALL" | "ALLOWLIST" | "BLOCKLIST", modelIds: number[]) => ({ modelPolicy: { mode, modelIds } });

test("ALL allows every model, even with a stale id list", () => {
  assert.equal(isModelAllowed(policy("ALL", []), 7), true);
  assert.equal(isModelAllowed(policy("ALL", [7]), 7), true);
});

test("ALLOWLIST allows only listed models (an empty list allows none)", () => {
  assert.equal(isModelAllowed(policy("ALLOWLIST", [1, 2]), 2), true);
  assert.equal(isModelAllowed(policy("ALLOWLIST", [1, 2]), 3), false);
  assert.equal(isModelAllowed(policy("ALLOWLIST", []), 1), false);
});

test("BLOCKLIST blocks only listed models", () => {
  assert.equal(isModelAllowed(policy("BLOCKLIST", [5]), 5), false);
  assert.equal(isModelAllowed(policy("BLOCKLIST", [5]), 6), true);
  assert.equal(isModelAllowed(policy("BLOCKLIST", []), 6), true);
});
