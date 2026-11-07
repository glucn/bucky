export type ReportFxSource = "same_currency" | "as_of" | "zero_amount" | "unavailable";
export type InvestmentCashFlows = {
  deposits: number | null; withdrawals: number | null;
  depositsByCurrency: Record<string, number>; withdrawalsByCurrency: Record<string, number>;
  rows: Array<{ entryId: string; lineId: string; accountId: string; accountName: string; date: string; currency: string;
    amount: number; amountBase: number | null; fxSource: ReportFxSource }>;
};
export type InvestmentIncomeRow = {
  entryId: string; lineId: string; date: string; accountId: string | null;
  tickerSymbol: string | null; market: string | null; recordedMarket: string | null; currency: string;
  amount: number; amountBase: number | null; fxSource: ReportFxSource; fxRate: number | null;
};
export type InvestmentIncomeReport = {
  baseCurrency: string; total: number | null; byCurrency: Record<string, number>;
  byTicker: Record<string, number | null>; rows: InvestmentIncomeRow[];
};
export type RealizedGainReportRow = {
  entryId: string; date: string; accountId: string; tickerSymbol: string; market: string | null; recordedMarket: string | null;
  currency: string; baseCurrency: string; quantity: number | null; costBasis: number;
  saleProceeds: number; otherCategoryAmount: number; realizedGain: number; realizedGainBase: number | null;
  fxSource: ReportFxSource; fxRate: number | null;
  holdingPeriod: "short" | "long" | "mixed" | "unknown";
};
