import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { matchIntent } from "../lib/shared/intent.ts";

const supported = [
  "Add scheduled food delivery for tomorrow.",
  "Add scheduled delivery for tomorrow",
  "add scheduled delivery",
  "Let customers schedule food delivery for tomorrow.",
  "Allow users to schedule their order for later",
  "Customers should be able to pick a delivery time for tomorrow",
  "Support pre-orders for next-day delivery",
  "I want people to order dinner for tomorrow",
  "Add delivery time slots at checkout",
  "  SCHEDULE   DELIVERY   TOMORROW  ",
];

const unsupported = [
  "Add a dark mode",
  "Change the button color to blue",
  "Schedule a meeting with the team tomorrow",
  "Show tomorrow's weather on the home screen",
  "Add Apple Pay to checkout",
  "Remove scheduled delivery",
  "Disable ordering for tomorrow",
  "Ship it without scheduled delivery",
  "x".repeat(500) + " schedule delivery",
];

describe("prompt intent", () => {
  for (const p of supported) it(`accepts: ${p.trim()}`, () => assert.deepEqual(matchIntent(p), { kind: "supported", scenario: "scheduled-delivery" }));
  for (const p of unsupported) it(`declines: ${p.slice(0, 50)}`, () => assert.equal(matchIntent(p).kind, "unsupported"));
  it("treats blank input as empty, not as a request", () => {
    assert.equal(matchIntent("").kind, "empty");
    assert.equal(matchIntent("   ?! ").kind, "empty");
  });
});
