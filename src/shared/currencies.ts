export interface CurrencyOption {
  code: string;
  label: string;
  symbol: string;
}

export const SUPPORTED_CURRENCY_OPTIONS: CurrencyOption[] = [
  { code: "USD", label: "US Dollar", symbol: "$" },
  { code: "CAD", label: "Canadian Dollar", symbol: "CAD$" },
  { code: "EUR", label: "Euro", symbol: "€" },
  { code: "GBP", label: "British Pound", symbol: "£" },
  { code: "JPY", label: "Japanese Yen", symbol: "¥" },
  { code: "CNY", label: "Chinese Yuan", symbol: "¥" },
  { code: "HKD", label: "Hong Kong Dollar", symbol: "HK$" },
  { code: "AUD", label: "Australian Dollar", symbol: "A$" },
];

export const FALLBACK_CURRENCY_SYMBOLS: Record<string, string> =
  Object.fromEntries(
    SUPPORTED_CURRENCY_OPTIONS.map((currency) => [currency.code, currency.symbol])
  );
