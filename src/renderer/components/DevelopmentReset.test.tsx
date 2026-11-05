// @vitest-environment jsdom
import React from "react";
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { DevelopmentReset } from "./DevelopmentReset";

afterEach(() => { cleanup(); vi.restoreAllMocks(); });
function fixture() {
  const invoke = vi.fn().mockResolvedValue({ success: true }), onReset = vi.fn();
  Object.defineProperty(window, "electron", { configurable: true, value: { ipcRenderer: { invoke } } });
  vi.spyOn(window, "confirm").mockReturnValue(true); vi.spyOn(window, "alert").mockImplementation(() => {});
  render(<DevelopmentReset onReset={onReset} />); return { invoke, onReset };
}
it("names the retained context and submits an explicit data reset", async () => {
  const f = fixture();
  fireEvent.click(screen.getByRole("button", { name: "Reset development data" }));
  await waitFor(() => expect(f.onReset).toHaveBeenCalledOnce());
  expect(window.confirm).toHaveBeenCalledWith(expect.stringMatching(/retain.*base currency/i));
  expect(f.invoke).toHaveBeenCalledWith("reset-all-data", { mode: "data" });
});
it("explains clearing setup when explicitly choosing factory reset", async () => {
  const f = fixture();
  fireEvent.change(screen.getByLabelText("Development reset mode"), { target: { value: "factory" } });
  fireEvent.click(screen.getByRole("button", { name: "Reset development data" }));
  await waitFor(() => expect(f.onReset).toHaveBeenCalledOnce());
  expect(window.confirm).toHaveBeenCalledWith(expect.stringMatching(/clear.*base currency.*setup/i));
  expect(f.invoke).toHaveBeenCalledWith("reset-all-data", { mode: "factory" });
});
it("does nothing after canceled confirmation and keeps service failures visible", async () => {
  const f = fixture(); vi.mocked(window.confirm).mockReturnValueOnce(false);
  fireEvent.click(screen.getByRole("button", { name: "Reset development data" }));
  expect(f.invoke).not.toHaveBeenCalled();
  f.invoke.mockResolvedValueOnce({ success: false, error: "Choose a base currency first" });
  fireEvent.click(screen.getByRole("button", { name: "Reset development data" }));
  await screen.findByRole("alert"); expect(screen.getByRole("alert").textContent).toContain("Choose a base currency first");
  expect(f.onReset).not.toHaveBeenCalled();
});
