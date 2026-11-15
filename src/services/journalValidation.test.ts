import { expect, it } from "vitest";
import { resolveCurrencyTransferAmounts } from "./journalValidation";
import { toJournalCents } from "./journalPrecision";

it("rounds decimal half cents away from zero and enforces the safe range", () => {
  expect(toJournalCents(1.005)).toBe(101);
  expect(toJournalCents(-1.005)).toBe(-101);
  expect(toJournalCents(1e-7)).toBe(0);
  expect(() => toJournalCents(Number.MAX_SAFE_INTEGER)).toThrow(/precision/);
  expect(() => toJournalCents(Infinity)).toThrow(/precision/);
});

it("rounds derived FX amounts using exact decimal multiplication and division", () => {
  expect(resolveCurrencyTransferAmounts({ amountFrom: 1, exchangeRate: 1.005 })).toEqual({
    amountFrom: 1, amountTo: 1.01, exchangeRate: 1.005,
  });
  expect(resolveCurrencyTransferAmounts({ amountTo: 2.01, exchangeRate: 2 })).toEqual({
    amountFrom: 1.01, amountTo: 2.01, exchangeRate: 2,
  });
});

it("accepts the existing one-cent FX tolerance exactly at the boundary", () => {
  expect(resolveCurrencyTransferAmounts({ amountFrom: 1, amountTo: 1.01, exchangeRate: 1 }).amountTo).toBe(1.01);
  expect(() => resolveCurrencyTransferAmounts({ amountFrom: 1, amountTo: 1.02, exchangeRate: 1 })).toThrow(/inconsistent/);
});
