// @vitest-environment jsdom
import React from "react";
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { CredentialChange } from "./CredentialChange";
import type { SecurityState } from "../../shared/security";

afterEach(cleanup);
const state: SecurityState = { status: "locked", personal: true, revision: 1, osAuthenticationAvailable: false, methods: { keychain: false, passphrase: true } };
function fixture() {
  const api = { changeCredentials: vi.fn(), unlock: vi.fn() };
  Object.defineProperty(window, "electron", { configurable: true, value: { security: api } }); return api;
}
function fill() {
  fireEvent.change(screen.getByLabelText("Current passphrase"), { target: { value: "Original synthetic passphrase" } });
  fireEvent.change(screen.getByLabelText("New passphrase"), { target: { value: "Replacement synthetic passphrase" } });
  fireEvent.change(screen.getByLabelText("Repeat new passphrase"), { target: { value: "Replacement synthetic passphrase" } });
}
it("keeps failed changes retryable, clears all credentials, and never automatically unlocks", async () => {
  const api = fixture(); api.changeCredentials.mockRejectedValueOnce(new Error("Unable to update protection")).mockResolvedValue({ updated: true });
  render(<CredentialChange state={state} onClose={vi.fn()} />); fill();
  fireEvent.click(screen.getByRole("button", { name: "Update profile protection" }));
  await screen.findByText("Unable to update protection");
  for (const label of ["Current passphrase", "New passphrase", "Repeat new passphrase"]) expect((screen.getByLabelText(label) as HTMLInputElement).value).toBe("");
  fill(); fireEvent.click(screen.getByRole("button", { name: "Update profile protection" }));
  await screen.findByText(/Profile protection updated/);
  expect(api.changeCredentials).toHaveBeenLastCalledWith({ authentication: { mode: "passphrase", passphrase: "Original synthetic passphrase" },
    change: { mode: "passphrase", passphrase: "Replacement synthetic passphrase", passphraseConfirmation: "Replacement synthetic passphrase" } });
  expect(api.unlock).not.toHaveBeenCalled();
});
it("offers saved-code recovery when the old keychain is unavailable without silently opening the book", async () => {
  const api = fixture(); api.changeCredentials.mockResolvedValue({ updated: true });
  render(<CredentialChange state={{ ...state, methods: { keychain: true, passphrase: false } }} onClose={vi.fn()} />);
  fireEvent.change(screen.getByLabelText("Saved recovery code"), { target: { value: "SYNTHETIC-SAVED-CODE" } });
  fireEvent.change(screen.getByLabelText("New passphrase"), { target: { value: "Replacement synthetic passphrase" } });
  fireEvent.change(screen.getByLabelText("Repeat new passphrase"), { target: { value: "Replacement synthetic passphrase" } });
  fireEvent.click(screen.getByRole("button", { name: "Update profile protection" }));
  await screen.findByText(/Profile protection updated/);
  expect(api.changeCredentials.mock.calls[0][0].authentication).toEqual({ mode: "recovery", recoverySecret: "SYNTHETIC-SAVED-CODE" });
  expect(api.unlock).not.toHaveBeenCalled();
});
