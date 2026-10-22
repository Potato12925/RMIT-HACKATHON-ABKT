import { test } from "node:test";
import assert from "node:assert/strict";
import { allocate, payloadHash, transition } from "../src/lib/funding";
const funds = [
  {
    id: "a",
    available: 5_000_000,
    expiresAt: new Date("2099-01-01"),
    restrictions: [{ category: "MEDICAL", beneficiaryId: "linh" }],
  },
  {
    id: "b",
    available: 7_000_000,
    expiresAt: new Date("2099-01-01"),
    restrictions: [{ category: "MEDICAL", beneficiaryId: "linh" }],
  },
];
test("valid medical request allocates exact integer VND deterministically", () =>
  assert.deepEqual(
    allocate(funds, {
      amount: 12_000_000,
      category: "MEDICAL",
      beneficiaryId: "linh",
    }),
    [
      { commitmentId: "a", amount: 5_000_000 },
      { commitmentId: "b", amount: 7_000_000 },
    ],
  ));
test("policy mismatch and insufficient funds reject", () =>
  assert.throws(() =>
    allocate(funds, {
      amount: 12_000_000,
      category: "TRAVEL",
      beneficiaryId: "linh",
    }),
  ));
test("expired contributions cannot be allocated", () =>
  assert.throws(() =>
    allocate([{ ...funds[0], expiresAt: new Date(0) }], {
      amount: 1,
      category: "MEDICAL",
      beneficiaryId: "linh",
    }),
  ));
test("hash is canonical and changes on tampering", () => {
  assert.equal(payloadHash({ b: 2, a: 1 }), payloadHash({ a: 1, b: 2 }));
  assert.notEqual(payloadHash({ amount: 1 }), payloadHash({ amount: 2 }));
});
test("state machine disallows bypass and duplicate settlement", () => {
  assert.throws(() => transition("DRAFT", "SETTLED"));
  assert.throws(() => transition("SETTLED", "SETTLED"));
  assert.equal(transition("AUTHORIZED", "SETTLED"), "SETTLED");
});
