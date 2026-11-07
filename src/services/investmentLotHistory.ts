/** Malformed legacy lot data needs review; it is not evidence of an unused holding. */
export function hasLotHistory(raw: string | null): boolean {
  if (raw === null) return false;
  try { const value: unknown = JSON.parse(raw); return !Array.isArray(value) || value.length > 0; }
  catch { return true; }
}
