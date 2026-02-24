// @vitest-environment jsdom
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AccountModal } from "./AccountModal";

const mockInvoke = vi.fn();
const mockSetOpeningBalance = vi.fn();
const mockGetLiabilityProfile = vi.fn();
const mockGetLiabilityVersionHistory = vi.fn();
const mockUpsertLiabilityProfile = vi.fn();
const mockConvertLiabilityTemplate = vi.fn();

describe("AccountModal opening balance", () => {
  beforeEach(() => {
    mockInvoke.mockReset();
    mockSetOpeningBalance.mockReset();
    mockGetLiabilityProfile.mockReset();
    mockGetLiabilityVersionHistory.mockReset();
    mockUpsertLiabilityProfile.mockReset();
    mockConvertLiabilityTemplate.mockReset();
    mockInvoke.mockImplementation((channel: string) => {
      if (channel === "get-account-groups") {
        return Promise.resolve({ success: true, groups: [] });
      }
      if (channel === "add-account") {
        return Promise.resolve({
          success: true,
          account: { id: "new-liability-account", name: "Test" },
        });
      }
      return Promise.resolve({});
    });

    mockGetLiabilityProfile.mockResolvedValue({ success: true, profile: null });
    mockGetLiabilityVersionHistory.mockResolvedValue({ success: true, history: [] });
    mockUpsertLiabilityProfile.mockResolvedValue({ success: true, profile: {} });
    mockConvertLiabilityTemplate.mockResolvedValue({ success: true, profile: {} });

    Object.defineProperty(window, "electron", {
      value: {
        ipcRenderer: {
          invoke: mockInvoke,
          on: vi.fn(),
        },
        setOpeningBalance: mockSetOpeningBalance,
        getLiabilityProfile: mockGetLiabilityProfile,
        getLiabilityVersionHistory: mockGetLiabilityVersionHistory,
        upsertLiabilityProfile: mockUpsertLiabilityProfile,
        convertLiabilityTemplate: mockConvertLiabilityTemplate,
        getBaseCurrencyImpactState: vi.fn().mockResolvedValue({
          baseCurrency: "CAD",
          reconciliation: null,
        }),
      },
      configurable: true,
    });
  });

  it("shows liability label as Balance owed", async () => {
    render(<AccountModal isOpen={true} onClose={vi.fn()} onAccountCreated={vi.fn()} />);

    const subtypeSelect = screen.getByLabelText("Account Kind");
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

  it("shows the shared currency option set", () => {
    render(<AccountModal isOpen={true} onClose={vi.fn()} onAccountCreated={vi.fn()} />);

    expect(screen.getByRole("option", { name: "HKD - Hong Kong Dollar" })).toBeTruthy();
  });

  it("shows skip option for blank liability template setup", async () => {
    render(<AccountModal isOpen={true} onClose={vi.fn()} onAccountCreated={vi.fn()} />);

    fireEvent.change(screen.getByLabelText("Account Name"), { target: { value: "Blank Liability" } });
    fireEvent.change(screen.getByLabelText("Account Kind"), { target: { value: "liability" } });
    fireEvent.change(screen.getByLabelText("Liability Template"), { target: { value: "blank" } });
    fireEvent.click(screen.getByRole("button", { name: "Add Account" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Skip for now" })).toBeTruthy();
    });
  });

  it("hides skip option for non-blank liability template setup", async () => {
    render(<AccountModal isOpen={true} onClose={vi.fn()} onAccountCreated={vi.fn()} />);

    fireEvent.change(screen.getByLabelText("Account Name"), { target: { value: "Card Liability" } });
    fireEvent.change(screen.getByLabelText("Account Kind"), { target: { value: "liability" } });
    fireEvent.change(screen.getByLabelText("Liability Template"), { target: { value: "credit_card" } });
    fireEvent.click(screen.getByRole("button", { name: "Add Account" }));

    await waitFor(() => {
      expect(screen.queryByRole("button", { name: "Skip for now" })).toBeNull();
    });
  });
});
