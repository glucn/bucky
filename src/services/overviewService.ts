import { AccountSubtype, AccountType } from "../shared/accountTypes";
import { OverviewDashboardPayload } from "../shared/overview";
import { appSettingsService } from "./appSettingsService";
import { databaseService } from "./database";
import { investmentService } from "./investmentService";
import { valuationConversionService } from "./valuationConversionService";

function getLocalDateString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

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
      select: { amount: true },
    });

    return round2(lines.reduce((sum, line) => sum + line.amount, 0));
  }

  public async getOverviewDashboard(asOfDate?: string): Promise<OverviewDashboardPayload> {
    const effectiveAsOfDate = asOfDate ?? getLocalDateString(new Date());

    const userAccounts = await databaseService.prismaClient.account.findMany({
      where: { type: AccountType.User },
      include: { investmentProperties: true },
      orderBy: { createdAt: "asc" },
    });

    const reportingCurrency = (await appSettingsService.getBaseCurrency()) ?? "USD";
    let assetTotal = 0;
    let liabilityTotal = 0;
    let netWorthUnavailable = false;

    let usedEstimatedFxRate = false;
    const missingFxPairs = new Set<string>();
    const conversionRateCache = new Map<string, { rate: number | null; source: string; pair: string | null }>();

    const convertToReportingCurrency = async (
      amount: number,
      fromCurrency: string
    ): Promise<number | null> => {
      const cacheKey = `${fromCurrency}->${reportingCurrency}@${effectiveAsOfDate}`;
      let conversion = conversionRateCache.get(cacheKey);

      if (!conversion) {
        const result = await valuationConversionService.convertAmount({
          amount: 1,
          sourceCurrency: fromCurrency,
          targetCurrency: reportingCurrency,
          asOfDate: effectiveAsOfDate,
        });

        conversion = {
          rate: result.rate,
          source: result.source,
          pair: result.pair,
        };
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

      return amount * conversion.rate;
    };

    for (const account of userAccounts) {
      let balance = await this.getBalanceAsOfDate(account.id, effectiveAsOfDate);

      if (account.investmentProperties) {
        const positionDetails = await investmentService.getPositionDetails(
          account.id,
          effectiveAsOfDate
        );
        balance = positionDetails.marketValue ?? positionDetails.costBasis;
      }

      const convertedBalance = await convertToReportingCurrency(balance, account.currency);
      if (convertedBalance === null) {
        netWorthUnavailable = true;
        continue;
      }

      if (account.subtype === AccountSubtype.Liability) {
        liabilityTotal += Math.abs(convertedBalance);
      } else {
        assetTotal += convertedBalance;
      }
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

        const convertedAmount = await convertToReportingCurrency(Math.abs(line.amount), line.currency);
        if (convertedAmount === null) {
          if (line.account.subtype === AccountSubtype.Asset) {
            month.income = null;
          } else {
            month.expense = null;
          }
          continue;
        }

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
      let amount = 0;
      let hasMissingConversion = false;

      for (const tradeCashAccount of portfolioAccounts.tradeCashAccounts) {
        const rawAmount = await this.getBalanceAsOfDate(tradeCashAccount.id, effectiveAsOfDate);
        const convertedAmount = await convertToReportingCurrency(rawAmount, tradeCashAccount.currency);
        if (convertedAmount === null) {
          hasMissingConversion = true;
          continue;
        }
        amount += convertedAmount;
      }

      for (const securityAccount of portfolioAccounts.securities) {
        const positionDetails = await investmentService.getPositionDetails(
          securityAccount.id,
          effectiveAsOfDate
        );
        const rawAmount = positionDetails.marketValue ?? positionDetails.costBasis;
        const convertedAmount = await convertToReportingCurrency(rawAmount, securityAccount.currency);
        if (convertedAmount === null) {
          hasMissingConversion = true;
          continue;
        }
        amount += convertedAmount;
      }

      const roundedAmount = round2(amount);
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
      : round2(allocationSlices.reduce((total, slice) => total + (slice.amount ?? 0), 0));
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
        amount: netWorthUnavailable ? null : round2(assetTotal - liabilityTotal),
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
