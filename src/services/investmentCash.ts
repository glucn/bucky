import type { Prisma } from "@prisma/client";
import { AccountType } from "../shared/accountTypes";
import { parseToStandardDate } from "../shared/dateUtils";
import { cents, investmentTransaction } from "./investmentPosting";
import { selectPortfolioCash } from "./securityHolding";

/** Cash-only investment events must select a currency just as trades do. */
export async function recordInvestmentCash(input: {
  portfolioId: string; amount: number; date: string; kind: "fee" | "interest";
  description?: string; tradeCashAccountId?: string;
}, transaction?: Prisma.TransactionClient) {
  if (typeof input.amount !== "number" || !Number.isFinite(input.amount) || input.amount <= 0) throw new Error("Amount must be a positive number");
  const amount = cents(input.amount) / 100;
  if (amount <= 0) throw new Error("Amount must round to at least one cent");
  if (!input.date || typeof input.date !== "string") throw new Error("Transaction date is required");
  const date = parseToStandardDate(input.date);
  if (!date) throw new Error("Invalid transaction date");
  if (input.description !== undefined && typeof input.description !== "string") throw new Error("Invalid description");
  if (input.kind === "fee" && !input.description?.trim()) throw new Error("Description is required");
  const description = input.description?.trim() || "Interest income";
  return investmentTransaction(async (tx) => {
    const { cash } = await selectPortfolioCash(tx, input.portfolioId, input.tradeCashAccountId);
    const name = input.kind === "fee" ? "Investment Expenses" : "Interest Income";
    const category = await tx.account.findFirst({ where: { name, type: AccountType.Category, isArchived: false } });
    if (!category) throw new Error(`${name} category account not found`);
    const cashLine = { accountId: cash.id, amount: input.kind === "fee" ? -amount : amount, currency: cash.currency, description };
    const categoryLine = { accountId: category.id, amount: -cashLine.amount, currency: cash.currency, description };
    return tx.journalEntry.create({ data: { date, description, displayOrder: Date.now(),
      type: input.kind === "fee" ? "investment_fee" : "interest_income",
      lines: { create: input.kind === "fee" ? [categoryLine, cashLine] : [cashLine, categoryLine] } }, include: { lines: true } });
  }, transaction);
}
