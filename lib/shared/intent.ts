// What the prompt composer understands. Deterministic, on purpose: there is no
// language model behind it, and it says so. One scenario is supported:
// scheduled delivery for DashDish. Anything else is declined plainly rather
// than quietly replaying that scenario.

export const SCHEDULED_DELIVERY = "scheduled-delivery" as const;
export const SUPPORTED_EXAMPLE = "Add scheduled food delivery for tomorrow.";
export const UNSUPPORTED_MESSAGE = "This prototype currently supports the scheduled-delivery demonstration.";

export type Intent =
  | { kind: "supported"; scenario: typeof SCHEDULED_DELIVERY }
  | { kind: "unsupported"; reason: "unrelated" | "opposite" | "too-long" }
  | { kind: "empty" };

const MAX = 400;
const SCHEDULE = /\b(schedul\w*|later|pre-?orders?|preorder\w*|in advance|ahead of time|time ?slots?|delivery (?:window|time|slot)s?|(?:pick|choose|select) (?:a |the )?(?:delivery )?(?:time|slot|window)|plan(?:ned)? (?:orders?|deliver\w*))\b/;
const TOMORROW = /\b(tomorrow|next day)\b/;
const DELIVERY = /\b(deliver\w*|orders?|ordering|food|meals?|dinner|lunch|checkout)\b/;
const OPPOSITE = /\b(remove|delete|disable|drop|undo|revert|get rid of|turn off|stop|cancel|without|don'?t|do not|never)\b/;

/** Reads a request. Supported: adding scheduled (e.g. tomorrow's) food delivery, in reasonable wordings. */
export function matchIntent(input: string): Intent {
  const text = input.toLowerCase().replace(/[“”"'’`]/g, (c) => (c === "’" ? "'" : " ")).replace(/\s+/g, " ").trim();
  if (text.replace(/[^a-z]/g, "").length < 3) return { kind: "empty" };
  if (text.length > MAX) return { kind: "unsupported", reason: "too-long" };
  const scheduling = SCHEDULE.test(text);
  const tomorrow = TOMORROW.test(text);
  const delivery = DELIVERY.test(text);
  if (!(scheduling || tomorrow) || !delivery) return { kind: "unsupported", reason: "unrelated" };
  if (OPPOSITE.test(text)) return { kind: "unsupported", reason: "opposite" };
  return { kind: "supported", scenario: SCHEDULED_DELIVERY };
}
