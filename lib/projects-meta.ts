// Display metadata for known projects. Describes what the app is; it never
// describes verification results, which only come from recorded runs.

export interface FlowCopy {
  name: string;
  why: string;
  /** A browser journey that also verifies this flow. */
  journey?: string;
  /** Where in the customer journey this sits, for the journey map. */
  stage?: string;
  /** Later stages this flow's browser journey also reaches. */
  alsoAt?: string[];
}

export interface Stage {
  id: string;
  label: string;
  /** Journey frame labels that show this stage. */
  frames: string[];
}

export interface ProjectMeta {
  kind: string;
  description: string;
  fixture: boolean;
  /** Shown to anonymous visitors (and the only project in the public demo snapshot). */
  publicDemo?: boolean;
  /**
   * Human names for protected flows, keyed by the exact test name. Detection
   * is automatic; these words were written for the demo repository.
   */
  flowCopy?: Record<string, FlowCopy>;
  pageFlow?: FlowCopy;
  /** Names for checks a change introduces (its new feature), keyed by test name or journey id. */
  newCheckCopy?: Record<string, { name: string; stage?: string }>;
  /** The customer journey, left to right, for the Protected Flows map. */
  stages?: Stage[];
  /** The request given to the demo's AI agent (scripted for this fixture), keyed by commit SHA prefix. */
  agentRequests?: Record<string, string>;
  /**
   * Requests the prompt composer can carry out on this fixture. The change and
   * its repair are prepared revisions in the fixture repository; NeverBreak
   * verifies them, live or from a recording. Nothing is generated.
   */
  scenarios?: Scenario[];
}

export interface Scenario {
  id: "scheduled-delivery";
  /** The last version known to work. */
  baseline: string;
  /** The prepared revision that implements the request. */
  change: string;
  /** Where the prepared repair lives. */
  repairRef: string;
}

const META: Record<string, ProjectMeta> = {
  dashdish: {
    kind: "Food delivery · Next.js",
    description: "A fictional food delivery app built for this demo. Its scheduled-delivery change and repair were prepared in advance to stand in for an AI agent's work.",
    fixture: true,
    publicDemo: true,
    pageFlow: { name: "DashDish opens", why: "Nobody can order from a blank screen.", stage: "home" },
    flowCopy: {
      "adds food to the cart": { name: "Add food to the cart", why: "Every order starts here.", stage: "menu" },
      "customizes a dish with a size and add-ons": { name: "Choose a size and add-ons", why: "Customers get the pizza they asked for, at the right price.", stage: "menu" },
      "applies a coupon to the total": { name: "Coupons lower the total", why: "Customers trust the price they see.", stage: "cart" },
      "completes a regular checkout": { name: "Complete a regular checkout", why: "Most orders are for right now.", journey: "regular-checkout", stage: "checkout", alsoAt: ["confirmation"] },
    },
    newCheckCopy: {
      "schedules an order for tomorrow": { name: "Place a scheduled order", stage: "checkout" },
      "asks for a delivery window when scheduling": { name: "Ask for a time when scheduling", stage: "checkout" },
      "scheduled-checkout": { name: "Scheduled checkout in Chromium", stage: "confirmation" },
    },
    stages: [
      { id: "home", label: "Discover", frames: ["Home"] },
      { id: "menu", label: "Menu", frames: ["Dish", "Restaurant"] },
      { id: "cart", label: "Cart", frames: ["Cart", "Cart, scheduled"] },
      { id: "checkout", label: "Checkout", frames: ["Cart, scheduled", "Cart"] },
      { id: "confirmation", label: "Confirmation", frames: ["Result"] },
    ],
    agentRequests: { "9b70678": "Let customers schedule food delivery for tomorrow." },
    scenarios: [{ id: "scheduled-delivery", baseline: "0c4e1f8", change: "9b70678", repairRef: "prepared-fixes/scheduled-delivery" }],
  },
  ledgerly: {
    kind: "Invoicing app · Next.js",
    description: "A small invoicing app. Its commits were written to look like an AI agent's work, including a “fix”.",
    fixture: true,
    pageFlow: { name: "Invoice page opens", why: "If the page doesn't load, nobody can pay." },
    flowCopy: {
      "formats the total for display": { name: "Total due shows the right amount", why: "It's the number every customer reads and pays." },
      "adds tax to the subtotal": { name: "Invoice total includes tax", why: "Customers are charged the right amount." },
      "returns zero for an empty invoice": { name: "Empty invoices show $0.00", why: "A new invoice never shows a stray amount." },
    },
  },
};

export function projectMeta(slug: string): ProjectMeta {
  return META[slug] ?? { kind: "Repository", description: "", fixture: false };
}
