export type NewHoldingInput = {
  portfolioId: string;
  tickerSymbol: string;
  market: string;
  quoteCurrency: string;
  tradeCashAccountId: string;
  costBasisMethod: "FIFO" | "AVERAGE_COST";
  securityType?: string;
};
