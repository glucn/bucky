export const TREND_RANGE_PRESETS = [
  "LAST_3_MONTHS",
  "LAST_6_MONTHS",
  "YTD",
  "LAST_12_MONTHS",
] as const;

export type TrendRangePreset = (typeof TREND_RANGE_PRESETS)[number];

export const BREAKDOWN_RANGE_PRESETS = [
  "THIS_MONTH",
  "LAST_MONTH",
  "LAST_3_MONTHS",
  "LAST_6_MONTHS",
  "YTD",
  "LAST_12_MONTHS",
  "CUSTOM",
] as const;

export type BreakdownRangePreset = (typeof BREAKDOWN_RANGE_PRESETS)[number];

export type IncomeExpenseTrendFilter = {
  preset: TrendRangePreset;
};

export type IncomeExpenseBreakdownFilter = {
  preset: BreakdownRangePreset;
  customRange?: {
    startDate: string;
    endDate: string;
  };
};

export type IncomeExpenseTrendRequest = IncomeExpenseTrendFilter;

export type IncomeExpenseTrendResponse = {
  range: {
    preset: TrendRangePreset;
    startMonthKey: string;
    endMonthKey: string;
  };
  months: Array<{
    monthKey: string;
    income: number;
    expense: number;
    netIncome: number;
  }>;
  metadata: {
    includesUnassignedImplicitly: true;
  };
};

export type IncomeExpenseBreakdownRequest = IncomeExpenseBreakdownFilter;

export type IncomeExpenseBreakdownRow = {
  categoryId: string | "UNASSIGNED";
  categoryName: string;
  amount: number;
  ratio: number;
};

export type IncomeExpenseBreakdownResponse = {
  range: {
    preset: BreakdownRangePreset;
    startDate: string;
    endDate: string;
  };
  kpis: {
    incomeTotal: number;
    expenseTotal: number;
    netIncome: number;
  };
  incomeRows: IncomeExpenseBreakdownRow[];
  expenseRows: IncomeExpenseBreakdownRow[];
};

export const DEFAULT_TREND_FILTER: IncomeExpenseTrendFilter = {
  preset: "LAST_6_MONTHS",
};

export const DEFAULT_BREAKDOWN_FILTER: IncomeExpenseBreakdownFilter = {
  preset: "THIS_MONTH",
};

export const REPORTING_TREND_FILTER_SETTING_KEY = "reporting.trend.filter";
export const REPORTING_BREAKDOWN_FILTER_SETTING_KEY = "reporting.breakdown.filter";

const STANDARD_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const toStringRecord = (value: unknown): Record<string, unknown> | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
};

export const isTrendRangePreset = (value: unknown): value is TrendRangePreset => {
  return typeof value === "string" && TREND_RANGE_PRESETS.includes(value as TrendRangePreset);
};

export const isBreakdownRangePreset = (value: unknown): value is BreakdownRangePreset => {
  return typeof value === "string" && BREAKDOWN_RANGE_PRESETS.includes(value as BreakdownRangePreset);
};

export const isStandardDateString = (value: unknown): value is string => {
  return typeof value === "string" && STANDARD_DATE_PATTERN.test(value);
};

export const normalizeTrendFilter = (input: unknown): IncomeExpenseTrendFilter => {
  const record = toStringRecord(input);
  if (!record || !isTrendRangePreset(record.preset)) {
    return DEFAULT_TREND_FILTER;
  }

  return {
    preset: record.preset,
  };
};

export const normalizeBreakdownFilter = (input: unknown): IncomeExpenseBreakdownFilter => {
  const record = toStringRecord(input);
  if (!record || !isBreakdownRangePreset(record.preset)) {
    return DEFAULT_BREAKDOWN_FILTER;
  }

  if (record.preset !== "CUSTOM") {
    return {
      preset: record.preset,
    };
  }

  const customRange = toStringRecord(record.customRange);
  if (!customRange) {
    return DEFAULT_BREAKDOWN_FILTER;
  }

  if (!isStandardDateString(customRange.startDate) || !isStandardDateString(customRange.endDate)) {
    return DEFAULT_BREAKDOWN_FILTER;
  }

  return {
    preset: "CUSTOM",
    customRange: {
      startDate: customRange.startDate,
      endDate: customRange.endDate,
    },
  };
};
