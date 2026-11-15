import { expect, it } from "vitest";
import { AccountType } from "../shared/accountTypes";
import { databaseService } from "./database";
import { verifyBook } from "./bookVerification";

const db = () => databaseService.prismaClient;

async function fixture() {
  const [cad, usd, category, equity] = await Promise.all([
    db().account.create({ data: { name: "Checker CAD", currency: "CAD", type: AccountType.User } }),
    db().account.create({ data: { name: "Checker USD", currency: "USD", type: AccountType.User } }),
    db().account.create({ data: { name: "Checker expenses", currency: "USD", type: AccountType.Category } }),
    db().account.create({ data: { name: "Checker equity", currency: "USD", type: AccountType.System } }),
  ]);
  const entry = (lines: Array<{ accountId: string; amount: number; currency: string; exchangeRate?: number }>, type?: string) =>
    db().journalEntry.create({ data: { date: "2026-11-01", type, lines: { create: lines } }, include: { lines: true } });
  return { cad, usd, category, equity, entry };
}

it("accepts balanced native-currency postings, portfolio FX and nonfinancial splits", async () => {
  const { cad, usd, category, equity, entry } = await fixture();
  await entry([{ accountId: cad.id, amount: -12, currency: "CAD" }, { accountId: category.id, amount: 12, currency: "CAD" }]);
  await entry([{ accountId: cad.id, amount: 12, currency: "CAD" }, { accountId: equity.id, amount: -12, currency: "CAD" }]);
  await entry([{ accountId: cad.id, amount: -12, currency: "CAD", exchangeRate: 0.75 }, { accountId: usd.id, amount: 9, currency: "USD", exchangeRate: 0.75 }], "investment_cash_deposit");
  await entry([], "stock_split");
  expect(await verifyBook()).toEqual({ findings: [] });
});

it("reports persisted posting discrepancies by record and leaves the book unchanged", async () => {
  const { cad, usd, category, entry } = await fixture();
  const uneven = await entry([{ accountId: cad.id, amount: -12, currency: "CAD" }, { accountId: category.id, amount: 11.99, currency: "CAD" }]);
  const mislabeled = await entry([{ accountId: cad.id, amount: -12, currency: "USD" }, { accountId: category.id, amount: 12, currency: "USD" }]);
  const mixed = await entry([{ accountId: cad.id, amount: -12, currency: "CAD" }, { accountId: usd.id, amount: 12, currency: "USD" }]);
  const badFx = await entry([{ accountId: cad.id, amount: -12, currency: "CAD", exchangeRate: 0.75 }, { accountId: usd.id, amount: 10, currency: "USD", exchangeRate: 0.75 }], "currency_transfer");
  const mismatchedRate = await entry([{ accountId: cad.id, amount: -12, currency: "CAD", exchangeRate: 0.75 }, { accountId: usd.id, amount: 9, currency: "USD", exchangeRate: 0.8 }], "investment_cash_withdrawal");
  const missing = await entry([]);
  const snapshot = () => db().journalEntry.findMany({ orderBy: { id: "asc" }, include: { lines: { orderBy: { id: "asc" } } } });
  const before = await snapshot();

  expect((await verifyBook()).findings).toEqual(expect.arrayContaining([
    expect.objectContaining({ code: "journal-unbalanced", entryId: uneven.id }),
    expect.objectContaining({ code: "journal-account-currency", entryId: mislabeled.id, lineId: mislabeled.lines.find((line) => line.accountId === cad.id)?.id }),
    expect.objectContaining({ code: "journal-unbalanced", entryId: mixed.id }),
    expect.objectContaining({ code: "journal-fx", entryId: badFx.id }),
    expect.objectContaining({ code: "journal-fx", entryId: mismatchedRate.id }),
    expect.objectContaining({ code: "journal-postings", entryId: missing.id }),
  ]));
  expect(await snapshot()).toEqual(before);
});
