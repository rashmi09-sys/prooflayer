// Optional browser snapshot of a verified commit.
//
// The commit's production build is started inside the sandbox on an
// internal-only Docker network (no route to the internet). A headless
// Chromium on the worker host opens one deterministic page, performs one
// known interaction, and takes a screenshot. The image is stored with the
// run. It is evidence of what the page rendered, not a test result.

import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { config } from "../lib/server/config.ts";
import { saveArtifact } from "../lib/server/store.ts";
import type { SnapshotAnnotations } from "../lib/shared/types.ts";

export interface Needle {
  value: string;
  role: "expected" | "received";
  test: string;
}

const execFileP = promisify(execFile);
const NETWORK = "prooflayer-sandbox";

export type JourneyStep =
  | { do: "goto"; path: string }
  | { do: "click"; role: "button" | "radio" | "checkbox"; name: string; exact?: boolean }
  | { do: "fill"; label: string; value: string }
  | { do: "capture"; label: string }
  | { do: "wait"; ms: number };

export interface Journey {
  id: string;
  name: string;
  /** If this control is missing, the journey doesn't exist in this version and is skipped. */
  requires?: { role: "button" | "radio"; name: string };
  steps: JourneyStep[];
  /** Text the customer should see at the end. */
  expect: string;
}

export interface SnapshotPlan {
  path: string;
  /** Visible text of one element to click before capturing, e.g. a disclosure. */
  clickText?: string;
  viewport: { width: number; height: number };
  deviceScaleFactor?: number;
  /** Static-export apps: scripted customer journeys, run against the built site. */
  journeys?: Journey[];
}

const ORDER = (extra: JourneyStep[], label: string): JourneyStep[] => [
  { do: "goto", path: "/" },
  { do: "capture", label: "Home" },
  { do: "click", role: "button", name: "Open Ember & Crust" },
  { do: "capture", label: "Restaurant" },
  { do: "click", role: "button", name: "Customize Wood-fired Margherita" },
  { do: "wait", ms: 650 },
  { do: "click", role: "radio", name: "Large", exact: true },
  { do: "click", role: "checkbox", name: "Extra cheese" },
  { do: "capture", label: "Dish" },
  { do: "click", role: "button", name: "Add to cart", exact: true },
  { do: "click", role: "button", name: "View cart" },
  { do: "fill", label: "Promo code", value: "WELCOME10" },
  { do: "click", role: "button", name: "Apply", exact: true },
  ...extra,
  { do: "capture", label },
  { do: "click", role: "button", name: "Place order" },
  { do: "wait", ms: 700 },
  { do: "capture", label: "Result" },
];

/** Server-controlled plans. Repositories cannot choose what the browser does. */
const PLANS: Record<string, Partial<SnapshotPlan>> = {
  ledgerly: { path: "/", clickText: "Show breakdown" },
  dashdish: {
    path: "/",
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    journeys: [
      { id: "regular-checkout", name: "Regular checkout", steps: ORDER([], "Cart"), expect: "Order confirmed" },
      {
        id: "scheduled-checkout",
        name: "Scheduled checkout",
        requires: { role: "radio", name: "Schedule" },
        steps: ORDER(
          [
            { do: "click", role: "radio", name: "Schedule" },
            { do: "click", role: "radio", name: "18:00–19:00" },
          ],
          "Cart, scheduled",
        ),
        expect: "Order scheduled",
      },
    ],
  },
};

export function snapshotPlanFor(projectSlug: string): SnapshotPlan {
  return { path: "/", viewport: { width: 1200, height: 760 }, ...PLANS[projectSlug] } as SnapshotPlan;
}

/** Path to a Chromium binary on the worker host, or null when none is installed. */
export function findBrowser(): string | null {
  const candidates = [
    process.env.PROOFLAYER_CHROMIUM_PATH,
    ...globDir("/opt/pw-browsers", /^chromium-\d+$/).map((d) => path.join(d, "chrome-linux", "chrome")),
    ...globDir(path.join(process.env.HOME ?? "/root", ".cache", "ms-playwright"), /^chromium-\d+$/).map((d) => path.join(d, "chrome-linux", "chrome")),
  ].filter((p): p is string => Boolean(p));
  return candidates.find((p) => fs.existsSync(p)) ?? null;
}

function globDir(dir: string, re: RegExp): string[] {
  try {
    return fs.readdirSync(dir).filter((n) => re.test(n)).sort().reverse().map((n) => path.join(dir, n));
  } catch {
    return [];
  }
}

export interface SnapshotResult {
  ok: boolean;
  cancelled: boolean;
  summary: string;
  log: string;
}

export async function captureSnapshot(opts: {
  runId: string;
  checkId: string;
  workDir: string;
  browserPath: string;
  plan: SnapshotPlan;
  /** Base path the static build was produced for (journey plans only). */
  basePath?: string;
  /** Values from failing assertions to locate in the rendered page. */
  needles?: Needle[];
  /** Called with the progress log each time a real step completes. */
  onLog?: (log: string) => void;
  setKill: (k: () => void) => void;
  isCancelled: () => boolean;
}): Promise<SnapshotResult> {
  const log: string[] = [];
  const t0 = Date.now();
  const note = (m: string) => {
    log.push(`[${((Date.now() - t0) / 1000).toFixed(1).padStart(5)}s] ${m}`);
    try {
      opts.onLog?.(log.join("\n"));
    } catch {
      /* progress is best effort; the final log is always stored */
    }
  };
  const name = `pl-${opts.runId}-snapshot`.toLowerCase();
  let killed = false;
  opts.setKill(() => {
    killed = true;
    execFile("docker", ["rm", "-f", name], () => undefined);
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let browser: any = null;
  const isStatic = Boolean(opts.plan.journeys?.length);
  const prefix = isStatic ? (opts.basePath ?? "") : "";

  try {
    await execFileP("docker", ["network", "inspect", NETWORK]).catch(() =>
      execFileP("docker", ["network", "create", "--internal", NETWORK]),
    );
    note(`network ${NETWORK} (internal: no route to the internet)`);

    const server = spawn("docker", [
      "run", "--rm", "--name", name,
      "--network", NETWORK,
      "--memory", "1g", "--memory-swap", "1g", "--cpus", "1", "--pids-limit", "256",
      "--read-only", "--tmpfs", "/tmp:rw,size=128m",
      "--cap-drop", "ALL", "--security-opt", "no-new-privileges",
      "--user", "10001:10001",
      "-e", "HOME=/tmp", "-e", "NEXT_TELEMETRY_DISABLED=1", "-e", "PORT=3000",
      "-v", `${opts.workDir}:/work`, "-w", "/work",
      ...(isStatic ? ["-v", `${STATIC_SERVER}:/srv/static-server.mjs:ro`] : []),
      config.runner.image,
      ...(isStatic
        ? ["node", "/srv/static-server.mjs", "/work/out", "3000", opts.basePath ?? ""]
        : ["node", "node_modules/next/dist/bin/next", "start", "-p", "3000", "-H", "0.0.0.0"]),
    ], { stdio: ["ignore", "pipe", "pipe"] });
    let serverOut = "";
    server.stdout?.on("data", (b: Buffer) => (serverOut += b.toString()).length > 20_000 && (serverOut = serverOut.slice(-20_000)));
    server.stderr?.on("data", (b: Buffer) => (serverOut += b.toString()).length > 20_000 && (serverOut = serverOut.slice(-20_000)));
    note(isStatic ? "serving the static build in the sandbox" : "started `next start` in the sandbox");

    // Wait for the container to get an address and the server to answer.
    let ip = "";
    let ready = false;
    for (let i = 0; i < 80 && !killed && !opts.isCancelled(); i++) {
      await sleep(500);
      if (!ip) {
        ip = (await execFileP("docker", ["inspect", "-f", "{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}", name]).catch(() => ({ stdout: "" }))).stdout.trim();
        continue;
      }
      try {
        const r = await fetch(`http://${ip}:3000${prefix}${opts.plan.path}`, { signal: AbortSignal.timeout(2000) });
        if (r.status < 500) {
          ready = true;
          note(`server answered HTTP ${r.status} at ${opts.plan.path}`);
          break;
        }
      } catch {
        /* not up yet */
      }
    }
    if (opts.isCancelled() || killed) return { ok: false, cancelled: true, summary: "Cancelled.", log: log.join("\n") };
    if (!ready) {
      note("server did not become ready within 40 s");
      return { ok: false, cancelled: false, summary: "The built app did not start in time, so no page was captured.", log: [...log, "", serverOut.trim()].join("\n") };
    }

    const { chromium } = await import("playwright-core");
    // The page runs the untrusted app's JavaScript in a browser on the worker host, so the
    // browser may only reach the app's own sandbox container: every other destination
    // (loopback, the LAN, metadata services, the internet, WebSockets included) goes to a
    // proxy address that refuses connections, and requests are also filtered per page.
    browser = await chromium.launch({
      executablePath: opts.browserPath,
      // Chromium's own sandbox needs an unprivileged user; a root worker runs without it (documented residual risk).
      chromiumSandbox: process.getuid?.() !== 0,
      args: [
        "--proxy-server=http://127.0.0.1:9",
        `--proxy-bypass-list=<-loopback>;${ip}`,
        // No name resolution at all (the app is addressed by IP), and no WebRTC UDP around the proxy.
        `--host-resolver-rules=MAP * ~NOTFOUND , EXCLUDE ${ip}`,
        "--force-webrtc-ip-handling-policy=disable_non_proxied_udp",
      ],
      timeout: 30_000,
    });
    if (isStatic) {
      return await runJourneys({ ...opts, browser, origin: `http://${ip}:3000${prefix}`, note, log });
    }
    const pageContext = await browser.newContext({ viewport: opts.plan.viewport, deviceScaleFactor: 1, serviceWorkers: "block" });
    await confineTo(pageContext, `http://${ip}:3000`);
    const page = await pageContext.newPage();
    const url = `http://${ip}:3000${opts.plan.path}`;
    const resp = await page.goto(url, { waitUntil: "networkidle", timeout: 20_000 });
    note(`browser opened ${opts.plan.path}: HTTP ${resp?.status() ?? "?"}, title "${await page.title()}"`);

    if (opts.plan.clickText) {
      const target = page.getByText(opts.plan.clickText, { exact: true });
      if ((await target.count()) > 0) {
        await target.first().click({ timeout: 5000 });
        await page.waitForTimeout(250);
        note(`clicked "${opts.plan.clickText}"`);
      } else {
        note(`no element with text "${opts.plan.clickText}" on this commit; captured without the interaction`);
      }
    }

    // Measure where the assertion's values appear in the page as rendered,
    // in the same state the screenshot captures.
    const annotations: SnapshotAnnotations = await page.evaluate(
      (needles: Needle[]) => {
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        const box = (r: DOMRect) => ({ x: Math.round(r.left), y: Math.round(r.top), width: Math.round(r.width), height: Math.round(r.height) });
        const visible = (r: DOMRect) => r.width > 0 && r.height > 0 && r.bottom > 0 && r.right > 0 && r.top < vh && r.left < vw;
        // Content frame: union of visible elements that render text or media.
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (const el of Array.from(document.body.querySelectorAll("*"))) {
          const hasText = Array.from(el.childNodes).some((n) => n.nodeType === 3 && (n.textContent ?? "").trim() !== "");
          if (!hasText && !["IMG", "SVG", "CANVAS", "VIDEO", "INPUT", "BUTTON"].includes(el.tagName)) continue;
          const r = el.getBoundingClientRect();
          if (!visible(r)) continue;
          minX = Math.min(minX, r.left); minY = Math.min(minY, r.top);
          maxX = Math.max(maxX, r.right); maxY = Math.max(maxY, r.bottom);
        }
        const content = isFinite(minX) ? { x: Math.max(0, Math.round(minX)), y: Math.max(0, Math.round(minY)), width: Math.round(Math.min(vw, maxX) - Math.max(0, minX)), height: Math.round(Math.min(vh, maxY) - Math.max(0, minY)) } : null;

        const matches = needles.map((n) => {
          // Smallest elements whose rendered text contains the value.
          const hits = Array.from(document.body.querySelectorAll("*")).filter((el) => {
            const t = (el as HTMLElement).innerText ?? "";
            if (!t.includes(n.value)) return false;
            return !Array.from(el.children).some((c) => ((c as HTMLElement).innerText ?? "").includes(n.value));
          });
          const boxes = hits.map((el) => el.getBoundingClientRect()).filter(visible).map(box);
          const text = hits[0] ? ((hits[0] as HTMLElement).innerText ?? "").trim().slice(0, 160) : null;
          return { value: n.value, role: n.role, test: n.test, found: boxes.length > 0, boxes: boxes.slice(0, 4), text };
        });
        return { content, matches };
      },
      opts.needles ?? [],
    );
    for (const m of annotations.matches) {
      note(m.found ? `found ${m.role} value "${m.value}" on the page in "${m.text}"` : `${m.role} value "${m.value}" does not appear on the page`);
    }

    const png: Buffer = await page.screenshot({ type: "png", fullPage: false });
    const dir = path.join(config.dataDir, "artifacts", opts.runId);
    fs.mkdirSync(dir, { recursive: true });
    const fileName = "snapshot.png";
    fs.writeFileSync(path.join(dir, fileName), png);
    const sha256 = crypto.createHash("sha256").update(png).digest("hex");
    const capturedAt = new Date().toISOString();
    saveArtifact({
      runId: opts.runId,
      checkId: opts.checkId,
      kind: "screenshot",
      fileName,
      mime: "image/png",
      bytes: png.length,
      sha256,
      width: opts.plan.viewport.width,
      height: opts.plan.viewport.height,
      pageUrl: opts.plan.path,
      label: opts.plan.clickText ? `${opts.plan.path} after clicking “${opts.plan.clickText}”` : opts.plan.path,
      capturedAt,
      annotations,
    });
    note(`screenshot ${opts.plan.viewport.width}×${opts.plan.viewport.height}, ${png.length.toLocaleString("en-US")} bytes, sha256 ${sha256}`);
    return { ok: true, cancelled: false, summary: `Captured ${opts.plan.path} in Chromium (${opts.plan.viewport.width}×${opts.plan.viewport.height}).`, log: log.join("\n") };
  } catch (err) {
    if (opts.isCancelled() || killed) return { ok: false, cancelled: true, summary: "Cancelled.", log: log.join("\n") };
    note(`error: ${(err as Error).message.split("\n")[0]}`);
    return { ok: false, cancelled: false, summary: "The browser snapshot could not be taken.", log: log.join("\n") };
  } finally {
    await browser?.close().catch(() => undefined);
    await execFileP("docker", ["rm", "-f", name]).catch(() => undefined);
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const STATIC_SERVER = path.join(process.cwd(), "runner", "static-server.mjs");

/**
 * Runs the plan's customer journeys in Chromium against the static build,
 * saving each captured frame. The last frame of each journey records what
 * the customer was expected to see and what the page actually showed.
 */
async function runJourneys(o: {
  runId: string;
  checkId: string;
  plan: SnapshotPlan;
  needles?: Needle[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  browser: any;
  origin: string;
  note: (m: string) => void;
  log: string[];
  isCancelled: () => boolean;
}): Promise<SnapshotResult> {
  const dir = path.join(config.dataDir, "artifacts", o.runId);
  fs.mkdirSync(dir, { recursive: true });
  const results: Array<{ name: string; ok: boolean | null; actual: string | null }> = [];
  let primaryDone = false;

  for (const j of o.plan.journeys ?? []) {
    if (o.isCancelled()) return { ok: false, cancelled: true, summary: "Cancelled.", log: o.log.join("\n") };
    const context = await o.browser.newContext({ viewport: o.plan.viewport, deviceScaleFactor: o.plan.deviceScaleFactor ?? 1, reducedMotion: "reduce", serviceWorkers: "block" });
    await confineTo(context, new URL(o.origin).origin);
    const page = await context.newPage();
    const frames: Array<{ label: string; png: Buffer }> = [];
    let skipped = false;
    try {
      for (const step of j.steps) {
        if (step.do === "goto") {
          const resp = await page.goto(`${o.origin}${step.path}`, { waitUntil: "networkidle", timeout: 20_000 });
          o.note(`${j.name}: opened ${step.path} (HTTP ${resp?.status() ?? "?"})`);
        } else if (step.do === "click") {
          if (j.requires && step.role === j.requires.role && step.name === j.requires.name && (await page.getByRole(step.role, { name: step.name }).count()) === 0) {
            skipped = true;
            o.note(`${j.name}: no “${step.name}” option in this version, so this journey doesn't exist yet`);
            break;
          }
          await page.getByRole(step.role, { name: step.name, exact: step.exact ?? false }).first().click({ timeout: 5000 });
          await page.waitForTimeout(250);
          o.note(`${j.name}: tapped “${step.name}”`);
        } else if (step.do === "fill") {
          await page.getByLabel(step.label).fill(step.value, { timeout: 5000 });
          o.note(`${j.name}: typed “${step.value}” into ${step.label}`);
        } else if (step.do === "wait") {
          await page.waitForTimeout(step.ms);
        } else {
          frames.push({ label: step.label, png: await page.screenshot({ type: "png" }) });
        }
      }
    } catch (err) {
      o.note(`${j.name}: stopped: ${(err as Error).message.split("\n")[0]}`);
      frames.push({ label: "Stopped here", png: await page.screenshot({ type: "png" }).catch(() => Buffer.alloc(0)) });
    }

    if (skipped) {
      results.push({ name: j.name, ok: null, actual: null });
      await context.close();
      continue;
    }

    // What the customer sees now: the expected text, or the visible alert/heading instead.
    const seen = await page.evaluate((expected: string) => {
      const visible = (el: Element) => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      };
      const all = Array.from(document.querySelectorAll("h1, h2, [role=alert]")).filter((e) => visible(e) && e.id !== "__next-route-announcer__");
      const hit = all.find((e) => (e as HTMLElement).innerText.trim() === expected);
      if (hit) return { ok: true, actual: expected };
      const alert = all.find((e) => e.getAttribute("role") === "alert" && (e as HTMLElement).innerText.trim());
      const heading = all.find((e) => e.tagName === "H1");
      return { ok: false, actual: ((alert ?? heading) as HTMLElement | undefined)?.innerText.trim().slice(0, 120) ?? null };
    }, j.expect);
    o.note(`${j.name}: ${seen.ok ? `saw “${j.expect}”` : `expected “${j.expect}”, the page showed “${seen.actual ?? "nothing"}”`}`);

    // Locate failing-assertion values on the final frame of the first journey.
    const primary = !primaryDone;
    primaryDone = true;
    const annotations: SnapshotAnnotations = primary
      ? await page.evaluate((needles: Needle[]) => {
          const vw = window.innerWidth;
          const vh = window.innerHeight;
          const visible = (r: DOMRect) => r.width > 0 && r.height > 0 && r.bottom > 0 && r.right > 0 && r.top < vh && r.left < vw;
          const box = (r: DOMRect) => ({ x: Math.round(r.left), y: Math.round(r.top), width: Math.round(r.width), height: Math.round(r.height) });
          return {
            content: null,
            matches: needles.map((n) => {
              const hits = Array.from(document.body.querySelectorAll("*")).filter((el) => {
                const t = (el as HTMLElement).innerText ?? "";
                return t.includes(n.value) && !Array.from(el.children).some((c) => ((c as HTMLElement).innerText ?? "").includes(n.value));
              });
              const boxes = hits.map((el) => el.getBoundingClientRect()).filter(visible).map(box);
              return { value: n.value, role: n.role, test: n.test, found: boxes.length > 0, boxes: boxes.slice(0, 4), text: hits[0] ? ((hits[0] as HTMLElement).innerText ?? "").trim().slice(0, 160) : null };
            }),
          };
        }, o.needles ?? [])
      : { content: null, matches: [] };
    for (const m of annotations.matches) o.note(m.found ? `found ${m.role} value “${m.value}” on the page in “${m.text}”` : `${m.role} value “${m.value}” is not on the page`);
    await context.close();

    frames.forEach((f, i) => {
      if (!f.png.length) return;
      const last = i === frames.length - 1;
      const fileName = `frame-${j.id}-${i + 1}.png`;
      fs.writeFileSync(path.join(dir, fileName), f.png);
      saveArtifact({
        runId: o.runId,
        checkId: o.checkId,
        kind: "screenshot",
        fileName,
        mime: "image/png",
        bytes: f.png.length,
        sha256: crypto.createHash("sha256").update(f.png).digest("hex"),
        width: o.plan.viewport.width * (o.plan.deviceScaleFactor ?? 1),
        height: o.plan.viewport.height * (o.plan.deviceScaleFactor ?? 1),
        pageUrl: o.plan.path,
        label: `${j.name} · ${f.label}`,
        capturedAt: new Date(Date.now() + i).toISOString(),
        annotations: {
          ...(last ? annotations : { content: null, matches: [] }),
          frame: { journey: j.id, journeyName: j.name, step: i + 1, label: f.label, primary: last && primary, scale: o.plan.deviceScaleFactor ?? 1 },
          ...(last ? { journey: { id: j.id, name: j.name, ok: seen.ok, expected: j.expect, actual: seen.actual } } : {}),
        },
      });
    });
    o.note(`${j.name}: saved ${frames.length} frames`);
    results.push({ name: j.name, ok: seen.ok, actual: seen.actual });
  }

  const ran = results.filter((r) => r.ok !== null);
  const failed = ran.filter((r) => r.ok === false);
  return {
    ok: true,
    cancelled: false,
    summary: failed.length
      ? `Ran ${ran.length} customer ${ran.length === 1 ? "journey" : "journeys"} in Chromium; ${failed.map((f) => `${f.name.toLowerCase()} ended on “${f.actual}”`).join("; ")}.`
      : `Ran ${ran.length} customer ${ran.length === 1 ? "journey" : "journeys"} in Chromium; each reached the expected screen.`,
    log: o.log.join("\n"),
  };
}

/** Abort every request that is not to the app under test (or an inline data/blob URL). */
async function confineTo(target: { route: (url: string, handler: (route: import("playwright-core").Route) => unknown) => Promise<unknown> }, origin: string): Promise<void> {
  await target.route("**/*", (route) => {
    const url = route.request().url();
    const allowed = url.startsWith(`${origin}/`) || url === origin || url.startsWith("data:") || url.startsWith("blob:");
    return allowed ? route.continue() : route.abort("blockedbyclient");
  });
}
