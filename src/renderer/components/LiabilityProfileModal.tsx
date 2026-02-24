import React, { useEffect, useMemo, useState } from "react";
import {
  LiabilityDueScheduleType,
  LiabilityMinimumPaymentType,
  LiabilityPaymentFrequency,
  LiabilityProfileInput,
  LiabilityRepaymentMethod,
  LiabilityTemplate,
} from "../../shared/liabilityTypes";

interface LiabilityProfileModalProps {
  accountId: string;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  initialTemplate?: LiabilityTemplate;
  allowSkip?: boolean;
}

const templateOptions: { value: LiabilityTemplate; label: string }[] = [
  { value: LiabilityTemplate.CreditCard, label: "Credit Card" },
  { value: LiabilityTemplate.LoanMortgage, label: "Loan/Mortgage" },
  { value: LiabilityTemplate.PersonalDebt, label: "Personal Debt" },
  { value: LiabilityTemplate.Blank, label: "Blank" },
];

const LiabilityProfileModal: React.FC<LiabilityProfileModalProps> = ({
  accountId,
  isOpen,
  onClose,
  onSuccess,
  initialTemplate,
  allowSkip = false,
}) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [expandedHistoryId, setExpandedHistoryId] = useState<string | null>(null);
  const [conversionTemplate, setConversionTemplate] = useState<LiabilityTemplate | null>(null);
  const [hasPostedTransactions, setHasPostedTransactions] = useState(false);
  const [form, setForm] = useState<LiabilityProfileInput>({
    template: initialTemplate || LiabilityTemplate.Blank,
    asOfDate: new Date().toISOString().slice(0, 10),
    effectiveDate: new Date().toISOString().slice(0, 10),
  });

  const isCreditCard = form.template === LiabilityTemplate.CreditCard;
  const isLoan = form.template === LiabilityTemplate.LoanMortgage;
  const isPersonalDebt = form.template === LiabilityTemplate.PersonalDebt;

  const canSkip = allowSkip && form.template === LiabilityTemplate.Blank;

  const templateLabel = useMemo(() => {
    return templateOptions.find((t) => t.value === form.template)?.label || "Liability";
  }, [form.template]);

  useEffect(() => {
    if (!isOpen) return;
    const load = async () => {
      setError(null);
      try {
        const [profileResult, historyResult] = await Promise.all([
          window.electron.getLiabilityProfile(accountId),
          window.electron.getLiabilityVersionHistory(accountId),
        ]);

        if (profileResult.success && profileResult.profile) {
          const p = profileResult.profile;
          setHasPostedTransactions(Boolean(p.hasPostedTransactions));
          setForm({
            template: p.template || initialTemplate || LiabilityTemplate.Blank,
            currentAmountOwed: p.currentAmountOwed,
            asOfDate: new Date().toISOString().slice(0, 10),
            effectiveDate: new Date().toISOString().slice(0, 10),
            counterpartyName: p.counterpartyName || undefined,
            limitOrCeiling: p.limitOrCeiling ?? undefined,
            statementClosingDay: p.statementClosingDay ?? undefined,
            paymentDueDay: p.paymentDueDay ?? undefined,
            minimumPaymentType: p.minimumPaymentType ?? undefined,
            minimumPaymentPercent: p.minimumPaymentPercent ?? undefined,
            minimumPaymentAmount: p.minimumPaymentAmount ?? undefined,
            interestRate: p.interestRate !== undefined && p.interestRate !== null ? p.interestRate * 100 : undefined,
            scheduledPaymentAmount: p.scheduledPaymentAmount ?? undefined,
            paymentFrequency: p.paymentFrequency ?? undefined,
            dueScheduleType: p.dueScheduleType ?? undefined,
            dueDayOfMonth: p.dueDayOfMonth ?? undefined,
            dueWeekday: p.dueWeekday ?? undefined,
            anchorDate: p.anchorDate ?? undefined,
            repaymentMethod: p.repaymentMethod ?? undefined,
            originalPrincipal: p.originalPrincipal ?? undefined,
          });
        } else {
          setHasPostedTransactions(false);
          setForm((prev) => ({
            ...prev,
            template: initialTemplate || prev.template,
          }));
        }

        if (historyResult.success && Array.isArray(historyResult.history)) {
          setHistory(historyResult.history);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load liability profile");
      }
    };
    void load();
  }, [accountId, initialTemplate, isOpen]);

  const validate = (): string | null => {
    if (isCreditCard) {
      if (form.limitOrCeiling === undefined) return "Credit limit is required";
      if (form.statementClosingDay === undefined) return "Statement closing day is required";
      if (form.paymentDueDay === undefined) return "Payment due day is required";
      if (!form.minimumPaymentType) return "Minimum payment type is required";
      if (
        form.minimumPaymentType === LiabilityMinimumPaymentType.Percent &&
        form.minimumPaymentPercent === undefined
      ) {
        return "Minimum payment percent is required";
      }
      if (
        form.minimumPaymentType === LiabilityMinimumPaymentType.Amount &&
        form.minimumPaymentAmount === undefined
      ) {
        return "Minimum payment amount is required";
      }
    }

    if (isLoan) {
      if (form.interestRate === undefined) return "Interest rate is required";
      if (form.scheduledPaymentAmount === undefined) return "Scheduled payment amount is required";
      if (!form.paymentFrequency) return "Payment frequency is required";
      if (!form.dueScheduleType) return "Due schedule is required";
      if (!form.repaymentMethod) return "Repayment method is required";
      if (form.paymentDueDay === undefined) return "Payment due day is required";
      if (
        form.dueScheduleType === LiabilityDueScheduleType.MonthlyDay &&
        form.dueDayOfMonth === undefined
      ) {
        return "Day of month is required";
      }
      if (
        (form.dueScheduleType === LiabilityDueScheduleType.WeeklyWeekday ||
          form.dueScheduleType === LiabilityDueScheduleType.BiweeklyWeekdayAnchor) &&
        (form.dueWeekday === undefined || !form.anchorDate)
      ) {
        return "Weekday and anchor date are required";
      }
    }

    if (isPersonalDebt && !form.counterpartyName?.trim()) {
      return "Counterparty name is required";
    }

    if (form.currentAmountOwed !== undefined && !form.asOfDate) {
      return "As-of date is required when balance owed is set";
    }

    return null;
  };

  const handleSave = async () => {
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const payload: LiabilityProfileInput = {
        ...form,
        interestRate:
          form.interestRate !== undefined
            ? Math.round((form.interestRate / 100) * 1000000) / 1000000
            : undefined,
      };
      const result = await window.electron.upsertLiabilityProfile({
        accountId,
        profile: payload,
      });
      if (!result.success) {
        throw new Error(result.error || "Failed to save liability profile");
      }
      onSuccess();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unexpected error");
    } finally {
      setLoading(false);
    }
  };

  const handleConvert = async () => {
    if (!conversionTemplate || conversionTemplate === form.template) return;
    setLoading(true);
    setError(null);
    try {
      const result = await window.electron.convertLiabilityTemplate({
        accountId,
        targetTemplate: conversionTemplate,
        profile: {
          ...form,
          interestRate:
            form.interestRate !== undefined
              ? Math.round((form.interestRate / 100) * 1000000) / 1000000
              : undefined,
        },
      });
      if (!result.success) {
        throw new Error(result.error || "Failed to convert template");
      }
      setForm((prev) => ({ ...prev, template: conversionTemplate }));
      setConversionTemplate(null);
      const historyResult = await window.electron.getLiabilityVersionHistory(accountId);
      if (historyResult.success && Array.isArray(historyResult.history)) {
        setHistory(historyResult.history);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unexpected error");
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40">
      <div className="bg-white rounded-lg shadow-lg p-6 w-full max-w-3xl max-h-[90vh] overflow-y-auto relative">
        <button
          className="absolute top-2 right-2 text-gray-400 hover:text-gray-600 text-2xl"
          onClick={onClose}
          aria-label="Close"
        >
          ×
        </button>
        <h2 className="text-lg font-medium text-gray-900 mb-4">Liability Profile - {templateLabel}</h2>

        {error && <div className="mb-4 p-3 bg-red-100 border border-red-300 rounded text-red-700">{error}</div>}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">Template</label>
            <select
              className="mt-1 block w-full rounded-md border-gray-300"
              value={form.template}
              onChange={(e) => setForm({ ...form, template: e.target.value as LiabilityTemplate })}
            >
              {templateOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">Balance owed</label>
            <input
              type="number"
              step="0.01"
              className="mt-1 block w-full rounded-md border-gray-300"
              value={form.currentAmountOwed ?? ""}
              disabled={hasPostedTransactions}
              onChange={(e) =>
                setForm({
                  ...form,
                  currentAmountOwed: e.target.value === "" ? undefined : Number(e.target.value),
                })
              }
            />
            {hasPostedTransactions && (
              <p className="mt-1 text-xs text-gray-500">
                Balance owed is read-only once transactions exist. Use Opening Balance to adjust baseline.
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">As-of date</label>
            <input
              type="date"
              className="mt-1 block w-full rounded-md border-gray-300"
              value={form.asOfDate ?? ""}
              onChange={(e) => setForm({ ...form, asOfDate: e.target.value || undefined })}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">Effective date</label>
            <input
              type="date"
              className="mt-1 block w-full rounded-md border-gray-300"
              value={form.effectiveDate ?? ""}
              onChange={(e) => setForm({ ...form, effectiveDate: e.target.value || undefined })}
            />
          </div>

          {isPersonalDebt && (
            <div>
              <label className="block text-sm font-medium text-gray-700">Counterparty name</label>
              <input
                type="text"
                className="mt-1 block w-full rounded-md border-gray-300"
                value={form.counterpartyName ?? ""}
                onChange={(e) => setForm({ ...form, counterpartyName: e.target.value })}
              />
            </div>
          )}

          {(isCreditCard || isLoan) && (
            <div>
              <label className="block text-sm font-medium text-gray-700">Payment due day</label>
              <input
                type="number"
                min={1}
                max={31}
                className="mt-1 block w-full rounded-md border-gray-300"
                value={form.paymentDueDay ?? ""}
                onChange={(e) =>
                  setForm({
                    ...form,
                    paymentDueDay: e.target.value === "" ? undefined : Number(e.target.value),
                  })
                }
              />
            </div>
          )}

          {isCreditCard && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700">Credit limit</label>
                <input
                  type="number"
                  step="0.01"
                  className="mt-1 block w-full rounded-md border-gray-300"
                  value={form.limitOrCeiling ?? ""}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      limitOrCeiling: e.target.value === "" ? undefined : Number(e.target.value),
                    })
                  }
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">Statement closing day</label>
                <input
                  type="number"
                  min={1}
                  max={31}
                  className="mt-1 block w-full rounded-md border-gray-300"
                  value={form.statementClosingDay ?? ""}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      statementClosingDay: e.target.value === "" ? undefined : Number(e.target.value),
                    })
                  }
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">Minimum payment type</label>
                <select
                  className="mt-1 block w-full rounded-md border-gray-300"
                  value={form.minimumPaymentType ?? ""}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      minimumPaymentType: e.target.value as LiabilityMinimumPaymentType,
                    })
                  }
                >
                  <option value="">Select type</option>
                  <option value={LiabilityMinimumPaymentType.Percent}>Percent</option>
                  <option value={LiabilityMinimumPaymentType.Amount}>Amount</option>
                  <option value={LiabilityMinimumPaymentType.Both}>Both</option>
                </select>
              </div>

              {(form.minimumPaymentType === LiabilityMinimumPaymentType.Percent ||
                form.minimumPaymentType === LiabilityMinimumPaymentType.Both) && (
                <div>
                  <label className="block text-sm font-medium text-gray-700">Minimum payment percent</label>
                  <input
                    type="number"
                    step="0.01"
                    className="mt-1 block w-full rounded-md border-gray-300"
                    value={form.minimumPaymentPercent !== undefined ? form.minimumPaymentPercent * 100 : ""}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        minimumPaymentPercent:
                          e.target.value === "" ? undefined : Number(e.target.value) / 100,
                      })
                    }
                  />
                </div>
              )}

              {(form.minimumPaymentType === LiabilityMinimumPaymentType.Amount ||
                form.minimumPaymentType === LiabilityMinimumPaymentType.Both) && (
                <div>
                  <label className="block text-sm font-medium text-gray-700">Minimum payment amount</label>
                  <input
                    type="number"
                    step="0.01"
                    className="mt-1 block w-full rounded-md border-gray-300"
                    value={form.minimumPaymentAmount ?? ""}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        minimumPaymentAmount:
                          e.target.value === "" ? undefined : Number(e.target.value),
                      })
                    }
                  />
                </div>
              )}
            </>
          )}

          {isLoan && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700">Interest rate (%)</label>
                <input
                  type="number"
                  step="0.01"
                  className="mt-1 block w-full rounded-md border-gray-300"
                  value={form.interestRate ?? ""}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      interestRate: e.target.value === "" ? undefined : Number(e.target.value),
                    })
                  }
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">Scheduled payment amount</label>
                <input
                  type="number"
                  step="0.01"
                  className="mt-1 block w-full rounded-md border-gray-300"
                  value={form.scheduledPaymentAmount ?? ""}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      scheduledPaymentAmount:
                        e.target.value === "" ? undefined : Number(e.target.value),
                    })
                  }
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">Payment frequency</label>
                <select
                  className="mt-1 block w-full rounded-md border-gray-300"
                  value={form.paymentFrequency ?? ""}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      paymentFrequency: e.target.value as LiabilityPaymentFrequency,
                    })
                  }
                >
                  <option value="">Select frequency</option>
                  <option value={LiabilityPaymentFrequency.Monthly}>Monthly</option>
                  <option value={LiabilityPaymentFrequency.Biweekly}>Biweekly</option>
                  <option value={LiabilityPaymentFrequency.Weekly}>Weekly</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">Due schedule type</label>
                <select
                  className="mt-1 block w-full rounded-md border-gray-300"
                  value={form.dueScheduleType ?? ""}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      dueScheduleType: e.target.value as LiabilityDueScheduleType,
                    })
                  }
                >
                  <option value="">Select schedule</option>
                  <option value={LiabilityDueScheduleType.MonthlyDay}>Monthly day</option>
                  <option value={LiabilityDueScheduleType.WeeklyWeekday}>Weekly weekday</option>
                  <option value={LiabilityDueScheduleType.BiweeklyWeekdayAnchor}>Biweekly weekday + anchor</option>
                </select>
              </div>

              {form.dueScheduleType === LiabilityDueScheduleType.MonthlyDay && (
                <div>
                  <label className="block text-sm font-medium text-gray-700">Due day of month</label>
                  <input
                    type="number"
                    min={1}
                    max={31}
                    className="mt-1 block w-full rounded-md border-gray-300"
                    value={form.dueDayOfMonth ?? ""}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        dueDayOfMonth: e.target.value === "" ? undefined : Number(e.target.value),
                      })
                    }
                  />
                </div>
              )}

              {(form.dueScheduleType === LiabilityDueScheduleType.WeeklyWeekday ||
                form.dueScheduleType === LiabilityDueScheduleType.BiweeklyWeekdayAnchor) && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Due weekday (0-6)</label>
                    <input
                      type="number"
                      min={0}
                      max={6}
                      className="mt-1 block w-full rounded-md border-gray-300"
                      value={form.dueWeekday ?? ""}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          dueWeekday: e.target.value === "" ? undefined : Number(e.target.value),
                        })
                      }
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Anchor date</label>
                    <input
                      type="date"
                      className="mt-1 block w-full rounded-md border-gray-300"
                      value={form.anchorDate ?? ""}
                      onChange={(e) => setForm({ ...form, anchorDate: e.target.value || undefined })}
                    />
                  </div>
                </>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700">Repayment method</label>
                <select
                  className="mt-1 block w-full rounded-md border-gray-300"
                  value={form.repaymentMethod ?? ""}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      repaymentMethod: e.target.value as LiabilityRepaymentMethod,
                    })
                  }
                >
                  <option value="">Select method</option>
                  <option value={LiabilityRepaymentMethod.FixedPayment}>Fixed payment</option>
                  <option value={LiabilityRepaymentMethod.FixedPrincipal}>Fixed principal</option>
                  <option value={LiabilityRepaymentMethod.ManualFixedPayment}>Manual fixed payment</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">Original principal (optional)</label>
                <input
                  type="number"
                  step="0.01"
                  className="mt-1 block w-full rounded-md border-gray-300"
                  value={form.originalPrincipal ?? ""}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      originalPrincipal: e.target.value === "" ? undefined : Number(e.target.value),
                    })
                  }
                />
              </div>
            </>
          )}

          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700">Change note (optional)</label>
            <input
              type="text"
              className="mt-1 block w-full rounded-md border-gray-300"
              value={form.changeNote ?? ""}
              onChange={(e) => setForm({ ...form, changeNote: e.target.value || undefined })}
            />
          </div>
        </div>

        <div className="mt-6 border-t border-gray-200 pt-4">
          <h3 className="text-md font-medium text-gray-900">Advanced</h3>
          <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
            <div>
              <label className="block text-sm font-medium text-gray-700">Convert template</label>
              <select
                className="mt-1 block w-full rounded-md border-gray-300"
                value={conversionTemplate || ""}
                onChange={(e) => setConversionTemplate(e.target.value as LiabilityTemplate)}
              >
                <option value="">Select template</option>
                {templateOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="button"
              onClick={handleConvert}
              disabled={loading || !conversionTemplate || conversionTemplate === form.template}
              className="inline-flex justify-center px-4 py-2 rounded-md text-sm font-medium text-white bg-gray-700 hover:bg-gray-800 disabled:opacity-50"
            >
              Convert
            </button>
          </div>

          <div className="mt-4 space-y-2 max-h-52 overflow-y-auto border border-gray-200 rounded p-3">
            {history.length === 0 && <div className="text-sm text-gray-500">No version history yet.</div>}
            {history.map((row) => {
              const expanded = expandedHistoryId === row.id;
              const changedFields = Object.keys(row).filter(
                (key) =>
                  ![
                    "id",
                    "profileId",
                    "createdAt",
                    "updatedAt",
                    "effectiveDate",
                    "template",
                  ].includes(key) && row[key] !== null
              );
              return (
                <div key={row.id} className="border border-gray-200 rounded p-2">
                  <button
                    type="button"
                    className="w-full text-left"
                    onClick={() => setExpandedHistoryId(expanded ? null : row.id)}
                  >
                    <div className="flex justify-between text-sm">
                      <span className="font-medium">{row.effectiveDate}</span>
                      <span className="text-gray-500">{new Date(row.updatedAt).toLocaleString()}</span>
                    </div>
                    <div className="text-xs text-gray-600 mt-1">
                      {changedFields.length > 0 ? changedFields.join(", ") : "No changed fields"}
                    </div>
                  </button>
                  {expanded && (
                    <pre className="mt-2 text-xs bg-gray-50 p-2 rounded overflow-x-auto">
                      {JSON.stringify(row, null, 2)}
                    </pre>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-3">
          {canSkip && (
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700"
            >
              Skip for now
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={loading}
            className="px-4 py-2 border border-transparent rounded-md text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 disabled:opacity-50"
          >
            {loading ? "Saving..." : "Save Liability Profile"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default LiabilityProfileModal;
