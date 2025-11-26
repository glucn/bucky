/**
 * Date utility functions for parsing and formatting dates
 */

/**
 * Parse common date formats and convert to YYYY-MM-DD format
 * Supports:
 * - YYYY-MM-DD (already correct)
 * - YYYYMMDD (20251026)
 * - MM/DD/YYYY (10/26/2025)
 * - M/D/YYYY (1/5/2025)
 * - DD/MM/YYYY (26/10/2025)
 * - YYYY/MM/DD (2025/10/26)
 * - ISO 8601 date strings
 * 
 * @param dateStr - The date string to parse
 * @returns The date in YYYY-MM-DD format, or null if invalid
 */
export function parseToStandardDate(dateStr: string | Date): string | null {
  if (!dateStr) return null;

  // If it's already a Date object, convert to YYYY-MM-DD
  if (dateStr instanceof Date) {
    if (isNaN(dateStr.getTime())) return null;
    return dateStr.toISOString().slice(0, 10);
  }

  // Trim whitespace
  const trimmed = dateStr.trim();
  if (!trimmed) return null;

  // Already in YYYY-MM-DD format
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const date = new Date(trimmed + 'T00:00:00');
    if (isNaN(date.getTime())) return null;
    // Verify the date didn't roll over (e.g., Feb 30 -> Mar 2)
    if (date.toISOString().slice(0, 10) !== trimmed) return null;
    return trimmed;
  }

  // YYYYMMDD format (20251026)
  if (/^\d{8}$/.test(trimmed)) {
    const year = trimmed.slice(0, 4);
    const month = trimmed.slice(4, 6);
    const day = trimmed.slice(6, 8);
    const formatted = `${year}-${month}-${day}`;
    const date = new Date(formatted + 'T00:00:00');
    if (isNaN(date.getTime())) return null;
    // Verify the date didn't roll over
    if (date.toISOString().slice(0, 10) !== formatted) return null;
    return formatted;
  }

  // MM/DD/YYYY or M/D/YYYY format
  const slashMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slashMatch) {
    const month = slashMatch[1].padStart(2, '0');
    const day = slashMatch[2].padStart(2, '0');
    const year = slashMatch[3];
    const formatted = `${year}-${month}-${day}`;
    const date = new Date(formatted + 'T00:00:00');
    if (isNaN(date.getTime())) return null;
    // Verify the date didn't roll over
    if (date.toISOString().slice(0, 10) !== formatted) return null;
    return formatted;
  }

  // YYYY/MM/DD format
  const yearFirstSlash = trimmed.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
  if (yearFirstSlash) {
    const year = yearFirstSlash[1];
    const month = yearFirstSlash[2].padStart(2, '0');
    const day = yearFirstSlash[3].padStart(2, '0');
    const formatted = `${year}-${month}-${day}`;
    const date = new Date(formatted + 'T00:00:00');
    if (isNaN(date.getTime())) return null;
    // Verify the date didn't roll over
    if (date.toISOString().slice(0, 10) !== formatted) return null;
    return formatted;
  }

  // Try parsing as ISO 8601 or other standard formats
  try {
    const date = new Date(trimmed);
    if (!isNaN(date.getTime())) {
      return date.toISOString().slice(0, 10);
    }
  } catch (e) {
    // Fall through to return null
  }

  return null;
}

/**
 * Validate if a string is in YYYY-MM-DD format
 */
export function isValidStandardDate(dateStr: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return false;
  const date = new Date(dateStr + 'T00:00:00');
  return !isNaN(date.getTime());
}
