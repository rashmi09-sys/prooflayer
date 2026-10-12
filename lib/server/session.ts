import crypto from "node:crypto";
import { config } from "./config.ts";

// Pure session and request-origin logic (no framework imports) so it can be unit tested.
//
// One operator account, unlocked with an access code from the server
// environment. Sessions are HMAC-signed cookies carrying an expiry and a
// session epoch; signing out increments the epoch, which revokes every
// session issued before it (there is only one operator).

export const MAX_AGE_S = 60 * 60 * 12;
/** Access codes shorter than this leave sign-in disabled. */
export const MIN_ACCESS_CODE_LENGTH = 12;
export const MIN_SECRET_LENGTH = 32;

/** Secure cookies use the __Host- prefix: HTTPS only, path=/, never shared with subdomains. */
export function sessionCookie(secure: boolean): string {
  return secure ? "__Host-pl_session" : "pl_session";
}

/** False in the public demo, and whenever either secret is missing or too short: no sign-in at all, never a bypass. */
export function authConfigured(): boolean {
  return Boolean(
    !config.publicDemo &&
      config.accessCode &&
      config.accessCode.length >= MIN_ACCESS_CODE_LENGTH &&
      config.sessionSecret &&
      config.sessionSecret.length >= MIN_SECRET_LENGTH,
  );
}

function sign(payload: string): string {
  return crypto.createHmac("sha256", config.sessionSecret!).update(payload).digest("base64url");
}

export function createSessionToken(userId: string, epoch = 0, nowMs = Date.now()): string {
  const payload = Buffer.from(JSON.stringify({ uid: userId, ep: epoch, exp: Math.floor(nowMs / 1000) + MAX_AGE_S })).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

/** The user id in a valid, unexpired token from the current epoch; otherwise null. */
export function verifySessionToken(token: string | undefined, epoch = 0, nowMs = Date.now()): string | null {
  if (!token || token.length > 1024 || !authConfigured()) return null;
  const [payload, sig, extra] = token.split(".");
  if (!payload || !sig || extra !== undefined) return null;
  const expected = Buffer.from(sign(payload));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !crypto.timingSafeEqual(expected, given)) return null;
  try {
    const { uid, exp, ep } = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (typeof uid !== "string" || typeof exp !== "number" || typeof ep !== "number") return null;
    if (exp * 1000 < nowMs || ep !== epoch) return null;
    return uid;
  } catch {
    return null;
  }
}

export function checkAccessCode(code: string): boolean {
  if (!authConfigured() || code.length > 256) return false;
  const a = crypto.createHash("sha256").update(code).digest();
  const b = crypto.createHash("sha256").update(config.accessCode!).digest();
  return crypto.timingSafeEqual(a, b);
}

/**
 * CSRF defence for state-changing requests. Browsers send Origin on every
 * cross-site POST; when it is absent, Fetch Metadata (Sec-Fetch-Site) must say
 * the request is same-origin or user-initiated. A request with neither header
 * comes from a non-browser client, which cannot carry the victim's cookie.
 */
export function originAllowed(h: { get(name: string): string | null }): boolean {
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const origin = h.get("origin");
  if (origin) {
    if (origin === "null" || !host) return false;
    try {
      return new URL(origin).host === host;
    } catch {
      return false;
    }
  }
  const site = h.get("sec-fetch-site");
  return site === null || site === "same-origin" || site === "none";
}

/**
 * Sign-in attempt limits, per client and globally, so neither rotating a
 * client address nor spreading attempts across addresses allows brute force.
 * In memory (per server process): enough for a single operator.
 */
export class LoginLimiter {
  private perClient = new Map<string, { count: number; resetAt: number }>();
  private global = { count: 0, resetAt: 0 };

  private readonly clientMax: number;
  private readonly globalMax: number;
  private readonly windowMs: number;
  private readonly maxClients: number;

  constructor(clientMax = 10, globalMax = 50, windowMs = 10 * 60_000, maxClients = 5_000) {
    this.clientMax = clientMax;
    this.globalMax = globalMax;
    this.windowMs = windowMs;
    this.maxClients = maxClients;
  }

  /**
   * Count an attempt before it is checked, so concurrent requests cannot all
   * slip under the limit. True when the attempt may proceed.
   */
  attempt(client: string, now = Date.now()): boolean {
    if (!this.allowed(client, now)) return false;
    this.failure(client, now);
    return true;
  }

  /** True when another attempt is allowed now. */
  allowed(client: string, now = Date.now()): boolean {
    if (this.global.resetAt > now && this.global.count >= this.globalMax) return false;
    const c = this.perClient.get(client);
    return !(c && c.resetAt > now && c.count >= this.clientMax);
  }

  failure(client: string, now = Date.now()): void {
    this.global = this.global.resetAt > now ? { count: this.global.count + 1, resetAt: this.global.resetAt } : { count: 1, resetAt: now + this.windowMs };
    const c = this.perClient.get(client);
    this.perClient.set(client, c && c.resetAt > now ? { count: c.count + 1, resetAt: c.resetAt } : { count: 1, resetAt: now + this.windowMs });
    if (this.perClient.size > this.maxClients) {
      for (const [k, v] of this.perClient) if (v.resetAt <= now) this.perClient.delete(k);
      while (this.perClient.size > this.maxClients) this.perClient.delete(this.perClient.keys().next().value!);
    }
  }

  /** A correct code clears this client's count (the attempt still counted globally). */
  success(client: string): void {
    this.perClient.delete(client);
  }
}
