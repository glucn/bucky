import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { OverviewDashboardPayload } from "../../shared/overview";
import { useAccounts } from "../context/AccountsContext";
import { formatCurrencyAmount } from "../utils/currencyUtils";

function formatMoney(amount: number, currency: string): string {
  return formatCurrencyAmount(amount, currency, {
    showSymbol: true,
    showCode: true,
  });
}

export const Dashboard: React.FC = () => {
  const { accounts } = useAccounts();
  const [payload, setPayload] = useState<OverviewDashboardPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const mountedRef = useRef(true);
  const hasInitializedAccountsRef = useRef(false);

  const refreshOverview = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await window.electron.getOverviewDashboard();
      if (!mountedRef.current) {
        return;
      }
      setPayload(result);
    } catch (err) {
      if (!mountedRef.current) {
        return;
      }
      setError(err instanceof Error ? err.message : "Failed to load overview dashboard");
    } finally {
      if (mountedRef.current) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    void refreshOverview();

    return () => {
      mountedRef.current = false;
    };
  }, [refreshOverview]);

  const accountsSignature = useMemo(
    () => accounts.map((account) => account.id).sort().join("|"),
    [accounts]
  );

  useEffect(() => {
    if (!hasInitializedAccountsRef.current) {
      hasInitializedAccountsRef.current = true;
      return;
    }

    const timer = window.setTimeout(() => {
      void refreshOverview();
    }, 300);

    return () => {
      window.clearTimeout(timer);
    };
  }, [accountsSignature, refreshOverview]);

  if (loading) {
    return <div data-testid="overview-loading">Loading overview...</div>;
  }

  if (error || !payload) {
    return <div data-testid="overview-error">Failed to load overview dashboard.</div>;
  }

  return (
    <div className="space-y-6" data-testid="overview-dashboard">
      <section className="bg-white shadow rounded-lg p-6" data-testid="overview-net-worth-card">
        <h2 className="text-lg font-medium text-gray-900">Net Worth</h2>
        <p className="mt-2 text-3xl font-bold text-primary-600">
          {formatMoney(payload.netWorth.amount, payload.netWorth.currency)}
        </p>
      </section>

      <section className="bg-white shadow rounded-lg p-6" data-testid="overview-trend-card">
        <h2 className="text-lg font-medium text-gray-900">6-Month Trend</h2>
        <div className="mt-4 space-y-2">
          {payload.incomeExpenseTrend6m.months.map((month) => (
            <div key={month.monthKey} className="flex items-center justify-between text-sm">
              <span className="text-gray-600">{month.monthKey}</span>
              <span className="text-green-600">
                {formatMoney(month.income, payload.incomeExpenseTrend6m.currency)}
              </span>
              <span className="text-red-600">
                {formatMoney(month.expense, payload.incomeExpenseTrend6m.currency)}
              </span>
            </div>
          ))}
        </div>
      </section>

      <section className="bg-white shadow rounded-lg p-6" data-testid="overview-allocation-card">
        <h2 className="text-lg font-medium text-gray-900">Investment Allocation</h2>
        {payload.investmentAllocation.hasData ? (
          <div className="mt-4 space-y-2">
            {payload.investmentAllocation.slices.map((slice) => (
              <div key={slice.portfolioId} className="flex items-center justify-between text-sm">
                <span className="text-gray-700">{slice.portfolioName}</span>
                <span className="text-gray-900">
                  {formatMoney(slice.amount, payload.investmentAllocation.currency)}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-4 text-gray-500" data-testid="overview-allocation-empty">
            No investment data yet.
          </p>
        )}
      </section>
    </div>
  );
};
