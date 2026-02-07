export type OverviewTrendMonth = {
  monthKey: string;
  income: number;
  expense: number;
};

export type OverviewDashboardPayload = {
  asOfDate: string;
  netWorth: {
    amount: number;
    currency: string;
  };
  incomeExpenseTrend6m: {
    currency: string;
    months: OverviewTrendMonth[];
  };
  investmentAllocation: {
    hasData: boolean;
    currency: string;
    total: number;
    slices: Array<{
      portfolioId: string;
      portfolioName: string;
      amount: number;
      ratio: number;
    }>;
    emptyHintKey?: string;
  };
  metadata: {
    usedEstimatedFxRate: boolean;
    missingFxPairs: string[];
  };
};
