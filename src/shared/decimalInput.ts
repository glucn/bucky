export function normalizeUnsignedDecimal(value: unknown): string | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const text = String(value).trim();
  if (text.length > 64 || !/^\+?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(text)) return null;
  const numeric = Number(text);
  const [mantissa, exponent] = text.toLowerCase().replace(/^\+/, "").split("e");
  if (!Number.isFinite(numeric) || (numeric === 0 && /[1-9]/.test(mantissa))) return null;
  if (numeric === 0) return "0";
  const digits = mantissa.replace(/^\./, "0.").replace(/\.$/, "");
  const decimal = exponent === undefined ? digits : `${digits}e${Number(exponent)}`;
  return decimal.length <= 64 ? decimal : null;
}
