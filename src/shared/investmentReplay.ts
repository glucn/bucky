export type TradeInsertion = {
  operation: "insert"; kind: "buy" | "sell"; accountId: string; tradeCashAccountId: string;
  date: string; quantity: number; pricePerShare: number; fee?: number; description?: string;
};
