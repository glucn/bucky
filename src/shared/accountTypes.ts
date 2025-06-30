// Shared AccountType enum and utility

export enum AccountType {
  User = "user",
  Category = "category",
  System = "system",
}

export enum AccountSubtype {
  Asset = "asset",
  Liability = "liability",
}

export function toAccountType(
  type: string,
  fallback: AccountType = AccountType.User
): AccountType {
  return (Object.values(AccountType) as string[]).includes(type)
    ? (type as AccountType)
    : fallback;
}
