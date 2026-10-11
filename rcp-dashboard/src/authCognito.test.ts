import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Cognito mode with both libraries replaced: what matters here is what auth.ts asks of them and what it stores.
const cognito = vi.hoisted(() => ({
  authenticateUser: vi.fn(),
  sendMFACode: vi.fn(),
  completeNewPasswordChallenge: vi.fn(),
  forgotPassword: vi.fn(),
  confirmPassword: vi.fn(),
  confirmRegistration: vi.fn(),
  resendConfirmationCode: vi.fn(),
  signUp: vi.fn(),
}));
const oidc = vi.hoisted(() => ({
  storeUser: vi.fn(),
  getUser: vi.fn(),
  removeUser: vi.fn(),
  signoutRedirect: vi.fn(),
  signinRedirect: vi.fn(),
  signinRedirectCallback: vi.fn(),
  signinSilent: vi.fn(),
}));

vi.mock("amazon-cognito-identity-js", () => ({
  AuthenticationDetails: class { constructor(readonly data: unknown) {} },
  CognitoUserAttribute: class { constructor(readonly data: unknown) {} },
  CognitoUserPool: class {
    signUp = cognito.signUp;
  },
  CognitoUser: class {
    authenticateUser = cognito.authenticateUser;
    sendMFACode = cognito.sendMFACode;
    completeNewPasswordChallenge = cognito.completeNewPasswordChallenge;
    forgotPassword = cognito.forgotPassword;
    confirmPassword = cognito.confirmPassword;
    confirmRegistration = cognito.confirmRegistration;
    resendConfirmationCode = cognito.resendConfirmationCode;
  },
}));

vi.mock("oidc-client-ts", () => ({
  User: class {
    constructor(init: object) {
      Object.assign(this, init);
    }
  },
  ErrorResponse: class extends Error {
    error = "";
  },
  WebStorageStateStore: class {},
  UserManager: class {
    storeUser = oidc.storeUser;
    getUser = oidc.getUser;
    removeUser = oidc.removeUser;
    signoutRedirect = oidc.signoutRedirect;
    signinRedirect = oidc.signinRedirect;
    signinRedirectCallback = oidc.signinRedirectCallback;
    signinSilent = oidc.signinSilent;
  },
}));

const jwt = (payload: object) => `h.${btoa(JSON.stringify(payload)).replace(/=+$/, "")}.s`;
const EXP = 1_900_000_000;
const session = {
  getAccessToken: () => ({ getJwtToken: () => jwt({ sub: "u1", exp: EXP, scope: "aws.cognito.signin.user.admin" }) }),
  getIdToken: () => ({ getJwtToken: () => jwt({ sub: "u1", email: "ali@example.com", iss: "issuer", aud: "client", exp: EXP, iat: 1 }) }),
  getRefreshToken: () => ({ getToken: () => "refresh-1" }),
};

type Auth = typeof import("./auth");
let auth: Auth;
const assign = vi.fn();

beforeEach(async () => {
  vi.stubEnv("VITE_AUTH_MODE", "cognito");
  vi.stubEnv("VITE_COGNITO_AUTHORITY", "https://cognito-idp.us-east-1.amazonaws.com/us-east-1_Pool123");
  vi.stubEnv("VITE_COGNITO_CLIENT_ID", "client-1");
  vi.stubGlobal("location", { ...window.location, assign });
  sessionStorage.clear();
  vi.resetModules();
  auth = await import("./auth");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  Object.values(cognito).forEach((mock) => mock.mockReset());
  Object.values(oidc).forEach((mock) => mock.mockReset());
});

describe("password sign-in", () => {
  it("stores the SRP tokens as an oidc user that refreshes like any other and clears the demo flag", async () => {
    sessionStorage.setItem("rcp.session.demo", "1");
    cognito.authenticateUser.mockImplementation((_details, callbacks) => callbacks.onSuccess(session));

    await expect(auth.passwordSignIn(" Ali@Example.com ", "Correct-Horse-1!")).resolves.toBe("signedIn");

    const stored = oidc.storeUser.mock.calls[0][0];
    expect(stored).toMatchObject({ refresh_token: "refresh-1", expires_at: EXP, token_type: "Bearer", scope: "aws.cognito.signin.user.admin" });
    expect(stored.profile).toMatchObject({ sub: "u1", email: "ali@example.com" });
    expect(auth.isDemoSession()).toBe(false);
    expect(sessionStorage.getItem("rcp.session.kind")).toBe("password");
  });

  it("asks for the authenticator code and answers with it as a software-token challenge", async () => {
    cognito.authenticateUser.mockImplementation((_details, callbacks) => callbacks.totpRequired("SOFTWARE_TOKEN_MFA", {}));
    cognito.sendMFACode.mockImplementation((_code, callbacks) => callbacks.onSuccess(session));

    await expect(auth.passwordSignIn("ali@example.com", "pw")).resolves.toBe("mfa");
    await expect(auth.submitMfaCode("123456")).resolves.toBe("signedIn");

    expect(cognito.sendMFACode).toHaveBeenCalledWith("123456", expect.anything(), "SOFTWARE_TOKEN_MFA");
    expect(oidc.storeUser).toHaveBeenCalledTimes(1);
  });

  it("sets a permanent password when Cognito requires one", async () => {
    cognito.authenticateUser.mockImplementation((_details, callbacks) => callbacks.newPasswordRequired({}, []));
    cognito.completeNewPasswordChallenge.mockImplementation((_password, _attributes, callbacks) => callbacks.onSuccess(session));

    await expect(auth.passwordSignIn("ali@example.com", "temporary")).resolves.toBe("newPassword");
    await expect(auth.submitNewPassword("Brand-New-Passw0rd!")).resolves.toBe("signedIn");

    expect(cognito.completeNewPasswordChallenge).toHaveBeenCalledWith("Brand-New-Passw0rd!", {}, expect.anything());
  });

  it("turns Cognito failures into messages that do not say which half was wrong", async () => {
    cognito.authenticateUser.mockImplementation((_details, callbacks) => callbacks.onFailure({ code: "NotAuthorizedException", message: "Incorrect username or password." }));

    await expect(auth.passwordSignIn("ali@example.com", "wrong")).rejects.toMatchObject({ message: "Incorrect email or password.", code: "NotAuthorizedException" });
    expect(oidc.storeUser).not.toHaveBeenCalled();
  });

  it("reports an answer to a challenge that was never asked", async () => {
    await expect(auth.submitMfaCode("123456")).rejects.toMatchObject({ code: "NoChallenge" });
  });
});

describe("account creation and recovery", () => {
  it("creates the account with the email as username and attribute, then confirms and resends codes", async () => {
    cognito.signUp.mockImplementation((_user, _password, _attributes, _validation, done) => done(null, {}));
    cognito.confirmRegistration.mockImplementation((_code, _force, done) => done(null, "SUCCESS"));
    cognito.resendConfirmationCode.mockImplementation((done) => done(null, {}));

    await auth.signUp("Ali@Example.com", "Correct-Horse-1!");
    expect(cognito.signUp.mock.calls[0].slice(0, 2)).toEqual(["ali@example.com", "Correct-Horse-1!"]);
    expect(cognito.signUp.mock.calls[0][2][0].data).toEqual({ Name: "email", Value: "ali@example.com" });
    await auth.confirmSignUp("ali@example.com", " 123456 ");
    expect(cognito.confirmRegistration).toHaveBeenCalledWith("123456", true, expect.any(Function));
    await auth.resendSignUpCode("ali@example.com");
    expect(cognito.resendConfirmationCode).toHaveBeenCalled();
  });

  it("explains a duplicate account and an unconfirmed one by code", async () => {
    cognito.signUp.mockImplementation((_u, _p, _a, _v, done) => done({ code: "UsernameExistsException" }));
    await expect(auth.signUp("ali@example.com", "pw")).rejects.toMatchObject({ message: expect.stringContaining("already exists") });

    cognito.authenticateUser.mockImplementation((_details, callbacks) => callbacks.onFailure({ code: "UserNotConfirmedException" }));
    await expect(auth.passwordSignIn("ali@example.com", "pw")).rejects.toMatchObject({ code: "UserNotConfirmedException" });
  });

  it("treats a reset for an unknown address like a real one", async () => {
    cognito.forgotPassword.mockImplementation((callbacks) => callbacks.onFailure({ code: "UserNotFoundException" }));
    await expect(auth.startPasswordReset("nobody@example.com")).resolves.toBeUndefined();

    cognito.forgotPassword.mockImplementation((callbacks) => callbacks.onFailure({ code: "LimitExceededException" }));
    await expect(auth.startPasswordReset("ali@example.com")).rejects.toMatchObject({ message: expect.stringContaining("Too many attempts") });
  });

  it("sets the new password with the emailed code", async () => {
    cognito.confirmPassword.mockImplementation((_code, _password, callbacks) => callbacks.onSuccess());
    await auth.finishPasswordReset("ali@example.com", "654321", "Brand-New-Passw0rd!");
    expect(cognito.confirmPassword).toHaveBeenCalledWith("654321", "Brand-New-Passw0rd!", expect.anything());
  });
});

describe("social sign-in", () => {
  it("offers only the configured providers it knows how to draw", () => {
    vi.stubEnv("VITE_SOCIAL_PROVIDERS", "");
    expect(auth.socialProviders()).toEqual([]);
    vi.stubEnv("VITE_SOCIAL_PROVIDERS", " google , GitHub,Facebook");
    expect(auth.socialProviders()).toEqual(["Google", "GitHub"]);
  });

  it("skips the hosted page by naming the provider and keeps the return address", async () => {
    await auth.socialLogin("GitHub", "/pipeline");
    expect(oidc.signinRedirect).toHaveBeenCalledWith({ state: "/pipeline", extraQueryParams: { identity_provider: "GitHub" } });
  });

  it("returns to the sign-in page with the provider's reason, shown once", async () => {
    oidc.signinRedirectCallback.mockRejectedValue(new Error("Email already linked to another sign-in"));

    await expect(auth.completeLogin()).resolves.toBe("/signin");
    expect(auth.takeAuthError()).toBe("Sign-in did not complete: Email already linked to another sign-in");
    expect(auth.takeAuthError()).toBeNull();
  });

  it("lands on the page the visitor wanted after a good callback", async () => {
    oidc.signinRedirectCallback.mockResolvedValue({ state: "/pipeline" });
    await expect(auth.completeLogin()).resolves.toBe("/pipeline");
  });
});

describe("signing out", () => {
  it("revokes the refresh token of a password session and goes straight to our page", async () => {
    sessionStorage.setItem("rcp.session.kind", "password");
    oidc.getUser.mockResolvedValue({ refresh_token: "refresh-1" });
    const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}"));

    await auth.logout();

    const [url, init] = fetch.mock.calls[0];
    expect(String(url)).toBe("https://cognito-idp.us-east-1.amazonaws.com/");
    expect((init?.headers as Record<string, string>)["X-Amz-Target"]).toBe("AWSCognitoIdentityProviderService.RevokeToken");
    expect(JSON.parse(String(init?.body))).toEqual({ Token: "refresh-1", ClientId: "client-1" });
    expect(oidc.removeUser).toHaveBeenCalled();
    expect(assign).toHaveBeenCalledWith("/signin");
    expect(oidc.signoutRedirect).not.toHaveBeenCalled();
    expect(sessionStorage.getItem("rcp.session.kind")).toBeNull();
  });

  it("still leaves when the revoke call fails", async () => {
    sessionStorage.setItem("rcp.session.kind", "password");
    oidc.getUser.mockResolvedValue({ refresh_token: "refresh-1" });
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("offline"));

    await auth.logout();
    expect(assign).toHaveBeenCalledWith("/signin");
  });

  it("ends Cognito's own browser session for a redirect sign-in", async () => {
    await auth.logout();
    expect(oidc.signoutRedirect).toHaveBeenCalledWith({ post_logout_redirect_uri: "", extraQueryParams: {
      client_id: "client-1", logout_uri: window.location.origin,
    } });
    expect(assign).not.toHaveBeenCalled();

    // Build the actual library URL with an ID token (the case that suppresses its client_id).
    const { OidcClient } = await vi.importActual<typeof import("oidc-client-ts")>("oidc-client-ts");
    const client = new OidcClient({
      authority: "https://issuer.example", client_id: "client-1", redirect_uri: "https://app.example/auth/callback",
      post_logout_redirect_uri: window.location.origin,
      metadata: { end_session_endpoint: "https://pool.auth.us-east-1.amazoncognito.com/logout" },
    });
    const oldRequest = await client.createSignoutRequest({ id_token_hint: "id-token" });
    expect(new URL(oldRequest.url).searchParams.has("client_id")).toBe(false);
    for (const id_token_hint of ["id-token", undefined]) {
      const request = await client.createSignoutRequest({ id_token_hint, ...oidc.signoutRedirect.mock.calls[0][0] });
      const url = new URL(request.url);
      expect(url.pathname).toBe("/logout");
      expect(url.searchParams.getAll("client_id")).toEqual(["client-1"]);
      expect(url.searchParams.get("logout_uri")).toBe(window.location.origin);
      expect(url.searchParams.has("post_logout_redirect_uri")).toBe(false);
    }
  });
});
