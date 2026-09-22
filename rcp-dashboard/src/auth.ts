import { UserManager, WebStorageStateStore, type User } from "oidc-client-ts";

const mode = import.meta.env.VITE_AUTH_MODE ?? (import.meta.env.DEV ? "local" : "cognito");
const apiBase = import.meta.env.VITE_API_BASE_URL ?? "";
let localAccessToken: string | null = null;

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

export async function completeLogin(): Promise<User> {
  return cognitoManager().signinRedirectCallback();
}

export async function login(): Promise<void> {
  await cognitoManager().signinRedirect();
}

export async function logout(): Promise<void> {
  if (isLocalAuth()) {
    localAccessToken = null;
    return;
  }
  await cognitoManager().signoutRedirect();
}

async function localToken(): Promise<string> {
  if (localAccessToken) return localAccessToken;

  const response = await fetch(`${apiBase}/local/token`, { method: "POST" });
  if (!response.ok) throw new Error("The local development token could not be created");
  const body = (await response.json()) as { accessToken: string };
  localAccessToken = body.accessToken;
  return localAccessToken;
}

export async function accessToken(): Promise<string | null> {
  if (isLocalAuth()) return localToken();
  return (await cognitoManager().getUser())?.access_token ?? null;
}
