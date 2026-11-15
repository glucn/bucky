import { AccountSubtype, AccountType } from "../shared/accountTypes";
import { OverviewDashboardPayload } from "../shared/overview";
import { appSettingsService } from "./appSettingsService";
import { databaseService } from "./database";
import { investmentService, InvestmentHistoryUnavailableError } from "./investmentService";
import { valuationConversionService, type ValuationQuote } from "./valuationConversionService";
import { resolveValuationDate } from "./valuationDate";
import { addDecimalRatios, journalAmountFromCents, readPostingAmount, roundRatioToJournalAmount,
  sumJournalCents, toJournalCents, zeroRatio, type DecimalRatio } from "./journalPrecision";

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function getRecentMonthKeys(asOfDate: string, count: number): string[] {
  const [year, month] = asOfDate.split("-").map((value) => Number(value));
  const result: string[] = [];

  for (let index = count - 1; index >= 0; index -= 1) {
    const date = new Date(year, month - 1 - index, 1);
    result.push(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`);
  }

  return result;
}

class OverviewService {
  private async securityValue(accountId: string, date: string): Promise<number | null> {
    try { return (await investmentService.getPositionDetails(accountId, date)).marketValue; }
    catch (error) { if (error instanceof InvestmentHistoryUnavailableError) return null; throw error; }
  }
  private async getBalanceAsOfDate(accountId: string, asOfDate: string): Promise<number> {
    const lines = await databaseService.prismaClient.journalLine.findMany({
      where: {
        accountId,
        entry: {
          date: {
            lte: asOfDate,
          },
        },
      },
      select: { amount: true, amountCents: true },
    });

    return journalAmountFromCents(sumJournalCents(lines));
  }

  public async getOverviewDashboard(asOfDate?: string): Promise<OverviewDashboardPayload> {
    const effectiveAsOfDate = resolveValuationDate(asOfDate);

    const userAccounts = await databaseService.prismaClient.account.findMany({
      where: { type: AccountType.User },
      include: { investmentProperties: true },
      orderBy: { createdAt: "asc" },
    });

    const reportingCurrency = (await appSettingsService.getBaseCurrency()) ?? "USD";
    let netWorth = zeroRatio;
    let netWorthUnavailable = false;

    let usedEstimatedFxRate = false;
    const missingFxPairs = new Set<string>();
    const conversionRateCache = new Map<string, ValuationQuote>();

    const convertToReportingCurrency = async (
      amount: number,
      fromCurrency: string,
    ): Promise<DecimalRatio | null> => {
      if (amount === 0) return zeroRatio;
      const cacheKey = `${fromCurrency}->${reportingCurrency}@${effectiveAsOfDate}`;
      let conversion = conversionRateCache.get(cacheKey);

      if (!conversion) {
        conversion = await valuationConversionService.getQuote({
          sourceCurrency: fromCurrency,
          targetCurrency: reportingCurrency,
          asOfDate: effectiveAsOfDate,
        });

        conversionRateCache.set(cacheKey, conversion);
      }

      if (conversion.source === "latest_fallback") {
        usedEstimatedFxRate = true;
      }

      if (conversion.source === "unavailable" || conversion.rate === null) {
        if (conversion.pair) {
          missingFxPairs.add(conversion.pair);
        }
        return null;
      }

      return conversion.applyExact(amount);
    };

    for (const account of userAccounts) {
      let balance = await this.getBalanceAsOfDate(account.id, effectiveAsOfDate);

      if (account.investmentProperties) {
        const value = await this.securityValue(account.id, effectiveAsOfDate);
        if (value === null) { netWorthUnavailable = true; continue; }
        balance = value;
      }

      const amount = account.subtype === AccountSubtype.Liability ? -Math.abs(balance) : balance;
      const convertedBalance = await convertToReportingCurrency(amount, account.currency);
      if (convertedBalance === null) {
        netWorthUnavailable = true;
        continue;
      }

      netWorth = addDecimalRatios(netWorth, convertedBalance);
    }

    const monthKeys = getRecentMonthKeys(effectiveAsOfDate, 6);
    const trendByMonth = new Map<
      string,
      { monthKey: string; income: number | null; expense: number | null }
    >(monthKeys.map((monthKey) => [monthKey, { monthKey, income: 0, expense: 0 }]));

    const firstMonthKey = monthKeys[0];
    const trendEntries = await databaseService.prismaClient.journalEntry.findMany({
      where: {
        date: {
          gte: `${firstMonthKey}-01`,
          lte: effectiveAsOfDate,
        },
      },
      include: {
        lines: {
          include: {
            account: true,
          },
        },
      },
    });

    for (const entry of trendEntries) {
      const month = trendByMonth.get(entry.date.slice(0, 7));
      if (!month) {
        continue;
      }

      const hasOnlyUserLines = entry.lines.every((line) => line.account.type === AccountType.User);
      if (hasOnlyUserLines) {
        continue;
      }

      for (const line of entry.lines) {
        if (line.account.type !== AccountType.Category) {
          continue;
        }

        const converted = await convertToReportingCurrency(Math.abs(readPostingAmount(line)), line.currency);
        if (converted === null) {
          if (line.account.subtype === AccountSubtype.Asset) {
            month.income = null;
          } else {
            month.expense = null;
          }
          continue;
        }

        const convertedAmount = roundRatioToJournalAmount(converted);
        if (line.account.subtype === AccountSubtype.Asset) {
          if (month.income !== null) {
            month.income = round2(month.income + convertedAmount);
          }
        } else {
          if (month.expense !== null) {
            month.expense = round2(month.expense + convertedAmount);
          }
        }
      }
    }

    const allocationSlices: Array<{
      portfolioId: string;
      portfolioName: string;
      amount: number | null;
      ratio: number | null;
    }> = [];

    const investmentPortfolios = await investmentService.getInvestmentPortfolios();
    for (const portfolio of investmentPortfolios) {
      const portfolioAccounts = await investmentService.getPortfolioAccounts(portfolio.id);
      let amount = zeroRatio;
      let hasMissingConversion = false;

      for (const tradeCashAccount of portfolioAccounts.tradeCashAccounts) {
        const rawAmount = await this.getBalanceAsOfDate(tradeCashAccount.id, effectiveAsOfDate);
        const convertedAmount = await convertToReportingCurrency(rawAmount, tradeCashAccount.currency);
        if (convertedAmount === null) {
          hasMissingConversion = true;
          continue;
        }
        amount = addDecimalRatios(amount, convertedAmount);
      }

      for (const securityAccount of portfolioAccounts.securities) {
        const rawAmount = await this.securityValue(securityAccount.id, effectiveAsOfDate);
        if (rawAmount === null) { hasMissingConversion = true; continue; }
        const convertedAmount = await convertToReportingCurrency(rawAmount, securityAccount.currency);
        if (convertedAmount === null) {
          hasMissingConversion = true;
          continue;
        }
        amount = addDecimalRatios(amount, convertedAmount);
      }

      const roundedAmount = roundRatioToJournalAmount(amount);
      if (roundedAmount <= 0 && !hasMissingConversion) {
        continue;
      }

      allocationSlices.push({
        portfolioId: portfolio.id,
        portfolioName: portfolio.name,
        amount: hasMissingConversion ? null : roundedAmount,
        ratio: null,
      });
    }

    const hasAllocationConversionGap = allocationSlices.some((slice) => slice.amount === null);
    const allocationTotal = hasAllocationConversionGap
      ? null
      : journalAmountFromCents(allocationSlices.reduce((total, slice) => total + BigInt(toJournalCents(slice.amount ?? 0)), 0n));
    const hasAllocationData =
      allocationSlices.length > 0 && (allocationTotal === null || allocationTotal > 0);

    const allocation = hasAllocationData
      ? {
          hasData: true,
          currency: reportingCurrency,
          total: allocationTotal,
          slices: allocationSlices.map((slice) => ({
            ...slice,
            ratio:
              allocationTotal === null || allocationTotal <= 0 || slice.amount === null
                ? null
                : round2(slice.amount / allocationTotal),
          })),
        }
      : {
          hasData: false,
          currency: reportingCurrency,
          total: 0 as number | null,
          slices: [],
          emptyHintKey: "overview.investmentAllocation.empty",
        };

    return {
      asOfDate: effectiveAsOfDate,
      netWorth: {
        amount: netWorthUnavailable ? null : roundRatioToJournalAmount(netWorth),
        currency: reportingCurrency,
      },
      incomeExpenseTrend6m: {
        currency: reportingCurrency,
        months: monthKeys.map((monthKey) => trendByMonth.get(monthKey)!),
      },
      investmentAllocation: allocation,
      metadata: {
        usedEstimatedFxRate,
        missingFxPairs: [...missingFxPairs].sort(),
      },
    };
  }
}

export const overviewService = new OverviewService();
