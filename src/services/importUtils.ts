import { AccountSubtype } from "../shared/accountTypes";

export type ImportAccountResolution = {
  fromAccountId: string | null;
  toAccountId: string | null;
  usedDefault: boolean;
  defaultAccountName: string | null;
  error?: string;
};

export type ImportAccountResolutionInput = {
  userAccountId: string;
  userAccountSubtype: AccountSubtype;
  amount: number;
  toAccountId?: string | null;
  uncategorizedIncomeId?: string | null;
  uncategorizedExpenseId?: string | null;
};

export const resolveImportAccounts = (
  input: ImportAccountResolutionInput
): ImportAccountResolution => {
  const {
    userAccountId,
    userAccountSubtype,
    amount,
    toAccountId,
    uncategorizedIncomeId,
    uncategorizedExpenseId,
  } = input;

  let fromAccountId: string | null = userAccountId;
  let resolvedToAccountId = toAccountId ?? null;
  let usedDefault = false;
  let defaultAccountName: string | null = null;

  if (userAccountSubtype === AccountSubtype.Asset) {
    if (amount > 0) {
      fromAccountId = resolvedToAccountId || uncategorizedIncomeId || null;
      resolvedToAccountId = userAccountId;
      if (!fromAccountId) {
        return {
          fromAccountId: null,
          toAccountId: null,
          usedDefault,
          defaultAccountName,
          error: "Missing source account for asset increase",
        };
      }
      if (!toAccountId && uncategorizedIncomeId) {
        usedDefault = true;
        defaultAccountName = "Uncategorized Income";
      }
    } else {
      resolvedToAccountId = resolvedToAccountId || uncategorizedExpenseId || null;
      if (!resolvedToAccountId) {
        return {
          fromAccountId: null,
          toAccountId: null,
          usedDefault,
          defaultAccountName,
          error: "Missing destination account for asset decrease",
        };
      }
      if (!toAccountId && uncategorizedExpenseId) {
        usedDefault = true;
        defaultAccountName = "Uncategorized Expense";
      }
    }
  } else if (userAccountSubtype === AccountSubtype.Liability) {
    if (amount > 0) {
      resolvedToAccountId = resolvedToAccountId || uncategorizedExpenseId || null;
      if (!resolvedToAccountId) {
        return {
          fromAccountId: null,
          toAccountId: null,
          usedDefault,
          defaultAccountName,
          error: "Missing destination account for liability increase",
        };
      }
      if (!toAccountId && uncategorizedExpenseId) {
        usedDefault = true;
        defaultAccountName = "Uncategorized Expense";
      }
    } else {
      fromAccountId = resolvedToAccountId || uncategorizedIncomeId || null;
      resolvedToAccountId = userAccountId;
      if (!fromAccountId) {
        return {
          fromAccountId: null,
          toAccountId: null,
          usedDefault,
          defaultAccountName,
          error: "Missing source account for liability decrease",
        };
      }
      if (!toAccountId && uncategorizedIncomeId) {
        usedDefault = true;
        defaultAccountName = "Uncategorized Income";
      }
    }
  } else {
    if (!resolvedToAccountId) {
      if (amount > 0 && uncategorizedIncomeId) {
        resolvedToAccountId = uncategorizedIncomeId;
        usedDefault = true;
        defaultAccountName = "Uncategorized Income";
      } else if (amount < 0 && uncategorizedExpenseId) {
        resolvedToAccountId = uncategorizedExpenseId;
        usedDefault = true;
        defaultAccountName = "Uncategorized Expense";
      } else {
        return {
          fromAccountId: null,
          toAccountId: null,
          usedDefault,
          defaultAccountName,
          error: "Missing toAccountId and no default account found",
        };
      }
    }
  }

  return {
    fromAccountId,
    toAccountId: resolvedToAccountId,
    usedDefault,
    defaultAccountName,
  };
};
