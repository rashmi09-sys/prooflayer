import { cookies, headers } from "next/headers";
import { config } from "./config.ts";
import { bumpSessionEpoch, ensureUser, getSessionEpoch, getUser } from "./store.ts";
import { MAX_AGE_S, authConfigured, checkAccessCode, createSessionToken, originAllowed, sessionCookie, verifySessionToken } from "./session.ts";

// Operator authentication. One account, unlocked with an access code from the
// server environment; HMAC-signed, httpOnly, SameSite=Lax cookies; every data
// read is additionally scoped to the session user's id. Disabled entirely in
// the public demo (authConfigured() is false there).

export { authConfigured };

function secureCookies(): boolean {
  return process.env.NODE_ENV === "production" && process.env.PROOFLAYER_INSECURE_COOKIES !== "1";
}

export async function signIn(code: string): Promise<boolean> {
  if (!checkAccessCode(code)) return false;
  const userId = ensureUser(config.operatorEmail, "Operator");
  const jar = await cookies();
  jar.set(sessionCookie(secureCookies()), createSessionToken(userId, getSessionEpoch()), {
    httpOnly: true,
    sameSite: "lax",
    secure: secureCookies(),
    path: "/",
    maxAge: MAX_AGE_S,
  });
  return true;
}

/** Clears the cookie and revokes every session issued so far, including copies of this one. */
export async function signOut(): Promise<void> {
  if (authConfigured()) bumpSessionEpoch();
  (await cookies()).delete(sessionCookie(secureCookies()));
}

export async function currentUser() {
  if (!authConfigured()) return null;
  const uid = verifySessionToken((await cookies()).get(sessionCookie(secureCookies()))?.value, getSessionEpoch());
  return uid ? getUser(uid) : null;
}

/** For state-changing routes: reject cross-site requests (see originAllowed). */
export async function sameOrigin(): Promise<boolean> {
  return originAllowed(await headers());
}
