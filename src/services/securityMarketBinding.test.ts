import { beforeEach, expect, it } from "vitest";
import { resetTestDatabase } from "./database.test.utils";
import { databaseService } from "./database";
import { investmentService } from "./investmentService";
import { bindSecurityMarket } from "./securityMarketBinding";

beforeEach(resetTestDatabase);
async function security() {
  const { group } = await investmentService.createInvestmentPortfolio("Synthetic market identity");
  const account = await investmentService.createSecurityAccount(group.id, "ABC");
  return databaseService.prismaClient.account.findUniqueOrThrow({ where: { id: account.id } });
}
const request = (accountId: string) => ({ accountId, market: "NASDAQ", quoteCurrency: "USD", expectedMarket: null });

it("binds explicitly without inferring a market or changing holdings, lots, currencies or postings", async () => {
  const account = await security();
  await databaseService.prismaClient.investmentProperties.update({ where: { accountId: account.id }, data: { quantity: 3, lots: '[{"quantity":3,"pricePerShare":10}]' } });
  const before = await databaseService.prismaClient.investmentProperties.findUniqueOrThrow({ where: { accountId: account.id } });
  await bindSecurityMarket(request(account.id));
  const after = await databaseService.prismaClient.investmentProperties.findUniqueOrThrow({ where: { accountId: account.id } });
  expect(after.market).toBe("NASDAQ"); expect(after.quantity).toBe(before.quantity); expect(after.lots).toBe(before.lots);
  expect(after.tickerSymbol).toBe(before.tickerSymbol);
  expect((await databaseService.prismaClient.account.findUniqueOrThrow({ where: { id: account.id } })).currency).toBe("USD");
  expect(await databaseService.prismaClient.journalEntry.count()).toBe(0);
  expect(await databaseService.prismaClient.securityMetadata.findFirst()).toMatchObject({ ticker: "ABC", market: "NASDAQ", quoteCurrency: "USD" });
});

it("requires an exact expected binding and forbids relabeling an established holding", async () => {
  const account = await security(); await bindSecurityMarket(request(account.id));
  await expect(bindSecurityMarket({ ...request(account.id), market: "NYSE" })).rejects.toThrow(/changed|authenticate|refresh/i);
  await databaseService.prismaClient.investmentProperties.update({ where: { accountId: account.id }, data: { quantity: 1 } });
  await expect(bindSecurityMarket({ ...request(account.id), expectedMarket: "NASDAQ", market: "NYSE" })).rejects.toThrow(/holding|history/i);
  expect((await databaseService.prismaClient.investmentProperties.findUniqueOrThrow({ where: { accountId: account.id } })).market).toBe("NASDAQ");
});

it("retains a market identity even when quantity is zero but stored lots preserve history", async () => {
  const account = await security(); await bindSecurityMarket(request(account.id));
  await databaseService.prismaClient.investmentProperties.update({ where: { accountId: account.id }, data: { lots: '[{"quantity":1}]' } });
  await expect(bindSecurityMarket({ ...request(account.id), expectedMarket: "NASDAQ", market: "NYSE" })).rejects.toThrow(/holding|history/i);
});

it("retains a listing when dividend-only activity has no security journal line or units", async () => {
  const account = await security(); await bindSecurityMarket(request(account.id));
  await investmentService.recordDividend({ portfolioId: account.groupId!, securityAccountId: account.id, tickerSymbol: "ABC", amount: 5, date: "2026-01-02" });
  expect(await databaseService.prismaClient.journalLine.count({ where: { accountId: account.id } })).toBe(0);
  const before = await databaseService.prismaClient.investmentActivity.findMany({ where: { accountId: account.id } });
  await expect(bindSecurityMarket({ ...request(account.id), expectedMarket: "NASDAQ", market: "NYSE" })).rejects.toThrow(/holding|history/i);
  expect((await databaseService.prismaClient.investmentProperties.findUniqueOrThrow({ where: { accountId: account.id } })).market).toBe("NASDAQ");
  expect(await databaseService.prismaClient.investmentActivity.findMany({ where: { accountId: account.id } })).toEqual(before);
  expect(await databaseService.prismaClient.securityMetadata.count({ where: { ticker: "ABC", market: "NYSE" } })).toBe(0);
});
it("still allows correcting a genuinely unused listing", async () => {
  const account = await security(); await bindSecurityMarket(request(account.id));
  await bindSecurityMarket({ ...request(account.id), expectedMarket: "NASDAQ", market: "NYSE" });
  expect((await databaseService.prismaClient.investmentProperties.findUniqueOrThrow({ where: { accountId: account.id } })).market).toBe("NYSE");
});

it("does not allow two normalized copies of one market identity in the same portfolio", async () => {
  const account = await security(); await bindSecurityMarket(request(account.id));
  const other = await databaseService.prismaClient.account.create({ data: { name: "Duplicate legacy ticker", type: "user", subtype: "asset", currency: "USD", groupId: account.groupId,
    investmentProperties: { create: { tickerSymbol: " ABC ", quantity: 0, costBasisMethod: "FIFO", lots: "[]" } } } });
  await expect(bindSecurityMarket(request(other.id))).rejects.toThrow(/already|identity/i);
});

it("refuses conflicting currency and metadata instead of relabeling book amounts", async () => {
  const account = await security();
  await expect(bindSecurityMarket({ ...request(account.id), quoteCurrency: "CAD" })).rejects.toThrow(/currency/i);
  await databaseService.prismaClient.securityMetadata.create({ data: { ticker: "ABC", market: "NASDAQ", quoteCurrency: "CAD" } });
  await expect(bindSecurityMarket(request(account.id))).rejects.toThrow(/currency/i);
  expect((await databaseService.prismaClient.investmentProperties.findUniqueOrThrow({ where: { accountId: account.id } })).market).toBeNull();
});

it.each(["", "UNKNOWN", " NASDAQ\u0000"])("rejects unresolved or invalid market %j", async (market) => {
  const account = await security(); await expect(bindSecurityMarket({ ...request(account.id), market })).rejects.toThrow(/market/i);
});

it("rolls metadata back when publishing the holding's binding fails", async () => {
  const account = await security();
  await databaseService.prismaClient.$executeRawUnsafe(`CREATE TRIGGER fail_market_binding BEFORE UPDATE OF market ON InvestmentProperties
    BEGIN SELECT RAISE(ABORT, 'synthetic binding failure'); END`);
  try {
    await expect(bindSecurityMarket(request(account.id))).rejects.toThrow();
    expect(await databaseService.prismaClient.securityMetadata.count()).toBe(0);
    expect((await databaseService.prismaClient.investmentProperties.findUniqueOrThrow({ where: { accountId: account.id } })).market).toBeNull();
  } finally { await databaseService.prismaClient.$executeRawUnsafe("DROP TRIGGER fail_market_binding"); }
});
