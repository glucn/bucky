import { AccountSubtype, AccountType } from "../shared/accountTypes";
import { OverviewDashboardPayload } from "../shared/overview";
import { databaseService } from "./database";
import { investmentService } from "./investmentService";

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

type FxRateMap = Map<string, { date: string; rate: number }>;

function setLatestRate(map: FxRateMap, pair: string, date: string, rate: number): void {
  const existing = map.get(pair);
  if (!existing || date > existing.date) {
    map.set(pair, { date, rate });
  }
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

    const reportingCurrency = userAccounts[0]?.currency ?? "USD";
    let assetTotal = 0;
    let liabilityTotal = 0;

    for (const account of userAccounts) {
      let balance = await this.getBalanceAsOfDate(account.id, effectiveAsOfDate);

      if (account.investmentProperties) {
        const positionDetails = await investmentService.getPositionDetails(
          account.id,
          effectiveAsOfDate
        );
        balance = positionDetails.marketValue ?? positionDetails.costBasis;
      }

      if (account.subtype === AccountSubtype.Liability) {
        liabilityTotal += Math.abs(balance);
      } else {
        assetTotal += balance;
      }
    }

    const monthKeys = getRecentMonthKeys(effectiveAsOfDate, 6);
    const trendByMonth = new Map(
      monthKeys.map((monthKey) => [monthKey, { monthKey, income: 0, expense: 0 }])
    );

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
        if (line.currency !== reportingCurrency) {
          continue;
        }

        if (line.account.subtype === AccountSubtype.Asset) {
          month.income = round2(month.income + Math.abs(line.amount));
        } else {
          month.expense = round2(month.expense + Math.abs(line.amount));
        }
      }
    }

    const fxEntries = await databaseService.prismaClient.journalEntry.findMany({
      where: {
        type: "currency_transfer",
      },
      include: {
        lines: true,
      },
      orderBy: {
        date: "asc",
      },
    });

    const fxRatesAsOf: FxRateMap = new Map();
    const fxRatesLatest: FxRateMap = new Map();

    for (const entry of fxEntries) {
      const linesByCurrency = new Map<string, { amount: number }>();

      for (const line of entry.lines) {
        if (!linesByCurrency.has(line.currency)) {
          linesByCurrency.set(line.currency, { amount: line.amount });
        }
      }

      const currencies = Array.from(linesByCurrency.keys());
      if (currencies.length < 2) {
        continue;
      }

      const fromCurrency = currencies[0];
      const toCurrency = currencies[1];
      const fromAmount = Math.abs(linesByCurrency.get(fromCurrency)!.amount);
      const toAmount = Math.abs(linesByCurrency.get(toCurrency)!.amount);

      if (fromAmount <= 0 || toAmount <= 0) {
        continue;
      }

      const fromToRate = toAmount / fromAmount;
      const toFromRate = fromAmount / toAmount;

      const fromToPair = `${fromCurrency}->${toCurrency}`;
      const toFromPair = `${toCurrency}->${fromCurrency}`;

      setLatestRate(fxRatesLatest, fromToPair, entry.date, fromToRate);
      setLatestRate(fxRatesLatest, toFromPair, entry.date, toFromRate);

      if (entry.date <= effectiveAsOfDate) {
        setLatestRate(fxRatesAsOf, fromToPair, entry.date, fromToRate);
        setLatestRate(fxRatesAsOf, toFromPair, entry.date, toFromRate);
      }
    }

    let usedEstimatedFxRate = false;
    const missingFxPairs = new Set<string>();

    const convertToReportingCurrency = (
      amount: number,
      fromCurrency: string
    ): number | null => {
      if (fromCurrency === reportingCurrency) {
        return amount;
      }

      const pair = `${fromCurrency}->${reportingCurrency}`;
      const asOfRate = fxRatesAsOf.get(pair);
      if (asOfRate) {
        return amount * asOfRate.rate;
      }

      const latestRate = fxRatesLatest.get(pair);
      if (latestRate) {
        usedEstimatedFxRate = true;
        return amount * latestRate.rate;
      }

      missingFxPairs.add(pair);
      return null;
    };

    const allocationSlices: Array<{
      portfolioId: string;
      portfolioName: string;
      amount: number;
      ratio: number;
    }> = [];

    const investmentPortfolios = await investmentService.getInvestmentPortfolios();
    for (const portfolio of investmentPortfolios) {
      const portfolioAccounts = await investmentService.getPortfolioAccounts(portfolio.id);
      let amount = 0;

      for (const tradeCashAccount of portfolioAccounts.tradeCashAccounts) {
        const rawAmount = await this.getBalanceAsOfDate(tradeCashAccount.id, effectiveAsOfDate);
        const convertedAmount = convertToReportingCurrency(rawAmount, tradeCashAccount.currency);
        if (convertedAmount === null) {
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
        const convertedAmount = convertToReportingCurrency(rawAmount, securityAccount.currency);
        if (convertedAmount === null) {
          continue;
        }
        amount += convertedAmount;
      }

      const roundedAmount = round2(amount);
      if (roundedAmount <= 0) {
        continue;
      }

      allocationSlices.push({
        portfolioId: portfolio.id,
        portfolioName: portfolio.name,
        amount: roundedAmount,
        ratio: 0,
      });
    }

    const allocationTotal = round2(
      allocationSlices.reduce((total, slice) => total + slice.amount, 0)
    );
    const hasAllocationData = allocationSlices.length > 0 && allocationTotal > 0;

    const allocation = hasAllocationData
      ? {
          hasData: true,
          currency: reportingCurrency,
          total: allocationTotal,
          slices: allocationSlices.map((slice) => ({
            ...slice,
            ratio: round2(slice.amount / allocationTotal),
          })),
        }
      : {
          hasData: false,
          currency: reportingCurrency,
          total: 0,
          slices: [],
          emptyHintKey: "overview.investmentAllocation.empty",
        };

    return {
      asOfDate: effectiveAsOfDate,
      netWorth: {
        amount: round2(assetTotal - liabilityTotal),
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
