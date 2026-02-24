// @vitest-environment jsdom
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import LiabilityProfileModal from "./LiabilityProfileModal";
import { LiabilityTemplate } from "../../shared/liabilityTypes";

describe("LiabilityProfileModal", () => {
  const getLiabilityProfile = vi.fn();
  const getLiabilityVersionHistory = vi.fn();
  const upsertLiabilityProfile = vi.fn();
  const convertLiabilityTemplate = vi.fn();

  beforeEach(() => {
    getLiabilityProfile.mockResolvedValue({ success: true, profile: null });
    getLiabilityVersionHistory.mockResolvedValue({ success: true, history: [] });
    upsertLiabilityProfile.mockResolvedValue({ success: true, profile: {} });
    convertLiabilityTemplate.mockResolvedValue({ success: true, profile: {} });

    Object.defineProperty(window, "electron", {
      configurable: true,
      value: {
        getLiabilityProfile,
        getLiabilityVersionHistory,
        upsertLiabilityProfile,
        convertLiabilityTemplate,
      },
    });
  });

  it("requires counterparty for personal debt save", async () => {
    render(
      <LiabilityProfileModal
        accountId="acc-1"
        isOpen={true}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
        initialTemplate={LiabilityTemplate.PersonalDebt}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Save Liability Profile" }));

    expect(await screen.findByText("Counterparty name is required")).toBeTruthy();
    expect(upsertLiabilityProfile).not.toHaveBeenCalled();
  });

  it("calls convert API from advanced section", async () => {
    render(
      <LiabilityProfileModal
        accountId="acc-2"
        isOpen={true}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
        initialTemplate={LiabilityTemplate.Blank}
      />
    );

    const convertSelect = (await screen.findAllByRole("combobox"))[1];
    fireEvent.change(convertSelect, { target: { value: LiabilityTemplate.PersonalDebt } });
    fireEvent.click(screen.getByRole("button", { name: "Convert" }));

    await waitFor(() => {
      expect(convertLiabilityTemplate).toHaveBeenCalledTimes(1);
    });
    expect(convertLiabilityTemplate.mock.calls[0][0].targetTemplate).toBe(LiabilityTemplate.PersonalDebt);
  });

  it("renders read-only balance message when transactions exist", async () => {
    getLiabilityProfile.mockResolvedValueOnce({
      success: true,
      profile: {
        template: LiabilityTemplate.PersonalDebt,
        currentAmountOwed: 321,
        counterpartyName: "Taylor",
        hasPostedTransactions: true,
      },
    });

    render(
      <LiabilityProfileModal
        accountId="acc-3"
        isOpen={true}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
        initialTemplate={LiabilityTemplate.PersonalDebt}
      />
    );

    const balanceInput = await screen.findByDisplayValue("321");
    expect(balanceInput).toHaveProperty("disabled", true);
    expect(
      screen.getByText("Balance owed is read-only once transactions exist. Use Opening Balance to adjust baseline.")
    ).toBeTruthy();
  });

  it("shows expandable history details in advanced section", async () => {
    getLiabilityVersionHistory.mockResolvedValueOnce({
      success: true,
      history: [
        {
          id: "v-1",
          effectiveDate: "2026-03-01",
          updatedAt: "2026-03-02T10:00:00.000Z",
          template: LiabilityTemplate.PersonalDebt,
          counterpartyName: "Chris",
        },
      ],
    });

    render(
      <LiabilityProfileModal
        accountId="acc-4"
        isOpen={true}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
        initialTemplate={LiabilityTemplate.PersonalDebt}
      />
    );

    const historyRow = await screen.findByRole("button", { name: /2026-03-01/i });
    fireEvent.click(historyRow);

    expect(await screen.findByText(/"counterpartyName": "Chris"/)).toBeTruthy();
  });
});
