import { AccountSubtype, AccountType } from "../shared/accountTypes";
import {
  BreakdownRangePreset,
  IncomeExpenseBreakdownFilter,
  IncomeExpenseBreakdownResponse,
  IncomeExpenseTrendFilter,
  IncomeExpenseTrendResponse,
  TrendRangePreset,
} from "../shared/reporting";
import { appSettingsService } from "./appSettingsService";
import { databaseService } from "./database";
import { valuationConversionService } from "./valuationConversionService";

const round2 = (value: number): number => Math.round(value * 100) / 100;

type CategoryBucketRow = {
  categoryId: string | "UNASSIGNED";
  categoryName: string;
  amount: number;
};

const getLocalDateString = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const getRecentMonthKeys = (asOfDate: string, count: number): string[] => {
  const [year, month] = asOfDate.split("-").map((value) => Number(value));
  const result: string[] = [];

  for (let index = count - 1; index >= 0; index -= 1) {
    const date = new Date(year, month - 1 - index, 1);
    result.push(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`);
  }

  return result;
};

const getMonthStartDate = (date: Date): string => {
  return getLocalDateString(new Date(date.getFullYear(), date.getMonth(), 1));
};

const getMonthEndDate = (date: Date): string => {
  return getLocalDateString(new Date(date.getFullYear(), date.getMonth() + 1, 0));
};

const clampEndDateToToday = (endDate: string, today: string): string => {
  return endDate > today ? today : endDate;
};

const getBreakdownRangeByPreset = (
  preset: BreakdownRangePreset,
  today: string
): { startDate: string; endDate: string } => {
  const base = new Date(`${today}T00:00:00`);

  if (preset === "THIS_MONTH") {
    return {
      startDate: getMonthStartDate(base),
      endDate: today,
    };
  }

  if (preset === "LAST_MONTH") {
    const previousMonth = new Date(base.getFullYear(), base.getMonth() - 1, 1);
    return {
      startDate: getMonthStartDate(previousMonth),
      endDate: getMonthEndDate(previousMonth),
    };
  }

  if (preset === "LAST_3_MONTHS" || preset === "LAST_6_MONTHS" || preset === "LAST_12_MONTHS") {
    const monthWindow =
      preset === "LAST_3_MONTHS" ? 2 : preset === "LAST_6_MONTHS" ? 5 : 11;
    const startMonth = new Date(base.getFullYear(), base.getMonth() - monthWindow, 1);
    return {
      startDate: getMonthStartDate(startMonth),
      endDate: today,
    };
  }

  if (preset === "YTD") {
    return {
      startDate: `${base.getFullYear()}-01-01`,
      endDate: today,
    };
  }

  return {
    startDate: today,
    endDate: today,
  };
};

const normalizeCategoryKey = (categoryName: string): { categoryId: string | "UNASSIGNED"; categoryName: string } => {
  if (categoryName === "Uncategorized Income" || categoryName === "Uncategorized Expense") {
    return {
      categoryId: "UNASSIGNED",
      categoryName: "Unassigned",
    };
  }

  return {
    categoryId: categoryName,
    categoryName,
  };
};

const isInternalTransferEntry = (
  lines: Array<{ account: { type: string } }>
): boolean => {
  return lines.every((line) => line.account.type === "user");
};

const createCurrencyConverter = (reportingCurrency: string, asOfDate: string) => {
  const conversionRateCache = new Map<string, number | null>();

  return async (amount: number, sourceCurrency: string): Promise<number | null> => {
    const cacheKey = `${sourceCurrency}->${reportingCurrency}@${asOfDate}`;
    let rate = conversionRateCache.get(cacheKey);

    if (rate === undefined) {
      const conversion = await valuationConversionService.convertAmount({
        amount: 1,
        sourceCurrency,
        targetCurrency: reportingCurrency,
        asOfDate,
      });
      rate = conversion.rate;
      conversionRateCache.set(cacheKey, rate);
    }

    if (rate === null) {
      return null;
    }

    return amount * rate;
  };
};

const getMonthRangeByPreset = (preset: TrendRangePreset, asOfDate: string): string[] => {
  if (preset === "LAST_3_MONTHS") {
    return getRecentMonthKeys(asOfDate, 3);
  }

  if (preset === "LAST_6_MONTHS") {
    return getRecentMonthKeys(asOfDate, 6);
  }

  if (preset === "LAST_12_MONTHS") {
    return getRecentMonthKeys(asOfDate, 12);
  }

  const [year, month] = asOfDate.split("-").map((value) => Number(value));
  const months: string[] = [];
  for (let monthIndex = 1; monthIndex <= month; monthIndex += 1) {
    months.push(`${year}-${String(monthIndex).padStart(2, "0")}`);
  }

  return months;
};

class ReportingService {
  public async getIncomeExpenseTrendReport(
    filter: IncomeExpenseTrendFilter,
    asOfDate?: string
  ): Promise<IncomeExpenseTrendResponse> {
    const effectiveAsOfDate = asOfDate ?? getLocalDateString(new Date());
    const monthKeys = getMonthRangeByPreset(filter.preset, effectiveAsOfDate);
    const reportingCurrency = (await appSettingsService.getBaseCurrency()) ?? "USD";
    const convertToReportingCurrency = createCurrencyConverter(reportingCurrency, effectiveAsOfDate);

    const trendByMonth = new Map<string, { monthKey: string; income: number; expense: number }>(
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

      if (isInternalTransferEntry(entry.lines)) {
        continue;
      }

      for (const line of entry.lines) {
        if (line.account.type !== AccountType.Category) {
          continue;
        }

        const convertedAmount = await convertToReportingCurrency(Math.abs(line.amount), line.currency);
        if (convertedAmount === null) {
          continue;
        }

        if (line.account.subtype === AccountSubtype.Asset) {
          month.income = round2(month.income + convertedAmount);
          continue;
        }

        month.expense = round2(month.expense + convertedAmount);
      }
    }

    const months = monthKeys.map((monthKey) => {
      const month = trendByMonth.get(monthKey)!;
      return {
        monthKey,
        income: month.income,
        expense: month.expense,
        netIncome: round2(month.income - month.expense),
      };
    });

    return {
      range: {
        preset: filter.preset,
        startMonthKey: monthKeys[0],
        endMonthKey: monthKeys[monthKeys.length - 1],
      },
      months,
      metadata: {
        includesUnassignedImplicitly: true,
      },
    };
  }

  public async getIncomeExpenseBreakdownReport(
    filter: IncomeExpenseBreakdownFilter,
    asOfDate?: string
  ): Promise<IncomeExpenseBreakdownResponse> {
    const today = asOfDate ?? getLocalDateString(new Date());
    const reportingCurrency = (await appSettingsService.getBaseCurrency()) ?? "USD";

    const range =
      filter.preset === "CUSTOM" && filter.customRange
        ? {
            startDate: filter.customRange.startDate,
            endDate: clampEndDateToToday(filter.customRange.endDate, today),
          }
        : getBreakdownRangeByPreset(filter.preset, today);
    const convertToReportingCurrency = createCurrencyConverter(reportingCurrency, range.endDate);

    const entries = await databaseService.prismaClient.journalEntry.findMany({
      where: {
        date: {
          gte: range.startDate,
          lte: range.endDate,
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

    const incomeMap = new Map<string, CategoryBucketRow>();
    const expenseMap = new Map<string, CategoryBucketRow>();

    for (const entry of entries) {
      if (isInternalTransferEntry(entry.lines)) {
        continue;
      }

      for (const line of entry.lines) {
        if (line.account.type !== AccountType.Category) {
          continue;
        }

        const convertedAmount = await convertToReportingCurrency(Math.abs(line.amount), line.currency);
        if (convertedAmount === null) {
          continue;
        }

        const normalizedCategory = normalizeCategoryKey(line.account.name);
        const targetMap = line.account.subtype === AccountSubtype.Asset ? incomeMap : expenseMap;
        const bucketKey = `${normalizedCategory.categoryId}`;
        const existing = targetMap.get(bucketKey);

        if (existing) {
          existing.amount = round2(existing.amount + convertedAmount);
          continue;
        }

        targetMap.set(bucketKey, {
          categoryId: normalizedCategory.categoryId,
          categoryName: normalizedCategory.categoryName,
          amount: round2(convertedAmount),
        });
      }
    }

    const incomeTotal = round2([...incomeMap.values()].reduce((sum, row) => sum + row.amount, 0));
    const expenseTotal = round2([...expenseMap.values()].reduce((sum, row) => sum + row.amount, 0));

    const incomeRows = [...incomeMap.values()]
      .sort((a, b) => b.amount - a.amount)
      .map((row) => ({
        ...row,
        ratio: incomeTotal > 0 ? round2(row.amount / incomeTotal) : 0,
      }));

    const expenseRows = [...expenseMap.values()]
      .sort((a, b) => b.amount - a.amount)
      .map((row) => ({
        ...row,
        ratio: expenseTotal > 0 ? round2(row.amount / expenseTotal) : 0,
      }));

    return {
      range: {
        preset: filter.preset,
        startDate: range.startDate,
        endDate: range.endDate,
      },
      kpis: {
        incomeTotal,
        expenseTotal,
        netIncome: round2(incomeTotal - expenseTotal),
      },
      incomeRows,
      expenseRows,
    };
  }
}

export const reportingService = new ReportingService();
