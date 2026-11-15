const maxCents = BigInt(Number.MAX_SAFE_INTEGER);
const precisionError = () => new Error("Journal amount exceeds supported precision");

/** Recover the decimal spelled by the legacy Number boundary, including exponent notation. */
function decimalParts(value: number) {
  if (!Number.isFinite(value)) throw precisionError();
  const [mantissa, exponent = "0"] = value.toString().split("e");
  const [whole, fraction = ""] = mantissa.split(".");
  return { digits: BigInt(whole + fraction), exponent: Number(exponent) - fraction.length };
}

export function decimalRatio(value: number) {
  const { digits, exponent } = decimalParts(value);
  return exponent >= 0
    ? { numerator: digits * 10n ** BigInt(exponent), denominator: 1n }
    : { numerator: digits, denominator: 10n ** BigInt(-exponent) };
}

export function roundDecimalRatio(numerator: bigint, denominator: bigint): bigint {
  const quotient = numerator / denominator;
  const remainder = numerator % denominator;
  const magnitude = remainder < 0n ? -remainder : remainder;
  if (magnitude * 2n < denominator) return quotient;
  return quotient + (numerator < 0n ? -1n : 1n);
}

export function toJournalCents(value: number): number {
  const { numerator, denominator } = decimalRatio(value);
  const cents = roundDecimalRatio(numerator * 100n, denominator);
  if (cents < -maxCents || cents > maxCents) throw precisionError();
  return Number(cents);
}

export function journalAmountFromCents(cents: bigint): number {
  if (cents < -maxCents || cents > maxCents) throw precisionError();
  const amount = Number(cents) / 100;
  if (BigInt(toJournalCents(amount)) !== cents) throw precisionError();
  return amount;
}

export function roundJournalAmount(value: number): number {
  return journalAmountFromCents(BigInt(toJournalCents(value)));
}

export function sumJournalCents(postings: ReadonlyArray<{ amount: number }>): bigint {
  return postings.reduce((total, posting) => total + BigInt(toJournalCents(posting.amount)), 0n);
}
