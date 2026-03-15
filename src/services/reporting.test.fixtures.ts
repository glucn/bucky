const parseDate = (date: string): Date => {
  const [year, month, day] = date.split("-").map((value) => Number(value));
  return new Date(Date.UTC(year, month - 1, day));
};

const toDateString = (date: Date): string => {
  return date.toISOString().slice(0, 10);
};

const addDays = (date: string, days: number): string => {
  const parsed = parseDate(date);
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return toDateString(parsed);
};

const addMonths = (date: string, months: number): string => {
  const parsed = parseDate(date);
  parsed.setUTCMonth(parsed.getUTCMonth() + months);
  return toDateString(parsed);
};

export const monthKeyOf = (date: string): string => {
  return date.slice(0, 7);
};

export const buildRecentMonthKeys = (asOfDate: string, count: number): string[] => {
  const result: string[] = [];
  for (let offset = count - 1; offset >= 0; offset -= 1) {
    result.push(monthKeyOf(addMonths(asOfDate, -offset)));
  }

  return result;
};

export const REPORTING_FIXTURE_ACCOUNT_KEYS = {
  userCash: "user.cash",
  userBank: "user.bank",
  categorySalary: "category.salary",
  categoryGroceries: "category.groceries",
  categoryUnassignedIncome: "category.unassigned-income",
  categoryUnassignedExpense: "category.unassigned-expense",
} as const;

export type ReportingFixtureAccountKey =
  (typeof REPORTING_FIXTURE_ACCOUNT_KEYS)[keyof typeof REPORTING_FIXTURE_ACCOUNT_KEYS];

export type ReportingFixtureTransactionKind = "income" | "expense" | "transfer";

export type ReportingFixtureTransaction = {
  date: string;
  description: string;
  amount: number;
  kind: ReportingFixtureTransactionKind;
  from: ReportingFixtureAccountKey;
  to: ReportingFixtureAccountKey;
  unassigned?: boolean;
};

export const buildIncomeOnlyFixture = (asOfDate: string): ReportingFixtureTransaction[] => {
  return [
    {
      date: addDays(asOfDate, -12),
      description: "Salary payment",
      amount: 1400,
      kind: "income",
      from: REPORTING_FIXTURE_ACCOUNT_KEYS.categorySalary,
      to: REPORTING_FIXTURE_ACCOUNT_KEYS.userCash,
    },
    {
      date: addDays(asOfDate, -3),
      description: "Bonus payment",
      amount: 300,
      kind: "income",
      from: REPORTING_FIXTURE_ACCOUNT_KEYS.categorySalary,
      to: REPORTING_FIXTURE_ACCOUNT_KEYS.userBank,
    },
  ];
};

export const buildExpenseOnlyFixture = (asOfDate: string): ReportingFixtureTransaction[] => {
  return [
    {
      date: addDays(asOfDate, -10),
      description: "Groceries",
      amount: 120,
      kind: "expense",
      from: REPORTING_FIXTURE_ACCOUNT_KEYS.userCash,
      to: REPORTING_FIXTURE_ACCOUNT_KEYS.categoryGroceries,
    },
    {
      date: addDays(asOfDate, -2),
      description: "Restaurant",
      amount: 80,
      kind: "expense",
      from: REPORTING_FIXTURE_ACCOUNT_KEYS.userBank,
      to: REPORTING_FIXTURE_ACCOUNT_KEYS.categoryGroceries,
    },
  ];
};

export const buildMixedFixture = (asOfDate: string): ReportingFixtureTransaction[] => {
  return [
    ...buildIncomeOnlyFixture(asOfDate),
    ...buildExpenseOnlyFixture(asOfDate),
  ];
};

export const buildTransferHeavyFixture = (asOfDate: string): ReportingFixtureTransaction[] => {
  return [
    ...buildMixedFixture(asOfDate),
    {
      date: addDays(asOfDate, -9),
      description: "Transfer to bank",
      amount: 250,
      kind: "transfer",
      from: REPORTING_FIXTURE_ACCOUNT_KEYS.userCash,
      to: REPORTING_FIXTURE_ACCOUNT_KEYS.userBank,
    },
    {
      date: addDays(asOfDate, -1),
      description: "Transfer to cash",
      amount: 90,
      kind: "transfer",
      from: REPORTING_FIXTURE_ACCOUNT_KEYS.userBank,
      to: REPORTING_FIXTURE_ACCOUNT_KEYS.userCash,
    },
  ];
};

export const buildUnassignedHeavyFixture = (asOfDate: string): ReportingFixtureTransaction[] => {
  return [
    ...buildMixedFixture(asOfDate),
    {
      date: addDays(asOfDate, -14),
      description: "Unknown incoming",
      amount: 220,
      kind: "income",
      from: REPORTING_FIXTURE_ACCOUNT_KEYS.categoryUnassignedIncome,
      to: REPORTING_FIXTURE_ACCOUNT_KEYS.userCash,
      unassigned: true,
    },
    {
      date: addDays(asOfDate, -4),
      description: "Unknown expense",
      amount: 170,
      kind: "expense",
      from: REPORTING_FIXTURE_ACCOUNT_KEYS.userCash,
      to: REPORTING_FIXTURE_ACCOUNT_KEYS.categoryUnassignedExpense,
      unassigned: true,
    },
  ];
};
