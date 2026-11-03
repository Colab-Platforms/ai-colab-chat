import test from "node:test";
import assert from "node:assert/strict";
import {
  classifyMessage,
  selectAutoModel,
  selectWithStickiness,
  type AutoCandidate,
} from "./auto-model.pure.js";

// Mirrors the seeded scores; cost is tokenMultiplier.
const OPUS: AutoCandidate = { id: 1, name: "Opus", quality: 10, cost: 5 };
const ARGON: AutoCandidate = { id: 2, name: "Argon", quality: 9, cost: 3 };
const SONNET: AutoCandidate = { id: 3, name: "Sonnet", quality: 8, cost: 2 };
const DEEPSEEK: AutoCandidate = { id: 4, name: "DeepSeek Flash", quality: 5, cost: 0.3 };
const HAIKU: AutoCandidate = { id: 5, name: "Haiku", quality: 5, cost: 0.5 };
const ALL = [OPUS, ARGON, SONNET, DEEPSEEK, HAIKU];

test("greetings and short factual messages are SIMPLE", () => {
  assert.equal(classifyMessage({ content: "hi" }).complexity, "SIMPLE");
  assert.equal(classifyMessage({ content: "capital of France?" }).complexity, "SIMPLE");
});

test("code and reasoning push a message up", () => {
  assert.equal(classifyMessage({ content: "fix this bug in my function" }).complexity, "MEDIUM");
  const hard = classifyMessage({
    content: "Analyze the trade-offs of this architecture:\n```ts\nclass A {}\n```",
  });
  assert.equal(hard.complexity, "COMPLEX");
});

test("deep research is always COMPLEX", () => {
  assert.equal(classifyMessage({ content: "ev market", chatType: "DEEP_RESEARCH" }).complexity, "COMPLEX");
});

test("an image attachment requires vision", () => {
  assert.equal(classifyMessage({ content: "what is this", attachmentMimeTypes: ["image/png"] }).needsVision, true);
  assert.equal(classifyMessage({ content: "summarise", attachmentMimeTypes: ["application/pdf"] }).needsVision, false);
});

test("QUALITY picks the top score, but a near-equal cheaper model wins", () => {
  assert.equal(selectAutoModel(ALL, "QUALITY", "COMPLEX")?.id, OPUS.id);
  const cheapNearTop = { id: 6, name: "Near", quality: 9, cost: 1 };
  assert.equal(selectAutoModel([OPUS, cheapNearTop], "QUALITY", "MEDIUM")?.id, 6);
});

test("ECONOMY picks the cheapest model that is good enough", () => {
  assert.equal(selectAutoModel(ALL, "ECONOMY", "SIMPLE")?.id, DEEPSEEK.id);
  // DeepSeek (5) is below the MEDIUM floor (6), so Sonnet is the cheapest that clears it.
  assert.equal(selectAutoModel(ALL, "ECONOMY", "MEDIUM")?.id, SONNET.id);
});

test("BALANCED sits between the two", () => {
  assert.equal(selectAutoModel(ALL, "BALANCED", "SIMPLE")?.id, DEEPSEEK.id);
  assert.equal(selectAutoModel(ALL, "BALANCED", "MEDIUM")?.id, SONNET.id);
});

test("falls back to the strongest model when nothing clears the floor", () => {
  assert.equal(selectAutoModel([DEEPSEEK, HAIKU], "QUALITY", "COMPLEX")?.id, DEEPSEEK.id);
});

test("empty candidate list yields null", () => {
  assert.equal(selectAutoModel([], "BALANCED", "SIMPLE"), null);
});

test("sticky: keeps the current model while it is still strong enough", () => {
  const r = selectWithStickiness({ candidates: ALL, currentId: OPUS.id, priority: "ECONOMY", complexity: "SIMPLE" });
  assert.equal(r.chosen?.id, OPUS.id);
  assert.equal(r.outcome, "KEPT");
});

test("sticky: upgrades when the current model is too weak", () => {
  const r = selectWithStickiness({ candidates: ALL, currentId: HAIKU.id, priority: "BALANCED", complexity: "COMPLEX" });
  assert.notEqual(r.chosen?.id, HAIKU.id);
  assert.equal(r.outcome, "SWITCHED");
  assert.equal(r.currentTooWeak, true);
});

test("sticky: moves off a model that is no longer a candidate", () => {
  const r = selectWithStickiness({
    candidates: [SONNET, ARGON],
    currentId: HAIKU.id,
    priority: "BALANCED",
    complexity: "SIMPLE",
  });
  assert.equal(r.outcome, "SWITCHED");
  assert.equal(r.currentTooWeak, false);
});

test("sticky: a new chat gets a fresh pick", () => {
  const r = selectWithStickiness({ candidates: ALL, currentId: null, priority: "ECONOMY", complexity: "SIMPLE" });
  assert.equal(r.outcome, "FRESH");
  assert.equal(r.chosen?.id, DEEPSEEK.id);
});
