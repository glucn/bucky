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

export function postingAmountFromCents(cents: number | bigint) {
  const exact = BigInt(cents);
  return { amount: journalAmountFromCents(exact), amountCents: exact.toString() };
}

export function withPostingCents<T extends { amount: number }>(posting: T) {
  return { ...posting, ...postingAmountFromCents(toJournalCents(posting.amount)) };
}

function readStoredCents(exact: string | null, legacy: number): bigint {
  if (exact === null) return BigInt(toJournalCents(legacy));
  if (!/^(?:0|-?[1-9][0-9]{0,15})$/.test(exact)) throw precisionError();
  const cents = BigInt(exact);
  if (cents < -maxCents || cents > maxCents) throw precisionError();
  return cents;
}

export function readPostingCents(posting: { amount: number; amountCents: string | null }): bigint {
  return readStoredCents(posting.amountCents, posting.amount);
}

export function sumJournalCents(postings: ReadonlyArray<{ amount: number; amountCents: string | null }>): bigint {
  return postings.reduce((total, posting) => total + readPostingCents(posting), 0n);
}

export function readCheckpointCents(checkpoint: { balance: number; balanceCents: string | null }): bigint {
  return readStoredCents(checkpoint.balanceCents, checkpoint.balance);
}
export function checkpointBalance(checkpoint: { balance: number; balanceCents: string | null }): number {
  return checkpoint.balanceCents === null ? checkpoint.balance : journalAmountFromCents(readCheckpointCents(checkpoint));
}
