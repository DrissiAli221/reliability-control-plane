import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { BotProtectionHint } from "./BotProtectionHint";
afterEach(cleanup);
it("shows only explicit known challenge metadata, and explains it is not counted", () => {
  render(<BotProtectionHint results={[{region:"eu-west-1",botProtection:"CLOUDFLARE_CHALLENGE"}]} />);
  expect(screen.getByText("Cloudflare is blocking the probes")).toBeInTheDocument();
  expect(screen.getByRole("note")).toHaveTextContent("eu-west-1");
  expect(screen.getByText(/Challenged checks are not counted/)).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Accept 403" })).not.toBeInTheDocument();
});
it("offers Accept 403 only when a handler is given", () => {
  const onAccept = vi.fn();
  render(<BotProtectionHint results={[{region:"eu-west-1",botProtection:"CLOUDFLARE_CHALLENGE"}]} onAccept={onAccept} />);
  fireEvent.click(screen.getByRole("button", { name: "Accept 403" }));
  expect(onAccept).toHaveBeenCalledTimes(1);
});
it("does not infer a challenge from an older response or unknown metadata", () => {
  const {container} = render(<BotProtectionHint results={[{region:"eu-west-1"},{region:"us-east-1",botProtection:"UNKNOWN"}]} />);
  expect(container).toBeEmptyDOMElement();
});
