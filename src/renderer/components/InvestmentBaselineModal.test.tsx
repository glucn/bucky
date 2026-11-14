// @vitest-environment jsdom
import React from "react";
import { expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import InvestmentBaselineModal from "./InvestmentBaselineModal";

it("requires explicit review and keeps the entered lots after a save refusal", async () => {
  const invoke = vi.fn(async (channel: string, _input: unknown) => channel === "get-investment-baseline-review"
    ? { success: true, review: { accountId: "holding", ticker: "ABC", currency: "CAD", quantity: 10, costBasis: 100, earliestDate: "2026-01-02", method: "FIFO",
      lots: [{ date: "2026-01-01", quantity: 10, pricePerShare: 10, amount: 100 }] } }
    : { success: false, error: "Review the retained basis again" });
  Object.defineProperty(window, "electron", { configurable: true, value: { ipcRenderer: { invoke } } });
  const onSaved = vi.fn();
  render(<InvestmentBaselineModal accountId="holding" onClose={vi.fn()} onSaved={onSaved} />);
  const check = await screen.findByRole("checkbox");
  const button = screen.getByRole("button", { name: "Confirm baseline" }) as HTMLButtonElement;
  expect(button.disabled).toBe(true);
  fireEvent.click(check);
  fireEvent.change(screen.getByLabelText("Unit price"), { target: { value: "9" } });
  expect(button.disabled).toBe(true);
  fireEvent.click(check);
  fireEvent.click(button);
  expect((await screen.findByRole("alert")).textContent).toBe("Review the retained basis again");
  expect(onSaved).not.toHaveBeenCalled();
  expect(invoke).toHaveBeenCalledWith("confirm-investment-baseline", {
    accountId: "holding", currency: "CAD", date: "2026-01-02", quantity: 10, costBasis: 100,
    lots: [{ date: "2026-01-01", quantity: 10, pricePerShare: 9, amount: 100 }],
  });
  expect((screen.getByLabelText("Unit price") as HTMLInputElement).value).toBe("9");
});
