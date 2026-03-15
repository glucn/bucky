import { AccountSubtype, AccountType } from "../shared/accountTypes";
import {
  IncomeExpenseTrendFilter,
  IncomeExpenseTrendResponse,
  TrendRangePreset,
} from "../shared/reporting";
import { appSettingsService } from "./appSettingsService";
import { databaseService } from "./database";
import { valuationConversionService } from "./valuationConversionService";

const round2 = (value: number): number => Math.round(value * 100) / 100;

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

    const conversionRateCache = new Map<string, number | null>();

    const convertToReportingCurrency = async (
      amount: number,
      sourceCurrency: string
    ): Promise<number | null> => {
      const cacheKey = `${sourceCurrency}->${reportingCurrency}@${effectiveAsOfDate}`;
      let rate = conversionRateCache.get(cacheKey);

      if (rate === undefined) {
        const conversion = await valuationConversionService.convertAmount({
          amount: 1,
          sourceCurrency,
          targetCurrency: reportingCurrency,
          asOfDate: effectiveAsOfDate,
        });
        rate = conversion.rate;
        conversionRateCache.set(cacheKey, rate);
      }

      if (rate === null) {
        return null;
      }

      return amount * rate;
    };

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
}

export const reportingService = new ReportingService();
