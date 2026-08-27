import React, { useEffect, useMemo, useState } from "react";
import {
  BREAKDOWN_RANGE_PRESETS,
  DEFAULT_BREAKDOWN_FILTER,
  DEFAULT_TREND_FILTER,
  REPORTING_BREAKDOWN_FILTER_SETTING_KEY,
  REPORTING_TREND_FILTER_SETTING_KEY,
  TREND_RANGE_PRESETS,
  type BreakdownRangePreset,
  type IncomeExpenseBreakdownFilter,
  type IncomeExpenseBreakdownResponse,
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

const formatPresetLabel = (preset: string): string =>
  preset
    .toLowerCase()
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");

const getLocalDateString = (): string => {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const openFxRefresh = () => {
  window.dispatchEvent(
    new CustomEvent("open-enrichment-panel", {
      detail: {
        scopePreset: {
          securityMetadata: false,
          securityPrices: false,
          fxRates: true,
        },
      },
    })
  );
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
  const [trendRequestVersion, setTrendRequestVersion] = useState(0);
  const [breakdownRequestVersion, setBreakdownRequestVersion] = useState(0);

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
    if (!filtersReady) return;
    let isMounted = true;
    const run = async () => {
      setTrendLoading(true);
      setTrendError(null);
      try {
        const payload = await window.electron.getIncomeExpenseTrendReport(trendFilter);
        if (isMounted) setTrend(payload);
      } catch (error) {
        if (isMounted) {
          setTrendError(error instanceof Error ? error.message : "Failed to load trend report");
        }
      } finally {
        if (isMounted) setTrendLoading(false);
      }
    };
    void run();
    return () => {
      isMounted = false;
    };
  }, [filtersReady, trendFilter, trendRequestVersion]);

  useEffect(() => {
    if (!filtersReady) return;
    let isMounted = true;
    const run = async () => {
      setBreakdownLoading(true);
      setBreakdownError(null);
      try {
        const payload = await window.electron.getIncomeExpenseBreakdownReport(breakdownFilter);
        if (isMounted) setBreakdown(payload);
      } catch (error) {
        if (isMounted) {
          setBreakdownError(
            error instanceof Error ? error.message : "Failed to load breakdown report"
          );
        }
      } finally {
        if (isMounted) setBreakdownLoading(false);
      }
    };
    void run();
    return () => {
      isMounted = false;
    };
  }, [breakdownFilter, breakdownRequestVersion, filtersReady]);

  const persistTrendFilter = (nextFilter: IncomeExpenseTrendFilter) => {
    setTrendFilter(nextFilter);
    void window.electron.setAppSetting(REPORTING_TREND_FILTER_SETTING_KEY, nextFilter);
  };

  const persistBreakdownFilter = (nextFilter: IncomeExpenseBreakdownFilter) => {
    setBreakdownFilter(nextFilter);
    void window.electron.setAppSetting(REPORTING_BREAKDOWN_FILTER_SETTING_KEY, nextFilter);
  };

  const handleBreakdownPresetChange = (preset: BreakdownRangePreset) => {
    if (preset !== "CUSTOM") {
      persistBreakdownFilter({ preset });
      return;
    }
    const today = getLocalDateString();
    persistBreakdownFilter({
      preset: "CUSTOM",
      customRange: {
        startDate: breakdown?.range.startDate ?? today,
        endDate: breakdown?.range.endDate ?? today,
      },
    });
  };

  const handleCustomDateChange = (field: "startDate" | "endDate", value: string) => {
    if (breakdownFilter.preset !== "CUSTOM" || !breakdownFilter.customRange) return;
    let { startDate, endDate } = breakdownFilter.customRange;
    if (field === "startDate") {
      startDate = value;
      if (startDate > endDate) endDate = startDate;
    } else {
      endDate = value;
      if (endDate < startDate) startDate = endDate;
    }
    persistBreakdownFilter({ preset: "CUSTOM", customRange: { startDate, endDate } });
  };

  const trendIsEmpty = useMemo(
    () => Boolean(trend && trend.months.every((month) => month.income === 0 && month.expense === 0)),
    [trend]
  );
  const breakdownIsEmpty = useMemo(
    () => Boolean(breakdown && breakdown.incomeRows.length === 0 && breakdown.expenseRows.length === 0),
    [breakdown]
  );

  const activePayload = activeReport === "trend" ? trend : breakdown;
  const activeError = activeReport === "trend" ? trendError : breakdownError;
  const activeLoading =
    !filtersReady ||
    (activeReport === "trend" ? trendLoading : breakdownLoading) ||
    (!activePayload && !activeError);
  const activeIsEmpty = activeReport === "trend" ? trendIsEmpty : breakdownIsEmpty;
  const missingFxPairs = activePayload?.metadata?.missingFxPairs ?? [];
  const usedEstimatedFxRate = activePayload?.metadata?.usedEstimatedFxRate ?? false;
  const trendCurrency = trend?.currency ?? "USD";
  const breakdownCurrency = breakdown?.currency ?? "USD";
  const hoveredMonth =
    hoveredMonthKey && trend
      ? trend.months.find((month) => month.monthKey === hoveredMonthKey) ?? null
      : null;

  const filters = (
    <div className="flex flex-wrap items-center gap-4" data-testid="reports-filter-controls">
      <label className="text-sm text-gray-700" htmlFor="trend-filter-select">Trend range</label>
      <select
        id="trend-filter-select"
        data-testid="trend-filter-select"
        aria-label="trend-date-control"
        className="rounded-md border border-gray-300 px-3 py-2 text-sm"
        value={trendFilter.preset}
        onChange={(event) => persistTrendFilter(normalizeTrendFilter({ preset: event.target.value }))}
      >
        {TREND_RANGE_PRESETS.map((preset) => (
          <option key={preset} value={preset}>{formatPresetLabel(preset)}</option>
        ))}
      </select>
      <label className="text-sm text-gray-700" htmlFor="breakdown-filter-select">Breakdown range</label>
      <select
        id="breakdown-filter-select"
        data-testid="breakdown-filter-select"
        aria-label="breakdown-date-control"
        className="rounded-md border border-gray-300 px-3 py-2 text-sm"
        value={breakdownFilter.preset}
        onChange={(event) =>
          handleBreakdownPresetChange(event.target.value as BreakdownRangePreset)
        }
      >
        {BREAKDOWN_RANGE_PRESETS.map((preset) => (
          <option key={preset} value={preset}>{formatPresetLabel(preset)}</option>
        ))}
      </select>
      {breakdownFilter.preset === "CUSTOM" && breakdownFilter.customRange ? (
        <div className="flex items-center gap-2" data-testid="breakdown-custom-date-controls">
          <label className="text-sm text-gray-700" htmlFor="breakdown-custom-start-date">From</label>
          <input
            id="breakdown-custom-start-date"
            data-testid="breakdown-custom-start-date"
            type="date"
            max={breakdownFilter.customRange.endDate}
            value={breakdownFilter.customRange.startDate}
            onChange={(event) => handleCustomDateChange("startDate", event.target.value)}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm"
          />
          <label className="text-sm text-gray-700" htmlFor="breakdown-custom-end-date">To</label>
          <input
            id="breakdown-custom-end-date"
            data-testid="breakdown-custom-end-date"
            type="date"
            min={breakdownFilter.customRange.startDate}
            max={getLocalDateString()}
            value={breakdownFilter.customRange.endDate}
            onChange={(event) => handleCustomDateChange("endDate", event.target.value)}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm"
          />
        </div>
      ) : null}
    </div>
  );

  const status = activeLoading ? (
    <div data-testid="reports-loading">Loading reports...</div>
  ) : activeError ? (
    <div className="rounded-md border border-red-200 bg-red-50 p-4" data-testid="reports-error">
      <p>Failed to load reports.</p>
      <button
        type="button"
        className="mt-2 text-sm text-primary-600 underline"
        onClick={() =>
          activeReport === "trend"
            ? setTrendRequestVersion((version) => version + 1)
            : setBreakdownRequestVersion((version) => version + 1)
        }
      >
        Retry
      </button>
    </div>
  ) : missingFxPairs.length > 0 ? (
    <div
      className="rounded-md border border-amber-300 bg-amber-50 p-4 text-amber-900"
      data-testid="reports-fx-incomplete"
    >
      <p className="font-medium">This report is incomplete, so totals are withheld.</p>
      <p className="mt-1 text-sm">Missing FX rates: {missingFxPairs.join(", ")}.</p>
      <button
        type="button"
        className="mt-3 rounded border border-amber-500 px-3 py-1 text-sm"
        onClick={openFxRefresh}
        data-testid="reports-refresh-fx"
      >
        Refresh FX rates
      </button>
    </div>
  ) : activeIsEmpty ? (
    <div data-testid="reports-empty">No report data for this range.</div>
  ) : null;

  return (
    <div className="space-y-6" data-testid="reports-page">
      <div
        className="inline-flex rounded-md border border-gray-300 bg-white"
        data-testid="report-switcher"
      >
        <button
          type="button"
          data-testid="report-switch-trend"
          className={`px-3 py-2 text-sm ${
            activeReport === "trend" ? "bg-primary-600 text-white" : "text-gray-700"
          }`}
          onClick={() => setActiveReport("trend")}
        >
          Trend
        </button>
        <button
          type="button"
          data-testid="report-switch-breakdown"
          className={`px-3 py-2 text-sm ${
            activeReport === "breakdown" ? "bg-primary-600 text-white" : "text-gray-700"
          }`}
          onClick={() => setActiveReport("breakdown")}
        >
          Breakdown
        </button>
      </div>

      {filters}
      {usedEstimatedFxRate && missingFxPairs.length === 0 ? (
        <div
          className="rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900"
          data-testid="reports-fx-estimated"
        >
          Some values use the latest available FX rate because an exact-date rate was unavailable.
        </div>
      ) : null}
      {status}

      {!status && activeReport === "trend" && trend ? (
        <section className="rounded-lg bg-white p-6 shadow" data-testid="reports-trend-panel">
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
                  onMouseEnter={() => setHoveredMonthKey(month.monthKey)}
                  onFocus={() => setHoveredMonthKey(month.monthKey)}
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
                Income: {formatCurrencyAmount(hoveredMonth.income, trendCurrency)}
              </div>
              <div className="text-sm" data-testid="trend-tooltip-expense">
                Expense: {formatCurrencyAmount(hoveredMonth.expense, trendCurrency)}
              </div>
              <div
                className={`text-sm ${
                  hoveredMonth.netIncome < 0 ? "text-red-600" : "text-gray-900"
                }`}
                data-testid="trend-tooltip-net-income"
              >
                Net income: {formatSignedMoney(hoveredMonth.netIncome, trendCurrency)}
              </div>
            </div>
          ) : null}
        </section>
      ) : null}

      {!status && activeReport === "breakdown" && breakdown ? (
        <section className="rounded-lg bg-white p-6 shadow" data-testid="reports-breakdown-panel">
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
              {formatSignedMoney(breakdown.kpis.netIncome, breakdownCurrency)}
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
                    <td className="py-2">{formatCurrencyAmount(row.amount, breakdownCurrency)}</td>
                    <td className="py-2">{Math.round(row.ratio * 100)}%</td>
                  </tr>
                ))}
                <tr className="border-t border-gray-200 font-semibold" data-testid="reports-income-total-row">
                  <td className="py-2">Total income</td>
                  <td className="py-2">{formatCurrencyAmount(breakdown.kpis.incomeTotal, breakdownCurrency)}</td>
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
                    <td className="py-2">{formatCurrencyAmount(row.amount, breakdownCurrency)}</td>
                    <td className="py-2">{Math.round(row.ratio * 100)}%</td>
                  </tr>
                ))}
                <tr className="border-t border-gray-200 font-semibold" data-testid="reports-expense-total-row">
                  <td className="py-2">Total expense</td>
                  <td className="py-2">{formatCurrencyAmount(breakdown.kpis.expenseTotal, breakdownCurrency)}</td>
                  <td className="py-2">100%</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </div>
  );
};
