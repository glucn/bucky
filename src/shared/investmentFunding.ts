/** amount is always in the selected portfolio cash currency. counterAmount is the
 * actual amount on the other account, required when its currency differs. */
export type InvestmentFundingOptions = { tradeCashAccountId?: string; counterAmount?: number; exchangeRate?: number; expectedCashCurrency?: string; expectedCounterCurrency?: string };
export type FundingAccount = { id: string; name: string; currency: string; subtype: string; groupId: string | null; groupName: string | null };
