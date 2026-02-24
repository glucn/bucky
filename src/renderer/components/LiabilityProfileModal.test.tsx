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
});
