// @vitest-environment jsdom
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Recovery } from "./Recovery";

const state = { available: true, activeProfile: "default", nextProfile: "default", profiles: [{ id: "default" }] };
describe("Recovery page", () => {
  beforeEach(() => {
    Object.defineProperty(window, "electron", { writable: true, value: {
      getRecoveryState: vi.fn().mockResolvedValue({ success: true, data: state }),
      createPersonalBackup: vi.fn(), restorePersonalBackup: vi.fn(), selectPersonalProfile: vi.fn(),
    } });
  });
  it("shows backup errors and allows retry without reporting success", async () => {
    vi.mocked(window.electron.createPersonalBackup).mockResolvedValue({ success: false, error: "Disk full" });
    render(<Recovery />);
    const button = await screen.findByRole("button", { name: "Create backup" });
    await waitFor(() => expect((button as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(button);
    expect(await screen.findByRole("alert")).toHaveProperty("textContent", "Disk full");
    expect((button as HTMLButtonElement).disabled).toBe(false);
    expect(screen.queryByText("Backup created")).toBeNull();
  });
  it("treats canceled dialogs as cancellation, not errors or success", async () => {
    vi.mocked(window.electron.restorePersonalBackup).mockResolvedValue({ success: false, canceled: true });
    render(<Recovery />);
    const button = await screen.findByRole("button", { name: "Restore backup into new profile" });
    await waitFor(() => expect((button as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(button);
    await screen.findByText("Canceled. No changes made.");
    expect(screen.queryByRole("alert")).toBeNull();
  });
  it("shows verified recovery details without switching the live profile", async () => {
    vi.mocked(window.electron.restorePersonalBackup).mockResolvedValue({ success: true, data: {
      path: "/private/restored/book.sqlite", profileId: "restored-test", summary: {
        schemaVersion: "v1", recordDigest: "verified-digest", tableCounts: { Account: 2, JournalEntry: 1, JournalLine: 2 },
        balances: [{ accountId: "cash", currency: "CAD", amount: 123.45 }],
      },
    } });
    render(<Recovery />);
    const button = await screen.findByRole("button", { name: "Restore backup into new profile" });
    await waitFor(() => expect((button as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(button);
    await screen.findByText("Restored and verified in a separate profile");
    expect(screen.getByText("123.45")).toBeTruthy();
    expect(screen.getByText("verified-digest")).toBeTruthy();
    expect(window.electron.selectPersonalProfile).not.toHaveBeenCalled();
  });
  it("disables personal recovery in a development build", async () => {
    vi.mocked(window.electron.getRecoveryState).mockResolvedValue({ success: true, data: { ...state, available: false } });
    render(<Recovery />);
    await screen.findByText(/available in the packaged app/i);
    expect((screen.getByRole("button", { name: "Create backup" }) as HTMLButtonElement).disabled).toBe(true);
  });
});
