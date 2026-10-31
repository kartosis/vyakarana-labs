/**
 * Passwordless sign-in with Amazon Cognito (Essentials, USER_AUTH + EMAIL_OTP), using plain fetch.
 *
 * Token handling (docs/ARCHITECTURE.md §4.1):
 *   - the refresh token goes straight to POST /api/v1/auth/session and lives in an HttpOnly cookie;
 *   - the short-lived access token is kept in sessionStorage for this tab only;
 *   - a localStorage flag remembers that a cookie exists, so guests never trigger refresh calls.
 */
import { getConfig } from "./config";

const SESSION_KEY = "vl:session";
const FLAG_KEY = "vl:signedIn";
const PENDING_KEY = "vl:pending";
/** How long a half-finished sign-in can be resumed after a reload (Cognito's own limits still apply). */
const PENDING_TTL_MS = 15 * 60 * 1000;

interface Stored {
  accessToken: string;
  expiresAt: number;
}

export class AuthError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

const store = {
  get(): Stored | null {
    try {
      const raw = sessionStorage.getItem(SESSION_KEY);
      return raw ? (JSON.parse(raw) as Stored) : null;
    } catch {
      return null;
    }
  },
  set(s: Stored | null) {
    try {
      if (s) sessionStorage.setItem(SESSION_KEY, JSON.stringify(s));
      else sessionStorage.removeItem(SESSION_KEY);
    } catch {}
  },
  flag(on?: boolean): boolean {
    try {
      if (on === true) localStorage.setItem(FLAG_KEY, "1");
      if (on === false) localStorage.removeItem(FLAG_KEY);
      return localStorage.getItem(FLAG_KEY) === "1";
    } catch {
      return false;
    }
  },
};

export const maybeSignedIn = (): boolean => store.flag();

async function cognito<T>(target: string, body: Record<string, unknown>): Promise<T> {
  const cfg = await getConfig();
  if (!cfg.accounts || !cfg.clientId) throw new AuthError("Unavailable", "Accounts are not open yet.");
  const res = await fetch(`https://cognito-idp.${cfg.region}.amazonaws.com/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-amz-json-1.1",
      "X-Amz-Target": `AWSCognitoIdentityProviderService.${target}`,
    },
    body: JSON.stringify({ ClientId: cfg.clientId, ...body }),
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const code = String(data.__type ?? "Error").split("#").pop()!;
    throw new AuthError(code, friendly(code, String(data.message ?? "")));
  }
  return data as T;
}

function friendly(code: string, message: string): string {
  switch (code) {
    case "CodeMismatchException":
      return "That code is not right. Check the latest email and try again.";
    case "ExpiredCodeException":
      return "That code has expired. Ask for a new one.";
    case "LimitExceededException":
    case "TooManyRequestsException":
      return "Too many attempts. Wait a few minutes, then try again.";
    case "InvalidParameterException":
      return message.includes("email") ? "Enter a valid email address." : message;
    case "NotAuthorizedException":
      return "Sign-in was not accepted. Ask for a new code.";
    default:
      return message || "Something went wrong. Try again.";
  }
}

export type Pending =
  | { kind: "signup"; email: string }
  | { kind: "signin"; email: string; session: string };

interface AuthResult {
  AuthenticationResult?: { AccessToken: string; RefreshToken?: string; ExpiresIn: number };
  ChallengeName?: string;
  Session?: string;
}

const randomPassword = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(24)), (b) => b.toString(16).padStart(2, "0")).join("") + "aA1!";

/** Step 1: send a code. New addresses get a sign-up code, known ones a sign-in code. */
export async function requestCode(emailRaw: string): Promise<Pending> {
  const email = emailRaw.trim().toLowerCase();
  const attrs = { Username: email, UserAttributes: [{ Name: "email", Value: email }] };
  try {
    try {
      await cognito("SignUp", attrs);
    } catch (e) {
      // Pools that still insist on a password get a random one the learner never needs.
      if (e instanceof AuthError && e.code === "InvalidParameterException" && /password/i.test(e.message)) {
        await cognito("SignUp", { ...attrs, Password: randomPassword() });
      } else throw e;
    }
    return { kind: "signup", email };
  } catch (e) {
    if (!(e instanceof AuthError) || e.code !== "UsernameExistsException") throw e;
  }
  let r: AuthResult;
  try {
    r = await cognito<AuthResult>("InitiateAuth", {
      AuthFlow: "USER_AUTH",
      AuthParameters: { USERNAME: email, PREFERRED_CHALLENGE: "EMAIL_OTP" },
    });
  } catch (e) {
    // A sign-up that was started but never confirmed (the page was closed before the code was entered): send the
    // confirmation code again and let the learner finish signing up (external review #5).
    if (e instanceof AuthError && e.code === "UserNotConfirmedException") {
      await cognito("ResendConfirmationCode", { Username: email });
      return { kind: "signup", email };
    }
    throw e;
  }
  if (r.ChallengeName !== "EMAIL_OTP" || !r.Session) throw new AuthError("Unexpected", "Unexpected sign-in step.");
  return { kind: "signin", email, session: r.Session };
}

/** Keep a half-finished sign-in for this tab, so a reload can still finish it. */
export function savePending(p: Pending | null): void {
  try {
    if (p) sessionStorage.setItem(PENDING_KEY, JSON.stringify({ p, at: Date.now() }));
    else sessionStorage.removeItem(PENDING_KEY);
  } catch {}
}

export function loadPending(): Pending | null {
  try {
    const raw = sessionStorage.getItem(PENDING_KEY);
    if (!raw) return null;
    const { p, at } = JSON.parse(raw) as { p: Pending; at: number };
    if (Date.now() - at > PENDING_TTL_MS) {
      sessionStorage.removeItem(PENDING_KEY);
      return null;
    }
    return p;
  } catch {
    return null;
  }
}

/**
 * Where to go after signing in: the `next` parameter if it resolves to this site, else the dashboard.
 * Parsed with URL, so tricks like "/\\evil.example" (which browsers read as https://evil.example/) are refused
 * (external review #6).
 */
export function safeNext(search: string, origin: string): string {
  const raw = new URLSearchParams(search).get("next") ?? "/me/";
  try {
    const u = new URL(raw, origin);
    if (u.origin === origin) return u.pathname + u.search + u.hash;
  } catch {}
  return "/me/";
}

/** Step 2: exchange the emailed code for tokens, then hand the refresh token to the API cookie. */
export async function confirmCode(p: Pending, code: string): Promise<void> {
  let result: AuthResult;
  if (p.kind === "signup") {
    const c = await cognito<{ Session?: string }>("ConfirmSignUp", { Username: p.email, ConfirmationCode: code.trim() });
    result = await cognito<AuthResult>("InitiateAuth", {
      AuthFlow: "USER_AUTH",
      AuthParameters: { USERNAME: p.email },
      Session: c.Session,
    });
  } else {
    result = await cognito<AuthResult>("RespondToAuthChallenge", {
      ChallengeName: "EMAIL_OTP",
      Session: p.session,
      ChallengeResponses: { USERNAME: p.email, EMAIL_OTP_CODE: code.trim() },
    });
  }
  const a = result.AuthenticationResult;
  if (!a) throw new AuthError("Unexpected", "Sign-in did not finish. Ask for a new code.");
  store.set({ accessToken: a.AccessToken, expiresAt: Date.now() + (a.ExpiresIn - 60) * 1000 });
  store.flag(true);
  if (a.RefreshToken) {
    const { api } = await import("./api");
    await api("/api/v1/auth/session", { method: "POST", body: { refreshToken: a.RefreshToken } });
  }
}

/** A valid access token, refreshing through the HttpOnly cookie when needed. */
export async function accessToken(): Promise<string | null> {
  const s = store.get();
  if (s && s.expiresAt > Date.now()) return s.accessToken;
  if (!store.flag()) return null;
  const { signedBody } = await import("./api");
  let res: Response;
  try {
    res = await fetch("/api/v1/auth/refresh", { method: "POST", credentials: "same-origin", ...(await signedBody("")) });
  } catch {
    return null; // offline: stay signed in, try again later
  }
  if (!res.ok) {
    // Only a rejected refresh token ends the session; an outage (5xx, 429) keeps it for the next attempt
    // (external review #18).
    if (res.status >= 400 && res.status < 500 && res.status !== 429) {
      store.flag(false);
      store.set(null);
    }
    return null;
  }
  const t = (await res.json()) as { accessToken: string; expiresIn: number };
  store.set({ accessToken: t.accessToken, expiresAt: Date.now() + (t.expiresIn - 60) * 1000 });
  return t.accessToken;
}

export async function signOut(): Promise<void> {
  const { signedBody } = await import("./api");
  await fetch("/api/v1/auth/logout", { method: "POST", credentials: "same-origin", ...(await signedBody("")) }).catch(() => {});
  store.set(null);
  store.flag(false);
}
