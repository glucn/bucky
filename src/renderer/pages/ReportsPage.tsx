import React, { useEffect, useMemo, useState } from "react";
import {
  BREAKDOWN_RANGE_PRESETS,
  DEFAULT_BREAKDOWN_FILTER,
  DEFAULT_TREND_FILTER,
  REPORTING_BREAKDOWN_FILTER_SETTING_KEY,
  REPORTING_TREND_FILTER_SETTING_KEY,
  TREND_RANGE_PRESETS,
  type IncomeExpenseBreakdownResponse,
  type IncomeExpenseBreakdownFilter,
  type IncomeExpenseTrendFilter,
  type IncomeExpenseTrendResponse,
  normalizeBreakdownFilter,
  normalizeTrendFilter,
} from "../../shared/reporting";
import { formatCurrencyAmount } from "../utils/currencyUtils";

type ActiveReport = "trend" | "breakdown";

const formatSignedMoney = (amount: number, currency: string): string => {
  const absolute = formatCurrencyAmount(Math.abs(amount), currency);
  return amount < 0 ? `-${absolute}` : absolute;
};

export const ReportsPage: React.FC = () => {
  const [activeReport, setActiveReport] = useState<ActiveReport>("trend");
  const [hoveredMonthKey, setHoveredMonthKey] = useState<string | null>(null);
  const [trendFilter, setTrendFilter] = useState<IncomeExpenseTrendFilter>(DEFAULT_TREND_FILTER);
  const [breakdownFilter, setBreakdownFilter] = useState<IncomeExpenseBreakdownFilter>(
    DEFAULT_BREAKDOWN_FILTER
  );
  const [filtersReady, setFiltersReady] = useState(false);
  const [trend, setTrend] = useState<IncomeExpenseTrendResponse | null>(null);
  const [breakdown, setBreakdown] = useState<IncomeExpenseBreakdownResponse | null>(null);
  const [trendLoading, setTrendLoading] = useState(false);
  const [breakdownLoading, setBreakdownLoading] = useState(false);
  const [trendError, setTrendError] = useState<string | null>(null);
  const [breakdownError, setBreakdownError] = useState<string | null>(null);

  useEffect(() => {
    const loadFilters = async () => {
      const [savedTrendFilter, savedBreakdownFilter] = await Promise.all([
        window.electron.getAppSetting(REPORTING_TREND_FILTER_SETTING_KEY),
        window.electron.getAppSetting(REPORTING_BREAKDOWN_FILTER_SETTING_KEY),
      ]);

      setTrendFilter(normalizeTrendFilter(savedTrendFilter));
      setBreakdownFilter(normalizeBreakdownFilter(savedBreakdownFilter));
      setFiltersReady(true);
    };

    void loadFilters();
  }, []);

  useEffect(() => {
    if (!filtersReady) {
      return;
    }

    let isMounted = true;

    const run = async () => {
      setTrendLoading(true);
      setTrendError(null);

      try {
        const trendPayload = await window.electron.getIncomeExpenseTrendReport(trendFilter);

        if (!isMounted) {
          return;
        }

        setTrend(trendPayload);
      } catch (err) {
        if (!isMounted) {
          return;
        }
        setTrendError(err instanceof Error ? err.message : "Failed to load reports");
      } finally {
        if (isMounted) {
          setTrendLoading(false);
        }
      }
    };

    void run();

    return () => {
      isMounted = false;
    };
  }, [filtersReady, trendFilter]);

  useEffect(() => {
    if (!filtersReady) {
      return;
    }

    let isMounted = true;

    const run = async () => {
      setBreakdownLoading(true);
      setBreakdownError(null);

      try {
        const breakdownPayload = await window.electron.getIncomeExpenseBreakdownReport(
          breakdownFilter
        );

        if (!isMounted) {
          return;
        }

        setBreakdown(breakdownPayload);
      } catch (err) {
        if (!isMounted) {
          return;
        }
        setBreakdownError(err instanceof Error ? err.message : "Failed to load reports");
      } finally {
        if (isMounted) {
          setBreakdownLoading(false);
        }
      }
    };

    void run();

    return () => {
      isMounted = false;
    };
  }, [breakdownFilter, filtersReady]);

  const handleTrendPresetChange = (preset: string) => {
    const nextFilter = normalizeTrendFilter({ preset });
    setTrendFilter(nextFilter);
    void window.electron.setAppSetting(REPORTING_TREND_FILTER_SETTING_KEY, nextFilter);
  };

  const handleBreakdownPresetChange = (preset: string) => {
    const nextFilter = normalizeBreakdownFilter({ preset });
    setBreakdownFilter(nextFilter);
    void window.electron.setAppSetting(REPORTING_BREAKDOWN_FILTER_SETTING_KEY, nextFilter);
  };

  const loading = !filtersReady || trendLoading || breakdownLoading;
  const hasError = Boolean(trendError || breakdownError);

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

  if (hasError || !trend || !breakdown) {
    return <div data-testid="reports-error">Failed to load reports.</div>;
  }

  if (isEmpty) {
    return <div data-testid="reports-empty">No report data yet.</div>;
  }

  const hoveredMonth = hoveredMonthKey
    ? trend.months.find((month) => month.monthKey === hoveredMonthKey) ?? null
    : null;

  return (
    <div className="space-y-6" data-testid="reports-page">
      <div className="inline-flex rounded-md border border-gray-300 bg-white" data-testid="report-switcher">
        <button
          type="button"
          data-testid="report-switch-trend"
          className={`px-3 py-2 text-sm ${
            activeReport === "trend" ? "bg-primary-600 text-white" : "text-gray-700"
          }`}
          onClick={() => {
            setActiveReport("trend");
          }}
        >
          Trend
        </button>
        <button
          type="button"
          data-testid="report-switch-breakdown"
          className={`px-3 py-2 text-sm ${
            activeReport === "breakdown" ? "bg-primary-600 text-white" : "text-gray-700"
          }`}
          onClick={() => {
            setActiveReport("breakdown");
          }}
        >
          Breakdown
        </button>
      </div>

      <div className="flex flex-wrap gap-4" data-testid="reports-filter-controls">
        <label className="text-sm text-gray-700" htmlFor="trend-filter-select">
          Trend range
        </label>
        <select
          id="trend-filter-select"
          data-testid="trend-filter-select"
          aria-label="trend-date-control"
          className="rounded-md border border-gray-300 px-3 py-2 text-sm"
          value={trendFilter.preset}
          onChange={(event) => {
            handleTrendPresetChange(event.target.value);
          }}
        >
          {TREND_RANGE_PRESETS.map((preset) => (
            <option key={preset} value={preset}>
              {preset}
            </option>
          ))}
        </select>

        <label className="text-sm text-gray-700" htmlFor="breakdown-filter-select">
          Breakdown range
        </label>
        <select
          id="breakdown-filter-select"
          data-testid="breakdown-filter-select"
          aria-label="breakdown-date-control"
          className="rounded-md border border-gray-300 px-3 py-2 text-sm"
          value={breakdownFilter.preset}
          onChange={(event) => {
            handleBreakdownPresetChange(event.target.value);
          }}
        >
          {BREAKDOWN_RANGE_PRESETS.filter((preset) => preset !== "CUSTOM").map((preset) => (
            <option key={preset} value={preset}>
              {preset}
            </option>
          ))}
        </select>
      </div>

      {activeReport === "trend" ? (
        <section className="bg-white shadow rounded-lg p-6" data-testid="reports-trend-panel">
          <h2 className="text-lg font-medium text-gray-900">Income vs Expense Trend</h2>
          <div data-testid="reports-trend-container" data-layout="grouped" className="mt-4 space-y-3">
            {trend.months.map((month) => {
              const maxValue = Math.max(
                ...trend.months.map((entry) => Math.max(entry.income, entry.expense)),
                1
              );
              const incomeWidth = `${Math.max((month.income / maxValue) * 100, 1)}%`;
              const expenseWidth = `${Math.max((month.expense / maxValue) * 100, 1)}%`;

              return (
                <button
                  type="button"
                  key={month.monthKey}
                  data-testid={`trend-tooltip-trigger-${month.monthKey}`}
                  className="w-full text-left"
                  onMouseEnter={() => {
                    setHoveredMonthKey(month.monthKey);
                  }}
                  onFocus={() => {
                    setHoveredMonthKey(month.monthKey);
                  }}
                >
                  <div className="mb-1 text-xs text-gray-600">{month.monthKey}</div>
                  <div className="flex items-center gap-2" data-testid={`trend-group-${month.monthKey}`}>
                    <div
                      data-testid={`trend-income-bar-${month.monthKey}`}
                      className="h-3 rounded bg-green-500"
                      style={{ width: incomeWidth }}
                    />
                    <div
                      data-testid={`trend-expense-bar-${month.monthKey}`}
                      className="h-3 rounded bg-red-500"
                      style={{ width: expenseWidth }}
                    />
                  </div>
                </button>
              );
            })}
          </div>

          {hoveredMonth ? (
            <div className="mt-4 rounded-md border border-gray-200 p-3" data-testid="trend-tooltip">
              <div className="text-sm text-gray-600">{hoveredMonth.monthKey}</div>
              <div className="text-sm" data-testid="trend-tooltip-income">
                Income: {formatCurrencyAmount(hoveredMonth.income, "USD")}
              </div>
              <div className="text-sm" data-testid="trend-tooltip-expense">
                Expense: {formatCurrencyAmount(hoveredMonth.expense, "USD")}
              </div>
              <div
                className={`text-sm ${hoveredMonth.netIncome < 0 ? "text-red-600" : "text-gray-900"}`}
                data-testid="trend-tooltip-net-income"
              >
                Net income: {formatSignedMoney(hoveredMonth.netIncome, "USD")}
              </div>
            </div>
          ) : null}
        </section>
      ) : (
        <section className="bg-white shadow rounded-lg p-6" data-testid="reports-breakdown-panel">
          <h2 className="text-lg font-medium text-gray-900">Income/Expense Breakdown</h2>

          <div
            className="mt-4 rounded-md border border-gray-200 p-4"
            data-testid="reports-net-income-kpi-card"
          >
            <div className="text-xs uppercase tracking-wide text-gray-500">Net income</div>
            <div
              className={`text-2xl font-semibold ${
                breakdown.kpis.netIncome < 0 ? "text-red-600" : "text-gray-900"
              }`}
              data-testid="reports-net-income-kpi-value"
            >
              {formatSignedMoney(breakdown.kpis.netIncome, "USD")}
            </div>
          </div>

          <div className="mt-4 grid gap-6 lg:grid-cols-2">
            <table className="w-full text-sm" data-testid="reports-income-table">
              <thead>
                <tr className="border-b border-gray-200 text-left text-xs uppercase text-gray-500">
                  <th className="py-2">Income category</th>
                  <th className="py-2">Amount</th>
                  <th className="py-2">% of income</th>
                </tr>
              </thead>
              <tbody>
                {breakdown.incomeRows.map((row) => (
                  <tr key={`income-${row.categoryId}`} data-testid={`reports-income-row-${row.categoryId}`}>
                    <td className="py-2">{row.categoryName}</td>
                    <td className="py-2">{formatCurrencyAmount(row.amount, "USD")}</td>
                    <td className="py-2">{Math.round(row.ratio * 100)}%</td>
                  </tr>
                ))}
                <tr className="border-t border-gray-200 font-semibold" data-testid="reports-income-total-row">
                  <td className="py-2">Total</td>
                  <td className="py-2">{formatCurrencyAmount(breakdown.kpis.incomeTotal, "USD")}</td>
                  <td className="py-2">100%</td>
                </tr>
              </tbody>
            </table>

            <table className="w-full text-sm" data-testid="reports-expense-table">
              <thead>
                <tr className="border-b border-gray-200 text-left text-xs uppercase text-gray-500">
                  <th className="py-2">Expense category</th>
                  <th className="py-2">Amount</th>
                  <th className="py-2">% of expense</th>
                </tr>
              </thead>
              <tbody>
                {breakdown.expenseRows.map((row) => (
                  <tr
                    key={`expense-${row.categoryId}`}
                    data-testid={`reports-expense-row-${row.categoryId}`}
                  >
                    <td className="py-2">{row.categoryName}</td>
                    <td className="py-2">{formatCurrencyAmount(row.amount, "USD")}</td>
                    <td className="py-2">{Math.round(row.ratio * 100)}%</td>
                  </tr>
                ))}
                <tr className="border-t border-gray-200 font-semibold" data-testid="reports-expense-total-row">
                  <td className="py-2">Total</td>
                  <td className="py-2">{formatCurrencyAmount(breakdown.kpis.expenseTotal, "USD")}</td>
                  <td className="py-2">100%</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
};
