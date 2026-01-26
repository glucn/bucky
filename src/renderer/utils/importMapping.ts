export const hasAmountMapping = (fieldMap: Record<string, string>): boolean => {
  return Boolean(fieldMap["amount"] || fieldMap["credit"] || fieldMap["debit"]);
};

export const isImportMappingValid = (fieldMap: Record<string, string>): boolean => {
  return Boolean(fieldMap["date"]) && hasAmountMapping(fieldMap);
};

export const getImportDuplicateKey = (row: Record<string, unknown>): string => {
  return `${row.date ?? ""}|${row.amount ?? ""}|${row.description ?? ""}`;
};

export const applyDuplicateFlags = <T extends Record<string, unknown>>(
  rows: T[],
  duplicateIndexes: number[]
): Array<T & { isDuplicate: boolean }> => {
  const duplicates = new Set(duplicateIndexes);
  return rows.map((row, index) => ({
    ...row,
    isDuplicate: duplicates.has(index),
  }));
};

export const applyForceDuplicate = <T extends Record<string, unknown>>(
  rows: T[],
  duplicateIndexes: number[]
): T[] => {
  const duplicates = new Set(duplicateIndexes);
  return rows.map((row, index) =>
    duplicates.has(index)
      ? {
          ...row,
          forceDuplicate: true,
        }
      : row
  );
};

export const filterOutDuplicateRows = <T extends Record<string, unknown>>(
  rows: T[],
  duplicateIndexes: number[]
): T[] => {
  const duplicates = new Set(duplicateIndexes);
  return rows.filter((_, index) => !duplicates.has(index));
};

export const buildImportPayload = <T extends Record<string, unknown>>(
  rows: T[]
): Array<T & { index: number }> =>
  rows.map((row, index) => {
    const payload: T & { index: number } = {
      ...row,
      index,
    };

    if (row.category) {
      return {
        ...payload,
        toAccountId: row.category,
      };
    }

    return payload;
  });

export const resolveImportSummary = (
  result: { imported?: number; skipped?: number } | null,
  fallbackCount: number
): { imported: number; skipped: number } => {
  if (result && typeof result.imported === "number" && typeof result.skipped === "number") {
    return {
      imported: result.imported,
      skipped: result.skipped,
    };
  }

  return { imported: fallbackCount, skipped: 0 };
};

export const shouldShowDefaultAccountWarning = (details: unknown[]): boolean => {
  return Array.isArray(details) && details.length > 0;
};


export const resolveImportAmount = (
  row: Record<string, unknown>,
  fieldMap: Record<string, string>
): number | string => {
  const creditField = fieldMap["credit"];
  const debitField = fieldMap["debit"];
  const amountField = fieldMap["amount"];

  let creditVal: number | null = null;
  let debitVal: number | null = null;

  if (creditField && row[creditField] !== undefined && row[creditField] !== "") {
    const raw = String(row[creditField]).replace(/,/g, "");
    const parsed = parseFloat(raw);
    if (!Number.isNaN(parsed)) creditVal = parsed;
  }

  if (debitField && row[debitField] !== undefined && row[debitField] !== "") {
    const raw = String(row[debitField]).replace(/,/g, "");
    const parsed = parseFloat(raw);
    if (!Number.isNaN(parsed)) debitVal = parsed;
  }

  if (creditVal !== null || debitVal !== null) {
    return (creditVal || 0) - (debitVal || 0);
  }

  if (amountField && row[amountField] !== undefined && row[amountField] !== "") {
    const raw = String(row[amountField]).replace(/,/g, "");
    const parsed = parseFloat(raw);
    return Number.isNaN(parsed) ? String(row[amountField]) : parsed;
  }

  return "";
};
