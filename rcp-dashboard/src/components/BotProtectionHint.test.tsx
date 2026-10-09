import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { BotProtectionHint } from "./BotProtectionHint";
afterEach(cleanup);
it("shows only explicit known challenge metadata, independently of verdict", () => {
  render(<BotProtectionHint results={[{region:"eu-west-1",botProtection:"CLOUDFLARE_CHALLENGE"}]} />);
  expect(screen.getByText(/Bot protection detected/)).toBeInTheDocument();
  expect(screen.getByRole("note")).toHaveTextContent("eu-west-1");
  expect(screen.getByText(/This note does not change the verdict/)).toBeInTheDocument();
});
it("does not infer a challenge from an older response or unknown metadata", () => {
  const {container} = render(<BotProtectionHint results={[{region:"eu-west-1"},{region:"us-east-1",botProtection:"UNKNOWN"}]} />);
  expect(container).toBeEmptyDOMElement();
});
