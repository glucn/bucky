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
  rows.map((row, index) => ({
    ...row,
    index,
  }));

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
  const parseAmount = (value: unknown): number | null => {
    if (value === undefined || value === null || value === "") {
      return null;
    }

    let raw = String(value).trim();
    const isParenNegative = raw.startsWith("(") && raw.endsWith(")");
    raw = raw.replace(/[()]/g, "");
    raw = raw.replace(/[^0-9.-]/g, "");
    raw = raw.replace(/,/g, "");
    const parsed = parseFloat(raw);
    if (Number.isNaN(parsed)) {
      return null;
    }
    return isParenNegative ? -Math.abs(parsed) : parsed;
  };
  const creditField = fieldMap["credit"];
  const debitField = fieldMap["debit"];
  const amountField = fieldMap["amount"];

  let creditVal: number | null = null;
  let debitVal: number | null = null;

  if (creditField && row[creditField] !== undefined && row[creditField] !== "") {
    const parsed = parseAmount(row[creditField]);
    if (parsed !== null) creditVal = parsed;
  }

  if (debitField && row[debitField] !== undefined && row[debitField] !== "") {
    const parsed = parseAmount(row[debitField]);
    if (parsed !== null) debitVal = parsed;
  }

  if (creditVal !== null || debitVal !== null) {
    return (creditVal || 0) - (debitVal || 0);
  }

  if (amountField && row[amountField] !== undefined && row[amountField] !== "") {
    const parsed = parseAmount(row[amountField]);
    return parsed === null ? String(row[amountField]) : parsed;
  }

  return "";
};
