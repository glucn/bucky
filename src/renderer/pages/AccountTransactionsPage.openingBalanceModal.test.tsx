// @vitest-environment jsdom
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { SetOpeningBalanceModal } from "./AccountTransactionsPage";

const mockInvoke = vi.fn();
const mockGetOpeningBalance = vi.fn();
const mockSetOpeningBalance = vi.fn();

describe("SetOpeningBalanceModal", () => {
  beforeEach(() => {
    mockInvoke.mockReset();
    mockGetOpeningBalance.mockReset();
    mockSetOpeningBalance.mockReset();

    mockInvoke.mockImplementation((channel: string) => {
      if (channel === "get-account") {
        return Promise.resolve({
          id: "a1",
          currency: "USD",
          type: "user",
          subtype: "liability",
        });
      }
      return Promise.resolve({});
    });
    mockGetOpeningBalance.mockResolvedValue(null);

    Object.defineProperty(window, "electron", {
      value: {
        ipcRenderer: {
          invoke: mockInvoke,
          on: vi.fn(),
        },
        getOpeningBalance: mockGetOpeningBalance,
        setOpeningBalance: mockSetOpeningBalance,
      },
      configurable: true,
    });
  });

  it("shows Balance owed for liability accounts", async () => {
    render(
      <SetOpeningBalanceModal accountId="a1" onClose={vi.fn()} onSuccess={vi.fn()} />
    );
    await waitFor(() => {
      expect(screen.getByText("Balance owed")).toBeTruthy();
    });
  });

  it("has required date and numeric amount inputs", async () => {
    render(
      <SetOpeningBalanceModal accountId="a1" onClose={vi.fn()} onSuccess={vi.fn()} />
    );

    await waitFor(() => {
      expect(screen.getByTestId("opening-balance-modal-amount")).toBeTruthy();
    });

    const amountInput = screen.getByTestId("opening-balance-modal-amount") as HTMLInputElement;
    const dateInput = screen.getByTestId("opening-balance-modal-date") as HTMLInputElement;
    expect(amountInput.getAttribute("type")).toBe("number");
    expect(dateInput.required).toBe(true);
  });
});
