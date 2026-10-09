import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { MonitorDetailPage } from "./MonitorDetailPage";
import { useReadOnly } from "../session";
import { deleteMonitor } from "../api";
vi.mock("../api", () => ({
  getMonitor: vi.fn(async () => ({id:"id",name:"Checkout",targetUrl:"https://example.com",checkIntervalSeconds:60,timeoutMs:5000,enabled:true,acceptedHttpStatuses:[403]})),
  listMonitors: vi.fn(async () => []),
  monitorHistory: vi.fn(async () => ({regions:[],recentChecks:[],days:[]})),
  availability: vi.fn(async () => {throw new Error("No evidence");}),
  reliabilityReport: vi.fn(async () => {throw new Error("No evidence");}),
  incidentState: vi.fn(async () => {throw new Error("No evidence");}),
  latencyHeatmap: vi.fn(async () => {throw new Error("No evidence");}),
  deleteMonitor: vi.fn(async () => undefined), setAcceptedHttpStatuses: vi.fn(),
}));
vi.mock("../session", () => ({useReadOnly:vi.fn()}));
vi.mock("../auth", () => ({isLocalAuth:() => false}));
afterEach(cleanup);
beforeEach(() => {vi.clearAllMocks();vi.mocked(useReadOnly).mockReturnValue(false);});
function page() {
  render(<MemoryRouter initialEntries={["/monitors/id"]}><Routes>
    <Route path="/monitors/:monitorId" element={<MonitorDetailPage />} />
    <Route path="/monitors" element={<h1>Monitor list</h1>} />
  </Routes></MemoryRouter>);
}
it("returns to the list only after confirmed deletion", async () => {
  page();
  fireEvent.click(await screen.findByRole("button",{name:"More monitor actions"}));
  fireEvent.click(screen.getByRole("menuitem",{name:"Delete monitor"}));
  fireEvent.change(screen.getByRole("textbox"),{target:{value:"Checkout"}});
  fireEvent.click(within(screen.getByRole("dialog")).getByRole("button",{name:"Delete monitor"}));
  expect(await screen.findByRole("heading",{name:"Monitor list"})).toBeInTheDocument();
  expect(deleteMonitor).toHaveBeenCalledWith("id");
});
it("shows custom statuses but hides both mutations for the demo role", async () => {
  vi.mocked(useReadOnly).mockReturnValue(true); page();
  expect(await screen.findByText("Accepts 403")).toBeInTheDocument();
  expect(screen.queryByRole("button",{name:"More monitor actions"})).not.toBeInTheDocument();
  expect(screen.queryByRole("button",{name:"Delete monitor"})).not.toBeInTheDocument();
});
it("opens accepted statuses from the header menu, after a separator, with delete as a danger item", async () => {
  page();
  fireEvent.click(await screen.findByRole("button",{name:"More monitor actions"}));
  const items = screen.getAllByRole("menuitem");
  expect(items.map((item) => item.textContent)).toEqual(["Accepted statuses…","Delete monitor"]);
  expect(items[1]).toHaveClass("danger");
  expect(screen.getByRole("separator")).toBeInTheDocument();
  fireEvent.click(items[0]);
  expect(await screen.findByRole("dialog")).toBeInTheDocument();
});
