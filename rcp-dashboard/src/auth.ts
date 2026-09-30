import { User, UserManager, WebStorageStateStore } from "oidc-client-ts";

const mode = import.meta.env.VITE_AUTH_MODE ?? (import.meta.env.DEV ? "local" : "cognito");
const apiBase = import.meta.env.VITE_API_BASE_URL ?? "";
// Refresh a little early so a request never leaves with a token that expires in flight.
const EXPIRY_MARGIN_MS = 30_000;
// Survives reloads within the tab, so a demo visitor stays in the demo instead of dropping to the developer identity.
const DEMO_FLAG = "rcp.session.demo";
let localSession: { token: string; expiresAt: number } | null = null;

function createUserManager(): UserManager {
  const authority = import.meta.env.VITE_COGNITO_AUTHORITY;
  const clientId = import.meta.env.VITE_COGNITO_CLIENT_ID;
  if (!authority || !clientId) {
    throw new Error("Cognito authority and client ID are required in Cognito mode");
  }

  return new UserManager({
    authority,
    client_id: clientId,
    redirect_uri: `${window.location.origin}/auth/callback`,
    post_logout_redirect_uri: window.location.origin,
    response_type: "code",
    scope: "openid email profile",
    userStore: new WebStorageStateStore({ store: window.sessionStorage }),
    automaticSilentRenew: false,
  });
}

let manager: UserManager | null = null;

function cognitoManager(): UserManager {
  manager ??= createUserManager();
  return manager;
}

export function isLocalAuth(): boolean {
  return mode === "local";
}

function readFlag(): boolean {
  try {
    return sessionStorage.getItem(DEMO_FLAG) === "1";
  } catch {
    return false;
  }
}

function writeFlag(demo: boolean) {
  try {
    if (demo) sessionStorage.setItem(DEMO_FLAG, "1");
    else sessionStorage.removeItem(DEMO_FLAG);
  } catch {
    // Without storage the demo lasts for this page view only.
  }
}

/** Whether this tab is signed in as the shared read-only demo account. */
export function isDemoSession(): boolean {
  return readFlag();
}

/** Where to land after signing in: the page the operator was on, carried through the OIDC state. */
export async function completeLogin(): Promise<string> {
  writeFlag(false);
  const user = await cognitoManager().signinRedirectCallback();
  const next = typeof user.state === "string" ? user.state : "/";
  return safeNext(next);
}

export function safeNext(next: string | null | undefined): string {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
}

export async function login(next = "/"): Promise<void> {
  await cognitoManager().signinRedirect({ state: next });
}

type DemoTokens = { accessToken: string; idToken: string | null; expiresInSeconds: number };

async function requestDemoTokens(): Promise<DemoTokens> {
  const response = await fetch(`${apiBase}/api/demo/session`, { method: "POST", headers: { Accept: "application/json" } });
  if (response.status === 429) throw new Error("A lot of people are trying the demo right now. Try again in a minute.");
  if (!response.ok) throw new Error("The live demo is not available on this deployment.");
  return response.json() as Promise<DemoTokens>;
}

function claims(jwt: string | null): Record<string, unknown> {
  if (!jwt) return {};
  try {
    const payload = jwt.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(atob(payload.padEnd(payload.length + ((4 - (payload.length % 4)) % 4), "="))) as Record<string, unknown>;
  } catch {
    return {};
  }
}

/**
 * "Try the live demo": the server signs in as the shared read-only account and hands back its tokens. Locally they
 * replace the developer token; with Cognito they are stored like a normal sign-in, so every request path is the same.
 */
export async function startDemoSession(): Promise<void> {
  const tokens = await requestDemoTokens();
  writeFlag(true);
  if (isLocalAuth()) {
    localSession = { token: tokens.accessToken, expiresAt: Date.now() + tokens.expiresInSeconds * 1000 };
    return;
  }
  const profile = claims(tokens.idToken ?? tokens.accessToken);
  await cognitoManager().storeUser(new User({
    access_token: tokens.accessToken,
    id_token: tokens.idToken ?? undefined,
    token_type: "Bearer",
    scope: "openid",
    profile: { sub: String(profile.sub ?? "demo"), iss: String(profile.iss ?? ""), aud: String(profile.aud ?? ""), exp: Number(profile.exp ?? 0), iat: Number(profile.iat ?? 0), ...profile },
    expires_at: Math.floor(Date.now() / 1000) + tokens.expiresInSeconds,
  }));
}

export async function logout(): Promise<void> {
  const demo = readFlag();
  writeFlag(false);
  localSession = null;
  if (isLocalAuth() || demo) {
    // The demo holds no Cognito browser session, so leaving it only needs the stored tokens gone.
    if (!isLocalAuth()) await cognitoManager().removeUser();
    window.location.assign("/signin");
    return;
  }
  await cognitoManager().signoutRedirect();
}

let pendingLocalToken: Promise<string> | null = null;

// Parallel requests at page load share one token request instead of each minting their own.
function localToken(): Promise<string> {
  if (localSession && localSession.expiresAt - EXPIRY_MARGIN_MS > Date.now()) return Promise.resolve(localSession.token);
  pendingLocalToken ??= (async () => {
    try {
      if (readFlag()) {
        const tokens = await requestDemoTokens();
        localSession = { token: tokens.accessToken, expiresAt: Date.now() + tokens.expiresInSeconds * 1000 };
        return localSession.token;
      }
      const response = await fetch(`${apiBase}/local/token`, { method: "POST" });
      if (!response.ok) throw new Error("The local development token could not be created");
      const body = (await response.json()) as { accessToken: string; expiresInSeconds?: number };
      localSession = { token: body.accessToken, expiresAt: Date.now() + (body.expiresInSeconds ?? 300) * 1000 };
      return localSession.token;
    } finally {
      pendingLocalToken = null;
    }
  })();
  return pendingLocalToken;
}

/**
 * A usable access token, or null when the operator has to sign in again. An expired Cognito session is renewed
 * with its refresh token when possible, and an expired demo simply asks for a new demo session; otherwise the
 * session is cleared rather than sent and rejected.
 */
export async function accessToken(): Promise<string | null> {
  if (isLocalAuth()) return localToken();
  const users = cognitoManager();
  const user = await users.getUser();
  if (!user) return null;
  if (!user.expired && (user.expires_in ?? 0) * 1000 > EXPIRY_MARGIN_MS) return user.access_token;
  try {
    if (readFlag()) {
      await startDemoSession();
      return (await users.getUser())?.access_token ?? null;
    }
    return (await users.signinSilent())?.access_token ?? null;
  } catch {
    await users.removeUser();
    writeFlag(false);
    return null;
  }
}

/**
 * The API rejected the token (expired, revoked, or signed by a key the backend no longer trusts). Locally a fresh
 * development token fixes it; with Cognito the stored session is dropped and the operator is sent to sign in,
 * returning to the same page afterwards.
 */
export async function sessionRejected(): Promise<"retry" | "redirected"> {
  if (isLocalAuth()) {
    localSession = null;
    return "retry";
  }
  await cognitoManager().removeUser();
  writeFlag(false);
  redirectToSignIn();
  return "redirected";
}

export function redirectToSignIn(): void {
  const next = `${window.location.pathname}${window.location.search}`;
  if (window.location.pathname !== "/signin") window.location.assign(`/signin?next=${encodeURIComponent(next)}`);
}
