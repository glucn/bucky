// @vitest-environment jsdom
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { AccountModal } from "./AccountModal";

const mockInvoke = vi.fn();
const mockSetOpeningBalance = vi.fn();

describe("AccountModal opening balance", () => {
  beforeEach(() => {
    mockInvoke.mockReset();
    mockSetOpeningBalance.mockReset();
    mockInvoke.mockImplementation((channel: string) => {
      if (channel === "get-account-groups") {
        return Promise.resolve({ success: true, groups: [] });
      }
      return Promise.resolve({});
    });

    Object.defineProperty(window, "electron", {
      value: {
        ipcRenderer: {
          invoke: mockInvoke,
          on: vi.fn(),
        },
        setOpeningBalance: mockSetOpeningBalance,
      },
      configurable: true,
    });
  });

  it("shows liability label as Balance owed", async () => {
    render(<AccountModal isOpen={true} onClose={vi.fn()} onAccountCreated={vi.fn()} />);

    const subtypeSelect = screen.getByLabelText("Account Subtype");
    fireEvent.change(subtypeSelect, { target: { value: "liability" } });

    expect(await screen.findByText("Balance owed")).toBeTruthy();
  });

  it("has required opening balance date input", () => {
    render(<AccountModal isOpen={true} onClose={vi.fn()} onAccountCreated={vi.fn()} />);
    const dateInput = screen.getByTestId("opening-balance-date-input");
    const amountInput = screen.getByTestId("opening-balance-amount-input");
    expect((dateInput as HTMLInputElement).required).toBe(true);
    expect(amountInput.getAttribute("type")).toBe("number");
  });
});
