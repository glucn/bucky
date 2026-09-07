// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ManualTransactionModal } from "./ManualTransactionModal";
import { TransferModal } from "./TransferModal";

vi.mock("../context/AccountsContext", () => ({
  useAccounts: () => ({
    accounts: [
      { id: "from", name: "Checking", type: "user", subtype: "asset", currency: "USD" },
      { id: "to", name: "Savings", type: "user", subtype: "asset", currency: "USD" },
    ],
    refreshAccounts: vi.fn(),
  }),
}));

describe("Transaction save failures", () => {
  beforeEach(() => {
    window.electron = { ipcRenderer: { invoke: vi.fn().mockResolvedValue({
      success: false, error: "The transaction could not be saved. Please retry.",
    }) } } as any;
  });
  afterEach(cleanup);

  it.each(["manual", "transfer"])("keeps the %s edit dialog open and displays the service error", async (kind) => {
    const onClose = vi.fn();
    const onSuccess = vi.fn();
    const { container } = render(kind === "manual" ? (
      <ManualTransactionModal accountId="from" onClose={onClose} onSuccess={onSuccess}
        transaction={{ id: "line", accountId: "from", amount: -100, currency: "USD",
          entry: { id: "entry", date: "2026-08-01", lines: [
            { id: "line", accountId: "from" }, { id: "other", accountId: "to" },
          ] } } as any} />
    ) : (
      <TransferModal onClose={onClose} onSuccess={onSuccess} editTransaction={{
        id: "line", entryId: "entry", fromAccountId: "from", toAccountId: "to",
        amount: 100, date: "2026-08-01", description: "Transfer",
      }} />
    ));
    fireEvent.submit(container.querySelector("form")!);
    await waitFor(() => expect(window.electron.ipcRenderer.invoke).toHaveBeenCalled());
    expect((await screen.findByRole("alert")).textContent).toContain("Please retry");
    expect(onClose).not.toHaveBeenCalled();
    expect(onSuccess).not.toHaveBeenCalled();
    // A failed save can be retried without reopening the form.
    fireEvent.submit(container.querySelector("form")!);
    await waitFor(() => expect(window.electron.ipcRenderer.invoke).toHaveBeenCalledTimes(2));
  });
});
