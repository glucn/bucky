// Shared AccountType enum and utility

export enum AccountType {
  Cash = "cash",
  Bank = "bank",
  Credit = "credit",
  Investment = "investment",
  Income = "income",
  Expense = "expense",
  Equity = "equity",
  Loan = "loan",
  Liability = "liability",
}

export function toAccountType(
  type: string,
  fallback: AccountType = AccountType.Cash
): AccountType {
  return (Object.values(AccountType) as string[]).includes(type)
    ? (type as AccountType)
    : fallback;
}
