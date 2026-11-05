// @vitest-environment jsdom
import React from "react";
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ProtectedRecovery } from "./ProtectedRecovery";
import type { SecurityState } from "../../shared/security";

afterEach(cleanup);
const security: SecurityState = { status: "locked", personal: true, revision: 1,
  methods: { passphrase: true, keychain: false }, osAuthenticationAvailable: false };
const summary = { schemaVersion: "v1", recordDigest: "verified", tableCounts: { Account: 2, JournalEntry: 1 }, balances: [] };
function fixture() {
  const api = { getState: vi.fn().mockResolvedValue({ available: true, activeProfile: "default", nextProfile: "default", profiles: [{ id: "default" }] }),
    createBackup: vi.fn(), beginRestore: vi.fn(), beginLegacy: vi.fn(), beginInterrupted: vi.fn(), confirmRestore: vi.fn(), selectProfile: vi.fn(), cancel: vi.fn().mockResolvedValue(undefined) };
  Object.defineProperty(window, "electron", { configurable: true, value: { protectedRecovery: api } });
  return api;
}
it("requires the new recovery code, keeps failed confirmation visible, and never selects a restored profile automatically", async () => {
  const api = fixture();
  api.beginRestore.mockResolvedValue({ restoreId: "pending", profileId: "restored-test", recoverySecret: "NEW-CODE", summary });
  api.confirmRestore.mockRejectedValueOnce(new Error("Re-enter saved code")).mockResolvedValue({ profileId: "restored-test", summary });
  render(<ProtectedRecovery security={security} />);
  await screen.findByText(/Current profile:/);
  expect(screen.queryByRole("button", { name: "Create encrypted backup" })).toBeNull();
  fireEvent.change(screen.getByLabelText("Backup credential"), { target: { value: "OLD-CODE" } });
  fireEvent.change(screen.getByLabelText("New passphrase"), { target: { value: "Replacement passphrase" } });
  fireEvent.change(screen.getByLabelText("Repeat new passphrase"), { target: { value: "Replacement passphrase" } });
  fireEvent.click(screen.getByRole("button", { name: "Choose encrypted backup and verify" }));
  await screen.findByText("NEW-CODE");
  expect(api.confirmRestore).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText("Re-enter new recovery code"), { target: { value: "wrong" } });
  fireEvent.click(screen.getByRole("button", { name: "Confirm and publish restored profile" }));
  await screen.findByText("Re-enter saved code");
  expect(screen.getByText("NEW-CODE")).toBeTruthy();
  fireEvent.change(screen.getByLabelText("Re-enter new recovery code"), { target: { value: "NEW-CODE" } });
  fireEvent.click(screen.getByRole("button", { name: "Confirm and publish restored profile" }));
  await screen.findByText(/Restored profile: restored-test/);
  expect(api.confirmRestore).toHaveBeenLastCalledWith({ restoreId: "pending", recoverySecret: "NEW-CODE" });
  expect(api.selectProfile).not.toHaveBeenCalled();
  expect(screen.queryByText("NEW-CODE")).toBeNull();
  expect((screen.getByLabelText("Backup credential") as HTMLInputElement).value).toBe("");
  expect((screen.getByLabelText("New passphrase") as HTMLInputElement).value).toBe("");
});
it("clears backup credentials after a failed save and allows retry", async () => {
  const api = fixture(); api.createBackup.mockRejectedValue(new Error("Backup could not be saved"));
  render(<ProtectedRecovery security={{ ...security, status: "unlocked" }} />);
  await screen.findByText(/Current profile:/);
  fireEvent.change(screen.getByLabelText("Profile passphrase"), { target: { value: "Existing passphrase" } });
  fireEvent.click(screen.getByRole("button", { name: "Create encrypted backup" }));
  await screen.findByText("Backup could not be saved");
  expect(api.createBackup).toHaveBeenCalledWith({ mode: "passphrase", passphrase: "Existing passphrase" });
  expect((screen.getByLabelText("Profile passphrase") as HTMLInputElement).value).toBe("");
  expect((screen.getByRole("button", { name: "Create encrypted backup" }) as HTMLButtonElement).disabled).toBe(false);
});
it("drains pending work when leaving the view", async () => {
  const api = fixture(); const close = vi.fn();
  let finish!: () => void;
  api.cancel.mockImplementationOnce(() => new Promise<void>((resolve) => { finish = resolve; }));
  render(<ProtectedRecovery security={security} onClose={close} />);
  await screen.findByText(/Current profile:/);
  fireEvent.click(screen.getByRole("button", { name: "Back to unlock" }));
  await waitFor(() => expect(api.cancel).toHaveBeenCalled());
  expect(close).not.toHaveBeenCalled();
  finish(); await waitFor(() => expect(close).toHaveBeenCalled());
});

it("requires plaintext-retention acknowledgement before conversion and clears new credentials after preparation", async () => {
  const api = fixture(); api.beginLegacy.mockResolvedValue({ restoreId: "conversion", profileId: "restored-converted", recoverySecret: "CONVERTED-CODE", summary });
  render(<ProtectedRecovery security={{ ...security, status: "recovery-required" }} />);
  await screen.findByText(/Current profile:/);
  fireEvent.change(screen.getByLabelText("Recovery source"), { target: { value: "legacy" } });
  expect(screen.queryByLabelText("Backup credential")).toBeNull();
  const button = screen.getByRole("button", { name: "Choose legacy book and convert" });
  expect((button as HTMLButtonElement).disabled).toBe(true);
  fireEvent.change(screen.getByLabelText("New passphrase"), { target: { value: "Replacement passphrase" } });
  fireEvent.change(screen.getByLabelText("Repeat new passphrase"), { target: { value: "Replacement passphrase" } });
  fireEvent.click(screen.getByLabelText(/I understand the original book and existing copies remain plaintext/));
  fireEvent.click(button);
  await screen.findByText("CONVERTED-CODE");
  expect(api.beginLegacy).toHaveBeenCalledWith({ acknowledgePlaintext: true,
    protection: { mode: "passphrase", passphrase: "Replacement passphrase", passphraseConfirmation: "Replacement passphrase" } });
  expect(api.beginRestore).not.toHaveBeenCalled(); expect(api.confirmRestore).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Cancel pending recovery" }));
  await screen.findByLabelText("New passphrase");
  expect((screen.getByLabelText("New passphrase") as HTMLInputElement).value).toBe("");
  expect((screen.getByLabelText("Repeat new passphrase") as HTMLInputElement).value).toBe("");
});

it("requires explicit snapshot acknowledgement and saved credentials before preparing interrupted recovery", async () => {
  const api = fixture(), artifactId = ".creating-default-unfinished";
  api.getState.mockResolvedValue({ available: true, activeProfile: "default", nextProfile: "default", profiles: [],
    interruptedArtifacts: [{ id: artifactId, kind: "setup", canAttemptRecovery: true, profileId: "default" },
      { id: ".legacy-conversion-unknown", kind: "temporary", canAttemptRecovery: false }], unfinishedSetupIds: [] });
  api.beginInterrupted.mockResolvedValue({ restoreId: "interrupted", profileId: "restored-snapshot", recoverySecret: "INTERRUPTED-CODE", summary });
  render(<ProtectedRecovery security={{ ...security, status: "recovery-required" }} />);
  await screen.findByText(artifactId);
  fireEvent.change(screen.getByLabelText("Recovery source"), { target: { value: "interrupted" } });
  fireEvent.change(screen.getByLabelText("Interrupted snapshot"), { target: { value: artifactId } });
  fireEvent.change(screen.getByLabelText("Interrupted profile credential"), { target: { value: "SAVED-CODE" } });
  fireEvent.change(screen.getByLabelText("New passphrase"), { target: { value: "Replacement passphrase" } });
  fireEvent.change(screen.getByLabelText("Repeat new passphrase"), { target: { value: "Replacement passphrase" } });
  const button = screen.getByRole("button", { name: "Verify interrupted snapshot" });
  expect((button as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(screen.getByLabelText(/I understand this interrupted snapshot may be incomplete/));
  fireEvent.click(button); await screen.findByText("INTERRUPTED-CODE");
  expect(api.beginInterrupted).toHaveBeenCalledWith({ artifactId, acknowledgeSnapshot: true,
    credential: { mode: "recovery", secret: "SAVED-CODE" },
    protection: { mode: "passphrase", passphrase: "Replacement passphrase", passphraseConfirmation: "Replacement passphrase" } });
  expect(api.beginRestore).not.toHaveBeenCalled(); expect(api.confirmRestore).not.toHaveBeenCalled();
});
