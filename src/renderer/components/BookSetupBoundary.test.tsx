// @vitest-environment jsdom
import React from "react";
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { BookSetupBoundary } from "./BookSetupBoundary";

afterEach(cleanup);
function fixture(required: boolean) {
  const api = { getState: vi.fn().mockResolvedValue({ required }), complete: vi.fn().mockResolvedValue(undefined) };
  Object.defineProperty(window, "electron", { configurable: true, value: { bookSetup: api } }); return api;
}
it("blocks financial mounts until explicit currency selection and successful persistence", async () => {
  const api = fixture(true), mounted = vi.fn();
  function Financial() { React.useEffect(() => { mounted(); }, []); return <p>Financial views</p>; }
  render(<BookSetupBoundary><Financial /></BookSetupBoundary>);
  await screen.findByRole("heading", { name: "Choose your book's base currency" });
  expect(mounted).not.toHaveBeenCalled(); expect((screen.getByLabelText("Base currency") as HTMLSelectElement).value).toBe("");
  expect((screen.getByRole("button", { name: "Save base currency" }) as HTMLButtonElement).disabled).toBe(true);
  api.complete.mockRejectedValueOnce(new Error("Synthetic setup failure"));
  fireEvent.change(screen.getByLabelText("Base currency"), { target: { value: "CAD" } });
  fireEvent.click(screen.getByRole("button", { name: "Save base currency" }));
  await screen.findByRole("alert"); expect(mounted).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Save base currency" }));
  await screen.findByText("Financial views"); expect(api.complete).toHaveBeenLastCalledWith({ baseCurrency: "CAD" });
  expect(mounted).toHaveBeenCalledOnce();
});
it("mounts configured books but fails closed and permits retry when setup cannot be checked", async () => {
  const api = fixture(false); api.getState.mockRejectedValueOnce(new Error("Synthetic read failure"));
  render(<BookSetupBoundary><p>Financial views</p></BookSetupBoundary>);
  await screen.findByRole("alert"); expect(screen.queryByText("Financial views")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Check setup again" }));
  await screen.findByText("Financial views");
});
it("ignores a late setup response after the boundary is unmounted", async () => {
  const api = fixture(true); let finish!: () => void;
  api.complete.mockImplementation(() => new Promise<void>((resolve) => { finish = resolve; }));
  const mounted = vi.fn(); function Financial() { React.useEffect(() => { mounted(); }, []); return null; }
  const view = render(<BookSetupBoundary><Financial /></BookSetupBoundary>);
  await screen.findByRole("heading");
  fireEvent.change(screen.getByLabelText("Base currency"), { target: { value: "JPY" } });
  fireEvent.click(screen.getByRole("button", { name: "Save base currency" }));
  await waitFor(() => expect(finish).toBeDefined()); view.unmount(); finish();
  expect(mounted).not.toHaveBeenCalled();
});
