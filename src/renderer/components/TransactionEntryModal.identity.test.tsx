// @vitest-environment jsdom
import React from "react";
import { expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { TransactionEntryModal } from "./TransactionEntryModal";

it("posts a position's selected account identity rather than relying on its ticker", async () => {
  const invoke = vi.fn(async (channel) => channel === "get-portfolio-accounts" ? { success: true, accounts: { securities: [] } } : { success: true });
  Object.defineProperty(window, "electron", { configurable: true, value: { ipcRenderer: { invoke } } });
  const props: any = { isOpen: true, portfolioId: "portfolio", initialTickerSymbol: "ABC", initialSecurityAccountId: "selected-listing", onClose: vi.fn() };
  const { container } = render(<TransactionEntryModal {...props} />);
  const inputs = screen.getAllByPlaceholderText("0.00");
  fireEvent.change(inputs[0], { target: { value: "1" } }); fireEvent.change(inputs[1], { target: { value: "12" } });
  fireEvent.submit(container.querySelector("form")!);
  await waitFor(() => expect(invoke).toHaveBeenCalledWith("record-buy", expect.objectContaining({ tickerSymbol: "ABC", securityAccountId: "selected-listing" })));
});
