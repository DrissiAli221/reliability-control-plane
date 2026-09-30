import { UserManager, WebStorageStateStore } from "oidc-client-ts";

const mode = import.meta.env.VITE_AUTH_MODE ?? (import.meta.env.DEV ? "local" : "cognito");
const apiBase = import.meta.env.VITE_API_BASE_URL ?? "";
// Refresh a little early so a request never leaves with a token that expires in flight.
const EXPIRY_MARGIN_MS = 30_000;
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

/** Where to land after signing in: the page the operator was on, carried through the OIDC state. */
export async function completeLogin(): Promise<string> {
  const user = await cognitoManager().signinRedirectCallback();
  const next = typeof user.state === "string" ? user.state : "/";
  return next.startsWith("/") && !next.startsWith("//") ? next : "/";
}

export async function login(next = "/"): Promise<void> {
  await cognitoManager().signinRedirect({ state: next });
}

export async function logout(): Promise<void> {
  if (isLocalAuth()) {
    localSession = null;
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
 * with its refresh token when possible; otherwise it is cleared rather than sent and rejected.
 */
export async function accessToken(): Promise<string | null> {
  if (isLocalAuth()) return localToken();
  const users = cognitoManager();
  const user = await users.getUser();
  if (!user) return null;
  if (!user.expired && (user.expires_in ?? 0) * 1000 > EXPIRY_MARGIN_MS) return user.access_token;
  try {
    return (await users.signinSilent())?.access_token ?? null;
  } catch {
    await users.removeUser();
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
  redirectToSignIn();
  return "redirected";
}

export function redirectToSignIn(): void {
  const next = `${window.location.pathname}${window.location.search}`;
  if (window.location.pathname !== "/signin") window.location.assign(`/signin?next=${encodeURIComponent(next)}`);
}
