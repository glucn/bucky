export type OverviewTrendMonth = {
  monthKey: string;
  income: number | null;
  expense: number | null;
};

export type OverviewDashboardPayload = {
  asOfDate: string;
  netWorth: {
    amount: number | null;
    currency: string;
  };
  incomeExpenseTrend6m: {
    currency: string;
    months: OverviewTrendMonth[];
  };
  investmentAllocation: {
    hasData: boolean;
    currency: string;
    total: number | null;
    slices: Array<{
      portfolioId: string;
      portfolioName: string;
      amount: number | null;
      ratio: number | null;
    }>;
    emptyHintKey?: string;
  };
  metadata: {
    usedEstimatedFxRate: boolean;
    missingFxPairs: string[];
  };
};
