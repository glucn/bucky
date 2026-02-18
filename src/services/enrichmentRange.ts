type IncrementalRangeInput = {
  earliestRelevantTransactionDate: string;
  lastSuccessfulRefreshDate: string | null;
};

type GapDetectionInput = {
  requiredStartDate: string;
  requiredEndDate: string;
  coveredDates: string[];
};

type GapWindow = {
  startDate: string;
  endDate: string;
};

const nextDate = (date: string): string => {
  const parsed = new Date(`${date}T00:00:00Z`);
  parsed.setUTCDate(parsed.getUTCDate() + 1);
  return parsed.toISOString().slice(0, 10);
};

export const deriveIncrementalStartDate = (
  input: IncrementalRangeInput
): string => input.lastSuccessfulRefreshDate || input.earliestRelevantTransactionDate;

export const detectHistoricalGaps = (input: GapDetectionInput): {
  hasGaps: boolean;
  gaps: GapWindow[];
} => {
  const covered = new Set(input.coveredDates);

  const missingDates: string[] = [];
  let cursor = input.requiredStartDate;
  while (cursor <= input.requiredEndDate) {
    if (!covered.has(cursor)) {
      missingDates.push(cursor);
    }
    cursor = nextDate(cursor);
  }

  if (missingDates.length === 0) {
    return { hasGaps: false, gaps: [] };
  }

  const gaps: GapWindow[] = [];
  let rangeStart = missingDates[0];
  let previous = missingDates[0];

  for (let index = 1; index < missingDates.length; index += 1) {
    const current = missingDates[index];
    if (current !== nextDate(previous)) {
      gaps.push({ startDate: rangeStart, endDate: previous });
      rangeStart = current;
    }
    previous = current;
  }

  gaps.push({ startDate: rangeStart, endDate: previous });

  return {
    hasGaps: true,
    gaps,
  };
};
