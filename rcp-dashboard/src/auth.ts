import {
  AuthenticationDetails,
  CognitoUser,
  CognitoUserAttribute,
  CognitoUserPool,
  type CognitoUserSession,
  type IAuthenticationCallback,
  type ICognitoStorage,
} from "amazon-cognito-identity-js";
import { ErrorResponse, User, UserManager, WebStorageStateStore } from "oidc-client-ts";

const mode = import.meta.env.VITE_AUTH_MODE ?? (import.meta.env.DEV ? "local" : "cognito");
const apiBase = import.meta.env.VITE_API_BASE_URL ?? "";
// Refresh a little early so a request never leaves with a token that expires in flight.
const EXPIRY_MARGIN_MS = 30_000;
// Survives reloads within the tab, so a demo visitor stays in the demo instead of dropping to the developer identity.
const DEMO_FLAG = "rcp.session.demo";
// Which kind of sign-in this tab holds, so logout knows whether Cognito's own browser session also has to be ended.
// "password" came from our sign-in page; anything else came through a redirect and left a Cognito cookie behind.
const KIND_KEY = "rcp.session.kind";
// A callback failure waits here for the sign-in page, so provider error text is never carried in a URL.
const ERROR_KEY = "rcp.auth.error";
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

function writeKind(kind: "password" | null) {
  try {
    if (kind) sessionStorage.setItem(KIND_KEY, kind);
    else sessionStorage.removeItem(KIND_KEY);
  } catch {
    // An unknown kind falls back to the redirect logout, which also clears the stored tokens.
  }
}

function readKind(): "password" | null {
  try {
    return sessionStorage.getItem(KIND_KEY) === "password" ? "password" : null;
  } catch {
    return null;
  }
}

function clearSessionMarks() {
  writeFlag(false);
  writeKind(null);
}

/** Whether this tab is signed in as the shared read-only demo account. */
export function isDemoSession(): boolean {
  return readFlag();
}

let callbackResult: Promise<string> | null = null;

function describeCallbackError(reason: unknown): string {
  if (reason instanceof ErrorResponse && reason.error === "access_denied") return "Sign-in was cancelled.";
  const detail = reason instanceof Error ? reason.message.trim() : "";
  return detail ? `Sign-in did not complete: ${detail}` : "Sign-in did not complete. Try again.";
}

/** The reason the last redirect sign-in failed, once: the sign-in page shows it and it is forgotten. */
export function takeAuthError(): string | null {
  try {
    const message = sessionStorage.getItem(ERROR_KEY);
    sessionStorage.removeItem(ERROR_KEY);
    return message;
  } catch {
    return null;
  }
}

/**
 * Where to land after a redirect sign-in: the page the operator was on, carried through the OIDC state. A failed
 * sign-in (a provider refusing, a cancelled consent screen) lands on the sign-in page with the reason remembered.
 * The result is shared so React's double-invoked effect cannot consume the one-time authorization response twice.
 */
export function completeLogin(): Promise<string> {
  callbackResult ??= (async () => {
    clearSessionMarks();
    try {
      const user = await cognitoManager().signinRedirectCallback();
      return safeNext(typeof user.state === "string" ? user.state : "/");
    } catch (reason) {
      try {
        sessionStorage.setItem(ERROR_KEY, describeCallbackError(reason));
      } catch {
        // The sign-in page then simply shows no reason.
      }
      return "/signin";
    }
  })();
  return callbackResult;
}

export function safeNext(next: string | null | undefined): string {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
}

const KNOWN_PROVIDERS = ["Google", "GitHub"] as const;
export type SocialProvider = (typeof KNOWN_PROVIDERS)[number];

/** The identity providers this deployment has configured in Cognito, from the comma list in VITE_SOCIAL_PROVIDERS. */
export function socialProviders(): SocialProvider[] {
  const listed = String(import.meta.env.VITE_SOCIAL_PROVIDERS ?? "")
    .split(",")
    .map((name) => name.trim().toLowerCase());
  return KNOWN_PROVIDERS.filter((name) => listed.includes(name.toLowerCase()));
}

/** Sends the browser straight to the provider, skipping Cognito's hosted page. */
export async function socialLogin(provider: SocialProvider, next = "/"): Promise<void> {
  await cognitoManager().signinRedirect({ state: next, extraQueryParams: { identity_provider: provider } });
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

function userFromTokens(tokens: { accessToken: string; idToken: string | null; refreshToken?: string; scope: string; expiresAt: number }): User {
  const profile = claims(tokens.idToken ?? tokens.accessToken);
  return new User({
    access_token: tokens.accessToken,
    id_token: tokens.idToken ?? undefined,
    refresh_token: tokens.refreshToken,
    token_type: "Bearer",
    scope: tokens.scope,
    profile: { sub: String(profile.sub ?? "demo"), iss: String(profile.iss ?? ""), aud: String(profile.aud ?? ""), exp: Number(profile.exp ?? 0), iat: Number(profile.iat ?? 0), ...profile },
    expires_at: tokens.expiresAt,
  });
}

/**
 * "Try the live demo": the server signs in as the shared read-only account and hands back its tokens. Locally they
 * replace the developer token; with Cognito they are stored like a normal sign-in, so every request path is the same.
 */
export async function startDemoSession(): Promise<void> {
  const tokens = await requestDemoTokens();
  clearSessionMarks();
  writeFlag(true);
  if (isLocalAuth()) {
    localSession = { token: tokens.accessToken, expiresAt: Date.now() + tokens.expiresInSeconds * 1000 };
    return;
  }
  await cognitoManager().storeUser(userFromTokens({
    accessToken: tokens.accessToken,
    idToken: tokens.idToken,
    scope: "openid",
    expiresAt: Math.floor(Date.now() / 1000) + tokens.expiresInSeconds,
  }));
}

// Kept until the sign-in page moves to its own form.
export async function login(next = "/"): Promise<void> {
  await cognitoManager().signinRedirect({ state: next });
}

// ---------- Email and password, on our own page ----------

/** A failed account step with a message fit to show, and Cognito's error name for the few cases a page reacts to. */
export class AuthError extends Error {
  constructor(message: string, readonly code: string) {
    super(message);
    this.name = "AuthError";
  }
}

const FRIENDLY: Record<string, string> = {
  NotAuthorizedException: "Incorrect email or password.",
  UserNotFoundException: "Incorrect email or password.",
  UserNotConfirmedException: "This email has not been confirmed yet.",
  CodeMismatchException: "That code is not right. Check it and try again.",
  ExpiredCodeException: "That code has expired. Ask for a new one.",
  InvalidPasswordException: "That password does not meet the policy.",
  UsernameExistsException: "An account with this email already exists. Sign in instead.",
  InvalidParameterException: "Check the email and password and try again.",
  LimitExceededException: "Too many attempts. Wait a few minutes and try again.",
  TooManyRequestsException: "Too many attempts. Wait a few minutes and try again.",
  TooManyFailedAttemptsException: "Too many attempts. Wait a few minutes and try again.",
  PasswordResetRequiredException: "This account needs a password reset. Use “Forgot password?”.",
  EnableSoftwareTokenMFAException: "That code is not right. Check it and try again.",
};

function authError(reason: unknown): AuthError {
  if (reason instanceof AuthError) return reason;
  const raw = reason as { code?: string; name?: string; message?: string } | null;
  const code = raw?.code ?? raw?.name ?? "Unknown";
  if (code === "NetworkError" || raw?.message === "Network error") return new AuthError("Could not reach the sign-in service. Check your connection.", "NetworkError");
  return new AuthError(FRIENDLY[code] ?? (raw?.message || "Something went wrong. Try again."), code);
}

// The library would otherwise keep its tokens in localStorage; ours live in the oidc store for this tab only.
function memoryStorage(): ICognitoStorage {
  const items = new Map<string, string>();
  return {
    setItem: (key, value) => void items.set(key, value),
    getItem: (key) => items.get(key) ?? null,
    removeItem: (key) => void items.delete(key),
    clear: () => items.clear(),
  };
}

/** The user pool and region, read from the issuer URL that already configures the OIDC client. */
function poolConfig(): { poolId: string; region: string; clientId: string } {
  const authority = import.meta.env.VITE_COGNITO_AUTHORITY;
  const clientId = import.meta.env.VITE_COGNITO_CLIENT_ID;
  const match = /^https:\/\/cognito-idp\.([a-z0-9-]+)\.amazonaws\.com\/([\w-]+)\/?$/.exec(authority ?? "");
  if (!match || !clientId) throw new Error("Cognito authority and client ID are required in Cognito mode");
  return { region: match[1], poolId: match[2], clientId };
}

let storage: ICognitoStorage | null = null;

function cognitoUser(email: string): CognitoUser {
  const { poolId, clientId } = poolConfig();
  storage ??= memoryStorage();
  const pool = new CognitoUserPool({ UserPoolId: poolId, ClientId: clientId, Storage: storage });
  return new CognitoUser({ Username: email.trim().toLowerCase(), Pool: pool, Storage: storage });
}

/** What the sign-in page should show next: the app, or a challenge Cognito wants answered first. */
export type SignInStep = "signedIn" | "mfa" | "newPassword";

let challenged: { user: CognitoUser; mfaType: string } | null = null;

async function storePasswordSession(session: CognitoUserSession): Promise<void> {
  const accessToken = session.getAccessToken().getJwtToken();
  const access = claims(accessToken);
  clearSessionMarks();
  writeKind("password");
  await cognitoManager().storeUser(userFromTokens({
    accessToken,
    idToken: session.getIdToken().getJwtToken(),
    refreshToken: session.getRefreshToken().getToken(),
    // Refreshing asks the token endpoint for this scope again, and it may only name scopes the sign-in granted.
    scope: typeof access.scope === "string" && access.scope ? access.scope : "aws.cognito.signin.user.admin",
    expiresAt: Number(access.exp) || Math.floor(Date.now() / 1000) + 3600,
  }));
}

function stepCallbacks(user: CognitoUser, resolve: (step: SignInStep) => void, reject: (reason: AuthError) => void): IAuthenticationCallback {
  const unsupported = () => reject(new AuthError("This account needs a sign-in step this page does not support yet.", "UnsupportedChallenge"));
  return {
    onSuccess: (session) => {
      challenged = null;
      storePasswordSession(session).then(() => resolve("signedIn"), (reason) => reject(authError(reason)));
    },
    onFailure: (reason) => reject(authError(reason)),
    totpRequired: () => {
      challenged = { user, mfaType: "SOFTWARE_TOKEN_MFA" };
      resolve("mfa");
    },
    mfaRequired: () => {
      challenged = { user, mfaType: "SMS_MFA" };
      resolve("mfa");
    },
    newPasswordRequired: () => {
      challenged = { user, mfaType: "" };
      resolve("newPassword");
    },
    mfaSetup: unsupported,
    selectMFAType: unsupported,
    customChallenge: unsupported,
  };
}

/** SRP sign-in: the password never leaves the browser, only a proof of it does. */
export function passwordSignIn(email: string, password: string): Promise<SignInStep> {
  return new Promise((resolve, reject) => {
    try {
      const user = cognitoUser(email);
      user.authenticateUser(new AuthenticationDetails({ Username: email.trim().toLowerCase(), Password: password }), stepCallbacks(user, resolve, reject));
    } catch (reason) {
      reject(authError(reason));
    }
  });
}

/** The 6-digit code from the authenticator app, for the sign-in that just asked for it. */
export function submitMfaCode(code: string): Promise<SignInStep> {
  return new Promise((resolve, reject) => {
    if (!challenged) return reject(new AuthError("That sign-in timed out. Start again.", "NoChallenge"));
    const { user, mfaType } = challenged;
    user.sendMFACode(code.trim(), stepCallbacks(user, resolve, reject), mfaType);
  });
}

/** Sets the permanent password for an account created with a temporary one. */
export function submitNewPassword(newPassword: string): Promise<SignInStep> {
  return new Promise((resolve, reject) => {
    if (!challenged) return reject(new AuthError("That sign-in timed out. Start again.", "NoChallenge"));
    const { user } = challenged;
    user.completeNewPasswordChallenge(newPassword, {}, stepCallbacks(user, resolve, reject));
  });
}

/** Creates the account; Cognito emails a confirmation code. */
export function signUp(email: string, password: string): Promise<void> {
  return new Promise((resolve, reject) => {
    try {
      const { poolId, clientId } = poolConfig();
      storage ??= memoryStorage();
      const pool = new CognitoUserPool({ UserPoolId: poolId, ClientId: clientId, Storage: storage });
      const address = email.trim().toLowerCase();
      pool.signUp(address, password, [new CognitoUserAttribute({ Name: "email", Value: address })], [], (reason) => (reason ? reject(authError(reason)) : resolve()));
    } catch (reason) {
      reject(authError(reason));
    }
  });
}

export function confirmSignUp(email: string, code: string): Promise<void> {
  return new Promise((resolve, reject) => {
    try {
      cognitoUser(email).confirmRegistration(code.trim(), true, (reason) => (reason ? reject(authError(reason)) : resolve()));
    } catch (reason) {
      reject(authError(reason));
    }
  });
}

export function resendSignUpCode(email: string): Promise<void> {
  return new Promise((resolve, reject) => {
    try {
      cognitoUser(email).resendConfirmationCode((reason) => (reason ? reject(authError(reason)) : resolve()));
    } catch (reason) {
      reject(authError(reason));
    }
  });
}

/**
 * Asks Cognito to email a reset code. Whether the address has an account is never revealed (the pool hides it), so
 * a missing account resolves like a real one and the page can always show the same neutral message.
 */
export function startPasswordReset(email: string): Promise<void> {
  return new Promise((resolve, reject) => {
    try {
      cognitoUser(email).forgotPassword({
        onSuccess: () => resolve(),
        onFailure: (reason) => {
          const error = authError(reason);
          if (error.code === "UserNotFoundException" || error.code === "InvalidParameterException") resolve();
          else reject(error);
        },
      });
    } catch (reason) {
      reject(authError(reason));
    }
  });
}

export function finishPasswordReset(email: string, code: string, newPassword: string): Promise<void> {
  return new Promise((resolve, reject) => {
    try {
      cognitoUser(email).confirmPassword(code.trim(), newPassword, { onSuccess: () => resolve(), onFailure: (reason) => reject(authError(reason)) });
    } catch (reason) {
      reject(authError(reason));
    }
  });
}

/** Ends the refresh token at Cognito so a copied one stops working. Best effort: leaving never waits on it. */
async function revokeRefreshToken(token: string): Promise<void> {
  try {
    const { region, clientId } = poolConfig();
    await fetch(`https://cognito-idp.${region}.amazonaws.com/`, {
      method: "POST",
      headers: { "Content-Type": "application/x-amz-json-1.1", "X-Amz-Target": "AWSCognitoIdentityProviderService.RevokeToken" },
      body: JSON.stringify({ Token: token, ClientId: clientId }),
      signal: AbortSignal.timeout(3000),
    });
  } catch {
    // The token expires on its own; signing out locally still happens.
  }
}

export async function logout(): Promise<void> {
  const demo = readFlag();
  const password = readKind() === "password";
  clearSessionMarks();
  localSession = null;
  if (isLocalAuth() || demo || password) {
    // These sessions hold no Cognito browser cookie, so leaving only needs the stored tokens gone.
    if (!isLocalAuth()) {
      const user = await cognitoManager().getUser();
      if (password && user?.refresh_token) await revokeRefreshToken(user.refresh_token);
      await cognitoManager().removeUser();
    }
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
 * with its refresh token when possible (password and redirect sign-ins alike, through the token endpoint's refresh
 * grant), and an expired demo simply asks for a new demo session; otherwise the session is cleared rather than sent
 * and rejected.
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
    clearSessionMarks();
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
  clearSessionMarks();
  redirectToSignIn();
  return "redirected";
}

export function redirectToSignIn(): void {
  const next = `${window.location.pathname}${window.location.search}`;
  if (window.location.pathname !== "/signin") window.location.assign(`/signin?next=${encodeURIComponent(next)}`);
}
