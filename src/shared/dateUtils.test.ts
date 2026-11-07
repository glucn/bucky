import { describe, it, expect, vi } from 'vitest';
import { parseToStandardDate, isValidStandardDate, localCalendarDate } from './dateUtils';

describe('dateUtils', () => {
  it.each([
    ['America/Vancouver', '2026-01-02', '2026-01-03'],
    ['UTC', '2026-01-03', '2026-01-03'],
    ['Europe/Tallinn', '2026-01-03', '2026-01-03'],
    ['Pacific/Kiritimati', '2026-01-03', '2026-01-04'],
  ])('keeps local book days separate from UTC timestamps in %s', (zone, early, late) => {
    vi.stubEnv('TZ', zone);
    try {
      expect(localCalendarDate(new Date('2026-01-03T01:00:00Z'))).toBe(early);
      expect(localCalendarDate(new Date('2026-01-03T11:00:00Z'))).toBe(late);
      expect(parseToStandardDate(new Date('2026-01-03T01:00:00Z'))).toBe('2026-01-03');
    } finally { vi.unstubAllEnvs(); }
  });
  it('refuses an invalid Date as a local book cutoff', () => {
    expect(() => localCalendarDate(new Date(NaN))).toThrow(/date/i);
  });
  it.each(['Europe/Tallinn', 'Pacific/Kiritimati', 'America/Vancouver', 'UTC'])(
    'preserves calendar dates and rejects rollover in %s', (zone) => {
      vi.stubEnv('TZ', zone);
      try {
        for (const input of ['2026-09-01', '20260901', '9/1/2026', '2026/9/1']) {
          expect(parseToStandardDate(input)).toBe('2026-09-01');
        }
        expect(parseToStandardDate('2024-02-29')).toBe('2024-02-29');
        for (const input of ['2025-02-29', '20250229', '2/29/2025', '2025/2/29']) {
          expect(parseToStandardDate(input)).toBeNull();
        }
        expect(isValidStandardDate('2025-02-29')).toBe(false);
        expect(isValidStandardDate('2024-02-29')).toBe(true);
        // Instant inputs retain their existing UTC-normalization semantics.
        expect(parseToStandardDate('2026-09-01T00:00:00+03:00')).toBe('2026-08-31');
      } finally { vi.unstubAllEnvs(); }
    },
  );
  describe('parseToStandardDate', () => {
    it('should handle YYYY-MM-DD format', () => {
      expect(parseToStandardDate('2025-10-26')).toBe('2025-10-26');
      expect(parseToStandardDate('2024-01-01')).toBe('2024-01-01');
    });

    it('should handle YYYYMMDD format', () => {
      expect(parseToStandardDate('20251026')).toBe('2025-10-26');
      expect(parseToStandardDate('20240101')).toBe('2024-01-01');
    });

    it('should handle MM/DD/YYYY format', () => {
      expect(parseToStandardDate('10/26/2025')).toBe('2025-10-26');
      expect(parseToStandardDate('1/5/2025')).toBe('2025-01-05');
      expect(parseToStandardDate('01/05/2025')).toBe('2025-01-05');
    });

    it('should handle YYYY/MM/DD format', () => {
      expect(parseToStandardDate('2025/10/26')).toBe('2025-10-26');
      expect(parseToStandardDate('2025/1/5')).toBe('2025-01-05');
    });

    it('should handle Date objects', () => {
      const date = new Date('2025-10-26T12:00:00Z');
      expect(parseToStandardDate(date)).toBe('2025-10-26');
    });

    it('should return null for invalid dates', () => {
      expect(parseToStandardDate('')).toBeNull();
      expect(parseToStandardDate('invalid')).toBeNull();
      expect(parseToStandardDate('2025-13-01')).toBeNull(); // Invalid month
      expect(parseToStandardDate('2025-02-30')).toBeNull(); // Invalid day
      expect(parseToStandardDate('20251301')).toBeNull(); // Invalid YYYYMMDD
    });

    it('should handle whitespace', () => {
      expect(parseToStandardDate('  2025-10-26  ')).toBe('2025-10-26');
      expect(parseToStandardDate('  20251026  ')).toBe('2025-10-26');
    });
  });

  describe('isValidStandardDate', () => {
    it('should validate YYYY-MM-DD format', () => {
      expect(isValidStandardDate('2025-10-26')).toBe(true);
      expect(isValidStandardDate('2024-01-01')).toBe(true);
    });

    it('should reject invalid formats', () => {
      expect(isValidStandardDate('20251026')).toBe(false);
      expect(isValidStandardDate('10/26/2025')).toBe(false);
      expect(isValidStandardDate('2025-13-01')).toBe(false);
      expect(isValidStandardDate('invalid')).toBe(false);
    });
  });
});
