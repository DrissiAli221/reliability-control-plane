import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as auth from "../auth";
import { SignInPage } from "./SignInPage";

const config = vi.hoisted(() => ({ local: false, providers: [] as string[] }));

vi.mock("../auth", () => ({
  isLocalAuth: () => config.local,
  safeNext: (next: string | null) => (next && next.startsWith("/") && !next.startsWith("//") ? next : "/"),
  socialProviders: () => config.providers,
  socialLogin: vi.fn(),
  startDemoSession: vi.fn(),
  passwordSignIn: vi.fn(),
  submitMfaCode: vi.fn(),
  submitNewPassword: vi.fn(),
  signUp: vi.fn(),
  confirmSignUp: vi.fn(),
  resendSignUpCode: vi.fn(),
  startPasswordReset: vi.fn(),
  finishPasswordReset: vi.fn(),
  takeAuthError: vi.fn(() => null),
}));

const assign = vi.fn();
const STRONG = "Correct-Horse-Battery-1!";

beforeEach(() => {
  config.local = false;
  config.providers = [];
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

function renderAt(url: string) {
  vi.stubGlobal("location", { ...window.location, assign });
  render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/signin" element={<SignInPage />} />
        <Route path="*" element={<p>app reached</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

const type = (label: RegExp | string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
const press = (name: RegExp | string) => fireEvent.click(screen.getByRole("button", { name }));

function fillSignIn() {
  type("Email", "ali@example.com");
  type("Password", STRONG);
  press("Sign in");
}

const metRules = () => screen.getAllByRole("listitem").filter((item) => item.textContent?.includes("(met)")).length;

describe("SignInPage", () => {
  it("puts the live demo first and returns the visitor to where they were headed", async () => {
    vi.mocked(auth.startDemoSession).mockResolvedValue();
    renderAt("/signin?next=%2Fpipeline");

    const buttons = screen.getAllByRole("button");
    expect(buttons[0]).toHaveTextContent("Try the live demo");

    fireEvent.click(buttons[0]);
    await waitFor(() => expect(assign).toHaveBeenCalledWith("/pipeline"));
  });

  it("refuses to follow an off-site return address", async () => {
    vi.mocked(auth.startDemoSession).mockResolvedValue();
    renderAt("/signin?next=%2F%2Fevil.example");

    press(/Try the live demo/);
    await waitFor(() => expect(assign).toHaveBeenCalledWith("/"));
  });

  it("shows why the demo could not start", async () => {
    vi.mocked(auth.startDemoSession).mockRejectedValue(new Error("A lot of people are trying the demo right now. Try again in a minute."));
    renderAt("/signin");

    press(/Try the live demo/);
    expect(await screen.findByText(/Try again in a minute/)).toBeInTheDocument();
  });

  it("no longer talks about a hosted page", () => {
    renderAt("/signin");
    expect(screen.queryByText(/hosted/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Cognito/i)).not.toBeInTheDocument();
  });

  it("shows the reason a redirect sign-in failed", async () => {
    vi.mocked(auth.takeAuthError).mockReturnValueOnce("Sign-in did not complete: provider refused");
    renderAt("/signin");
    expect(await screen.findByText("Sign-in did not complete: provider refused")).toBeInTheDocument();
  });
});

describe("email and password", () => {
  it("signs in and lands on the requested page", async () => {
    vi.mocked(auth.passwordSignIn).mockResolvedValue("signedIn");
    renderAt("/signin?next=%2Fpipeline");

    fillSignIn();
    await waitFor(() => expect(assign).toHaveBeenCalledWith("/pipeline"));
    expect(auth.passwordSignIn).toHaveBeenCalledWith("ali@example.com", STRONG);
  });

  it("uses the right autocomplete hints and ties labels to inputs", () => {
    renderAt("/signin");
    expect(screen.getByLabelText("Email")).toHaveAttribute("autocomplete", "email");
    expect(screen.getByLabelText("Password")).toHaveAttribute("autocomplete", "current-password");
  });

  it("submits on Enter and shows a busy label while it waits", async () => {
    let finish!: (step: "signedIn") => void;
    vi.mocked(auth.passwordSignIn).mockReturnValue(new Promise((resolve) => (finish = resolve)));
    renderAt("/signin");

    type("Email", "ali@example.com");
    type("Password", STRONG);
    fireEvent.submit(screen.getByLabelText("Password").closest("form")!);
    expect(await screen.findByRole("button", { name: "Signing in…" })).toBeDisabled();
    finish("signedIn");
    await waitFor(() => expect(assign).toHaveBeenCalled());
  });

  it("shows the error without saying which half was wrong, and lets the visitor retry", async () => {
    vi.mocked(auth.passwordSignIn).mockRejectedValue(new Error("Incorrect email or password."));
    renderAt("/signin");

    fillSignIn();
    expect(await screen.findByText("Incorrect email or password.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sign in" })).toBeEnabled();
  });

  it("asks for the missing fields before sending anything", () => {
    renderAt("/signin");
    press("Sign in");
    expect(screen.getByText("Enter your email address.")).toBeInTheDocument();
    expect(auth.passwordSignIn).not.toHaveBeenCalled();
  });

  it("asks for the authenticator code, focuses it, and finishes the sign-in with it", async () => {
    vi.mocked(auth.passwordSignIn).mockResolvedValue("mfa");
    vi.mocked(auth.submitMfaCode).mockResolvedValue("signedIn");
    renderAt("/signin");

    fillSignIn();
    const code = await screen.findByLabelText("6-digit code");
    expect(code).toHaveAttribute("inputmode", "numeric");
    expect(code).toHaveAttribute("autocomplete", "one-time-code");
    await waitFor(() => expect(code).toHaveFocus());

    type("6-digit code", "12a3456");
    expect(code).toHaveValue("123456");
    press("Verify");
    await waitFor(() => expect(assign).toHaveBeenCalledWith("/"));
    expect(auth.submitMfaCode).toHaveBeenCalledWith("123456");
  });

  it("sets a new password when the account requires one", async () => {
    vi.mocked(auth.passwordSignIn).mockResolvedValue("newPassword");
    vi.mocked(auth.submitNewPassword).mockResolvedValue("signedIn");
    renderAt("/signin");

    fillSignIn();
    expect(await screen.findByRole("heading", { name: "Set a new password" })).toBeInTheDocument();
    type("New password", "short");
    press("Set password and sign in");
    expect(screen.getByText("The password does not meet every requirement listed.")).toBeInTheDocument();

    type("New password", "Another-Long-Passw0rd!");
    press("Set password and sign in");
    await waitFor(() => expect(assign).toHaveBeenCalledWith("/"));
    expect(auth.submitNewPassword).toHaveBeenCalledWith("Another-Long-Passw0rd!");
  });

  it("goes back to the sign-in step from any other step", () => {
    renderAt("/signin");
    press("Create account");
    expect(screen.getByRole("heading", { name: "Create your account" })).toBeInTheDocument();
    press("Back");
    expect(screen.getByRole("heading", { name: /Sign in to/ })).toBeInTheDocument();
  });
});

describe("creating an account", () => {
  it("checks the password policy live, confirms the emailed code, then signs in", async () => {
    vi.mocked(auth.signUp).mockResolvedValue();
    vi.mocked(auth.confirmSignUp).mockResolvedValue();
    vi.mocked(auth.resendSignUpCode).mockResolvedValue();
    vi.mocked(auth.passwordSignIn).mockResolvedValue("signedIn");
    renderAt("/signin?mode=signup");

    expect(screen.getByRole("heading", { name: "Create your account" })).toBeInTheDocument();
    expect(screen.getByLabelText("Password")).toHaveAttribute("autocomplete", "new-password");
    expect(metRules()).toBe(0);
    type("Password", STRONG);
    expect(metRules()).toBe(5);

    type("Email", "ali@example.com");
    press("Create account");
    expect(await screen.findByRole("heading", { name: "Check your email" })).toBeInTheDocument();
    expect(auth.signUp).toHaveBeenCalledWith("ali@example.com", STRONG);
    expect(screen.getByText("We sent a 6-digit code to ali@example.com.")).toBeInTheDocument();

    press("Resend code");
    await waitFor(() => expect(auth.resendSignUpCode).toHaveBeenCalledWith("ali@example.com"));
    expect(await screen.findByText("We sent a new code to ali@example.com.")).toBeInTheDocument();

    type("6-digit code", "123456");
    press("Confirm and sign in");
    await waitFor(() => expect(assign).toHaveBeenCalledWith("/"));
    expect(auth.confirmSignUp).toHaveBeenCalledWith("ali@example.com", "123456");
    expect(auth.passwordSignIn).toHaveBeenCalledWith("ali@example.com", STRONG);
  });

  it("does not create an account with a weak password", () => {
    renderAt("/signin?mode=signup");
    type("Email", "ali@example.com");
    type("Password", "weak");
    press("Create account");
    expect(auth.signUp).not.toHaveBeenCalled();
    expect(screen.getByText("The password does not meet every requirement listed.")).toBeInTheDocument();
  });

  it("moves an unconfirmed email to the code step with a fresh code", async () => {
    vi.mocked(auth.passwordSignIn).mockRejectedValue(Object.assign(new Error("This email has not been confirmed yet."), { code: "UserNotConfirmedException" }));
    vi.mocked(auth.resendSignUpCode).mockResolvedValue();
    renderAt("/signin");

    fillSignIn();
    expect(await screen.findByRole("heading", { name: "Check your email" })).toBeInTheDocument();
    expect(auth.resendSignUpCode).toHaveBeenCalledWith("ali@example.com");
  });
});

describe("forgot password", () => {
  it("shows the same neutral message and then takes the code and a new password", async () => {
    vi.mocked(auth.startPasswordReset).mockResolvedValue();
    vi.mocked(auth.finishPasswordReset).mockResolvedValue();
    renderAt("/signin");

    press("Forgot password?");
    type("Email", "nobody@example.com");
    press("Send code");
    expect(await screen.findByText("If an account exists for nobody@example.com, we sent a code.")).toBeInTheDocument();

    type("6-digit code", "654321");
    type("New password", STRONG);
    press("Set new password");
    expect(await screen.findByText("Password updated. Sign in with the new one.")).toBeInTheDocument();
    expect(auth.finishPasswordReset).toHaveBeenCalledWith("nobody@example.com", "654321", STRONG);
    expect(screen.getByRole("heading", { name: /Sign in to/ })).toBeInTheDocument();
  });
});

describe("social buttons", () => {
  it("are hidden when the deployment has no providers", () => {
    renderAt("/signin");
    expect(screen.queryByRole("button", { name: "Google" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "GitHub" })).not.toBeInTheDocument();
  });

  it("show for the configured providers and go straight to them with the return address", async () => {
    config.providers = ["Google", "GitHub"];
    vi.mocked(auth.socialLogin).mockResolvedValue();
    renderAt("/signin?next=%2Fpipeline");

    press("GitHub");
    await waitFor(() => expect(auth.socialLogin).toHaveBeenCalledWith("GitHub", "/pipeline"));
    expect(screen.getByRole("button", { name: "Google" })).toBeInTheDocument();
  });

  it("show only the one that is configured", () => {
    config.providers = ["Google"];
    renderAt("/signin");
    expect(screen.getByRole("button", { name: "Google" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "GitHub" })).not.toBeInTheDocument();
  });
});

describe("local mode", () => {
  it("continues to the app from the email form without calling Cognito", async () => {
    config.local = true;
    renderAt("/signin?next=%2Fpipeline");

    press("Sign in");
    expect(await screen.findByText("app reached")).toBeInTheDocument();
    expect(auth.passwordSignIn).not.toHaveBeenCalled();
  });

  it("keeps the other steps clickable for design work", async () => {
    config.local = true;
    renderAt("/signin");

    press("Create account");
    press("Create account");
    expect(await screen.findByRole("heading", { name: "Check your email" })).toBeInTheDocument();
    expect(auth.signUp).not.toHaveBeenCalled();
  });

  it("says plainly that this is a demo deployment that will be shut down", () => {
    renderAt("/signin");
    expect(screen.getByText(/demo deployment\. It will be shut down once the author.s internship search is over/)).toBeInTheDocument();
  });
});
