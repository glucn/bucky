import { describe, it, expect } from 'vitest';
import { parseToStandardDate, isValidStandardDate } from './dateUtils';

describe('dateUtils', () => {
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
