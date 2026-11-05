// @vitest-environment jsdom
import React from "react";
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { SecurityBoundary } from "./SecurityBoundary";
import type { SecurityState } from "../../shared/security";

const locked: SecurityState = { status: "locked", personal: true, revision: 1, osAuthenticationAvailable: false,
  methods: { keychain: false, passphrase: true } };
afterEach(cleanup);
function fixture(state = locked) {
  let listener: (state: SecurityState) => void = () => {};
  const dispose = vi.fn();
  const api = { getState: vi.fn().mockResolvedValue(state), unlock: vi.fn(), lock: vi.fn(),
    beginSetup: vi.fn(), confirmSetup: vi.fn(), preserveSetup: vi.fn(), onStateChanged: vi.fn((fn) => { listener = fn; return dispose; }) };
  Object.defineProperty(window, "electron", { configurable: true, value: { security: api } });
  return { api, emit: (next: SecurityState) => listener(next), dispose };
}
it("does not mount financial views until unlock, ignores stale state, and unmounts on relock", async () => {
  const f = fixture();
  const mounted = vi.fn();
  function FinancialView() { React.useEffect(mounted, []); return <p>Private financial view</p>; }
  render(<SecurityBoundary><FinancialView /></SecurityBoundary>);
  await screen.findByRole("heading", { name: "Unlock Bucky" });
  expect(mounted).not.toHaveBeenCalled();
  f.emit({ ...locked, status: "unlocked", revision: 2 });
  await screen.findByText("Private financial view");
  f.emit(locked);
  expect(screen.queryByText("Private financial view")).not.toBeNull();
  f.emit({ ...locked, revision: 3 });
  await waitFor(() => expect(screen.queryByText("Private financial view")).toBeNull());
  cleanup(); expect(f.dispose).toHaveBeenCalled();
});

it("requires explicit currency and recovery re-entry and clears credentials after setup", async () => {
  const f = fixture({ ...locked, status: "setup-required", methods: { keychain: false, passphrase: false } });
  f.api.beginSetup.mockImplementation(async () => {
    f.emit({ ...locked, status: "confirm-recovery", revision: 2 });
    return { setupId: "one-time", recoverySecret: "bucky-recovery-v1-private-test" };
  });
  f.api.confirmSetup.mockImplementation(async () => { f.emit({ ...locked, revision: 3 }); });
  render(<SecurityBoundary><p>Financial view</p></SecurityBoundary>);
  await screen.findByRole("heading", { name: "Protect your new book" });
  const currency = screen.getByLabelText("Base currency") as HTMLSelectElement;
  expect(currency.value).toBe("");
  fireEvent.change(currency, { target: { value: "CAD" } });
  fireEvent.change(screen.getByLabelText("Passphrase"), { target: { value: "a synthetic passphrase" } });
  fireEvent.change(screen.getByLabelText("Repeat passphrase"), { target: { value: "a synthetic passphrase" } });
  fireEvent.click(screen.getByRole("button", { name: "Create recovery code" }));
  await screen.findByTestId("recovery-code");
  expect(f.api.confirmSetup).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText("Re-enter saved recovery code"), { target: { value: "bucky-recovery-v1-private-test" } });
  fireEvent.click(screen.getByRole("button", { name: "Confirm and create encrypted book" }));
  await screen.findByRole("heading", { name: "Unlock Bucky" });
  expect(f.api.confirmSetup).toHaveBeenCalledWith({ setupId: "one-time", recoverySecret: "bucky-recovery-v1-private-test" });
  expect(screen.queryByTestId("recovery-code")).toBeNull();
  expect((screen.getByLabelText("Passphrase") as HTMLInputElement).value).toBe("");
});

it("stays closed when the security state cannot be obtained", async () => {
  const f = fixture(); f.api.getState.mockRejectedValue(new Error("IPC unavailable"));
  render(<SecurityBoundary><p>Must not mount</p></SecurityBoundary>);
  await screen.findByRole("alert");
  expect(screen.queryByText("Must not mount")).toBeNull();
});

it("offers encrypted recovery while locked without mounting financial views", async () => {
  fixture();
  window.electron.protectedRecovery = { getState: vi.fn().mockResolvedValue({ available: true, activeProfile: "default", nextProfile: "default", profiles: [] }),
    cancel: vi.fn().mockResolvedValue(undefined) } as any;
  render(<SecurityBoundary><p>Financial view must stay closed</p></SecurityBoundary>);
  await screen.findByRole("heading", { name: "Unlock Bucky" });
  fireEvent.click(screen.getByRole("button", { name: "Encrypted backup recovery" }));
  await screen.findByRole("heading", { name: "Encrypted backup and recovery" });
  expect(screen.queryByText("Financial view must stay closed")).toBeNull();
});

it("keeps the recovery view mounted during exclusive preservation and returns to explicit fresh setup", async () => {
  const f = fixture({ ...locked, status: "recovery-required" }), artifactId = ".creating-default-stale";
  const recovery = { getState: vi.fn().mockResolvedValueOnce({ available: true, activeProfile: "default", nextProfile: "default", profiles: [],
    interruptedArtifacts: [{ id: artifactId, kind: "setup", canAttemptRecovery: false }], unfinishedSetupIds: [artifactId] })
    .mockResolvedValue({ available: true, activeProfile: "default", nextProfile: "default", profiles: [], interruptedArtifacts: [], unfinishedSetupIds: [] }),
    cancel: vi.fn().mockResolvedValue(undefined) };
  window.electron.protectedRecovery = recovery as any;
  let finish!: () => void;
  f.api.preserveSetup.mockImplementation(async () => {
    f.emit({ ...locked, status: "recovering", revision: 2 });
    await new Promise<void>((resolve) => { finish = resolve; });
    f.emit({ ...locked, status: "setup-required", revision: 3 });
    return { preserved: true, artifacts: [{ originalId: artifactId, preservedId: ".preserved-creating-default-new" }] };
  });
  render(<SecurityBoundary><p>Financial view must stay closed</p></SecurityBoundary>);
  await screen.findByRole("heading", { name: "Recovery required" });
  fireEvent.click(screen.getByRole("button", { name: "Encrypted backup recovery" }));
  await screen.findByText(artifactId);
  fireEvent.click(screen.getByRole("button", { name: "Preserve unfinished setup files" }));
  await waitFor(() => expect(finish).toBeDefined());
  expect(screen.getByTestId("protected-recovery-page")).toBeTruthy();
  finish(); await screen.findByText(/Unfinished setup files preserved/);
  expect(f.api.preserveSetup).toHaveBeenCalledWith({ artifactIds: [artifactId] });
  expect(f.api.beginSetup).not.toHaveBeenCalled();
  expect(screen.queryByText("Financial view must stay closed")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Back to setup" }));
  await screen.findByRole("heading", { name: "Protect your new book" });
});

it("clears a partially entered launch credential when moving into recovery and returning", async () => {
  fixture();
  window.electron.protectedRecovery = { getState: vi.fn().mockResolvedValue({ available: true, activeProfile: "default", nextProfile: "default", profiles: [] }),
    cancel: vi.fn().mockResolvedValue(undefined) } as any;
  render(<SecurityBoundary><p>Financial view must stay closed</p></SecurityBoundary>);
  await screen.findByRole("heading", { name: "Unlock Bucky" });
  fireEvent.change(screen.getByLabelText("Passphrase"), { target: { value: "Partially entered private passphrase" } });
  fireEvent.click(screen.getByRole("button", { name: "Encrypted backup recovery" }));
  await screen.findByRole("heading", { name: "Encrypted backup and recovery" });
  fireEvent.click(screen.getByRole("button", { name: "Back to unlock" }));
  await screen.findByRole("heading", { name: "Unlock Bucky" });
  expect((screen.getByLabelText("Passphrase") as HTMLInputElement).value).toBe("");
});
