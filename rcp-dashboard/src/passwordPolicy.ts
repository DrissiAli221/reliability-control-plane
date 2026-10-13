/** The user pool's password policy (infra/aws-demo/identity.tf), so the page can show it live instead of after a rejection. */
const RULES: { label: string; test: (password: string) => boolean }[] = [
  { label: "At least 14 characters", test: (password) => password.length >= 14 },
  { label: "An uppercase letter", test: (password) => /[A-Z]/.test(password) },
  { label: "A lowercase letter", test: (password) => /[a-z]/.test(password) },
  { label: "A number", test: (password) => /[0-9]/.test(password) },
  { label: "A symbol", test: (password) => /[^A-Za-z0-9\s]/.test(password) },
];

export function passwordChecks(password: string): { label: string; met: boolean }[] {
  return RULES.map((rule) => ({ label: rule.label, met: rule.test(password) }));
}

export function passwordMeetsPolicy(password: string): boolean {
  return RULES.every((rule) => rule.test(password));
}
