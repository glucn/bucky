export const hasAmountMapping = (fieldMap: Record<string, string>): boolean => {
  return Boolean(fieldMap["amount"] || fieldMap["credit"] || fieldMap["debit"]);
};

export const isImportMappingValid = (fieldMap: Record<string, string>): boolean => {
  return Boolean(fieldMap["date"]) && hasAmountMapping(fieldMap);
};

export const updateImportPreviewRow = <T extends Record<string, unknown>>(
  rows: T[],
  rowIndex: number,
  field: string,
  value: string
): T[] => {
  return rows.map((row, index) => {
    if (index !== rowIndex) return row;

    if (field === "amount") {
      const parsed = value === "" ? "" : Number(value);
      return {
        ...row,
        [field]: Number.isNaN(parsed) ? value : parsed,
      };
    }

    return {
      ...row,
      [field]: value,
    };
  });
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
