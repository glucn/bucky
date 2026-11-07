type FormatOptions = {
  disambiguate?: boolean;
};

export const formatValuationAmount = (
  amount: number | null | undefined,
  currency: string,
  options: FormatOptions = {}
): string => {
  if (typeof amount !== "number" || !Number.isFinite(amount)) return "N/A";
  const threshold = 0.0001;
  const normalizedAmount = Math.abs(amount) < threshold ? 0 : amount;

  if (options.disambiguate) {
    const number = new Intl.NumberFormat("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(normalizedAmount);
    return `${currency} ${number}`;
  }

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
  }).format(normalizedAmount);
};
