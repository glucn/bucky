import React, { useEffect, useMemo, useState } from "react";
import {
  DEFAULT_BREAKDOWN_FILTER,
  DEFAULT_TREND_FILTER,
  type IncomeExpenseBreakdownResponse,
  type IncomeExpenseTrendResponse,
} from "../../shared/reporting";

export const ReportsPage: React.FC = () => {
  const [trend, setTrend] = useState<IncomeExpenseTrendResponse | null>(null);
  const [breakdown, setBreakdown] = useState<IncomeExpenseBreakdownResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    const run = async () => {
      setLoading(true);
      setError(null);

      try {
        const [trendPayload, breakdownPayload] = await Promise.all([
          window.electron.getIncomeExpenseTrendReport(DEFAULT_TREND_FILTER),
          window.electron.getIncomeExpenseBreakdownReport(DEFAULT_BREAKDOWN_FILTER),
        ]);

        if (!isMounted) {
          return;
        }

        setTrend(trendPayload);
        setBreakdown(breakdownPayload);
      } catch (err) {
        if (!isMounted) {
          return;
        }
        setError(err instanceof Error ? err.message : "Failed to load reports");
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    void run();

    return () => {
      isMounted = false;
    };
  }, []);

  const isEmpty = useMemo(() => {
    if (!trend || !breakdown) {
      return false;
    }

    const trendHasAnyValue = trend.months.some((month) => month.income !== 0 || month.expense !== 0);
    const breakdownHasRows = breakdown.incomeRows.length > 0 || breakdown.expenseRows.length > 0;
    return !trendHasAnyValue && !breakdownHasRows;
  }, [trend, breakdown]);

  if (loading) {
    return <div data-testid="reports-loading">Loading reports...</div>;
  }

  if (error || !trend || !breakdown) {
    return <div data-testid="reports-error">Failed to load reports.</div>;
  }

  if (isEmpty) {
    return <div data-testid="reports-empty">No report data yet.</div>;
  }

  return (
    <div className="space-y-6" data-testid="reports-page">
      <section className="bg-white shadow rounded-lg p-6" data-testid="reports-trend-panel">
        <h2 className="text-lg font-medium text-gray-900">Income vs Expense Trend</h2>
      </section>
      <section className="bg-white shadow rounded-lg p-6" data-testid="reports-breakdown-panel">
        <h2 className="text-lg font-medium text-gray-900">Income/Expense Breakdown</h2>
      </section>
    </div>
  );
};
