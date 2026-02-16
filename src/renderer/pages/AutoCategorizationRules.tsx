import React from "react";

interface RuleListItem {
  id: string;
  pattern: string;
  matchType: "exact" | "keyword";
  targetCategoryAccountId: string | null;
  targetCategoryName: string | null;
  lastUpdatedAt: Date | string;
  status: "Valid" | "Invalid target";
}

export const AutoCategorizationRules: React.FC = () => {
  const [rules, setRules] = React.useState<RuleListItem[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [search, setSearch] = React.useState("");
  const [editingRule, setEditingRule] = React.useState<RuleListItem | null>(null);
  const [editPattern, setEditPattern] = React.useState("");
  const [editMatchType, setEditMatchType] = React.useState<"exact" | "keyword">("exact");
  const [editTargetCategoryAccountId, setEditTargetCategoryAccountId] = React.useState("");
  const [editError, setEditError] = React.useState<string | null>(null);
  const [activeCategories, setActiveCategories] = React.useState<Array<{ id: string; name: string }>>([]);
  const [pendingDeleteRuleId, setPendingDeleteRuleId] = React.useState<string | null>(null);

  React.useEffect(() => {
    const loadRules = async () => {
      setLoading(true);
      try {
        const fetched = await window.electron.getAutoCategorizationRules();
        setRules(Array.isArray(fetched) ? fetched : []);
      } finally {
        setLoading(false);
      }
    };

    void loadRules();
  }, []);

  const filteredRules = React.useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    const byPattern = normalizedSearch
      ? rules.filter((rule) => rule.pattern.toLowerCase().includes(normalizedSearch))
      : rules;

    return [...byPattern].sort(
      (left, right) =>
        new Date(right.lastUpdatedAt).getTime() - new Date(left.lastUpdatedAt).getTime()
    );
  }, [rules, search]);

  const formatLastUpdated = (value: Date | string) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return "-";
    }

    return date.toLocaleDateString();
  };

  const openEditModal = async (rule: RuleListItem) => {
    setEditingRule(rule);
    setEditPattern(rule.pattern);
    setEditMatchType(rule.matchType);
    setEditTargetCategoryAccountId(rule.targetCategoryAccountId || "");
    setEditError(null);

    const categoryResult = await window.electron.ipcRenderer.invoke("get-category-accounts", false);
    const active = categoryResult?.success && Array.isArray(categoryResult.accounts)
      ? categoryResult.accounts.filter((account: any) => !account.isArchived)
      : [];
    setActiveCategories(active.map((account: any) => ({ id: account.id, name: account.name })));
  };

  const handleSave = async () => {
    if (!editingRule || !editTargetCategoryAccountId) {
      return;
    }

    try {
      const updatedRule = await window.electron.updateAutoCategorizationRule(editingRule.id, {
        pattern: editPattern,
        matchType: editMatchType,
        targetCategoryAccountId: editTargetCategoryAccountId,
      });

      setRules((current) =>
        current.map((rule) => (rule.id === updatedRule.id ? updatedRule : rule))
      );
      setEditingRule(null);
      setEditError(null);
    } catch (error) {
      setEditError(error instanceof Error ? error.message : "Failed to update rule");
    }
  };

  const handleDelete = (ruleId: string) => {
    setPendingDeleteRuleId(ruleId);
  };

  const confirmDelete = async () => {
    if (!pendingDeleteRuleId) {
      return;
    }

    await window.electron.deleteAutoCategorizationRule(pendingDeleteRuleId);
    setRules((current) => current.filter((rule) => rule.id !== pendingDeleteRuleId));
    setPendingDeleteRuleId(null);
  };

  return (
    <div data-testid="auto-categorization-settings-page">
      <h1 className="text-2xl font-bold text-gray-900">Auto-Categorization</h1>
      <p className="mt-2 text-sm text-gray-600">Manage auto-categorization rules.</p>

      <div className="mt-4">
        <input
          type="text"
          placeholder="Search patterns"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          className="w-full max-w-sm rounded-md border border-gray-300 px-3 py-2 text-sm"
          data-testid="auto-categorization-search-input"
        />
      </div>

      {loading ? (
        <div className="mt-4 text-sm text-gray-500">Loading rules...</div>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead>
              <tr className="text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                <th className="px-3 py-2">Pattern</th>
                <th className="px-3 py-2">Match Type</th>
                <th className="px-3 py-2">Target Category</th>
                <th className="px-3 py-2">Last Updated</th>
                <th className="px-3 py-2">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 text-sm text-gray-800">
              {filteredRules.map((rule) => (
                <tr key={rule.id} data-testid={`auto-categorization-row-${rule.id}`}>
                  <td className="px-3 py-2">{rule.pattern}</td>
                  <td className="px-3 py-2">{rule.matchType}</td>
                  <td className="px-3 py-2">{rule.targetCategoryName || "—"}</td>
                  <td className="px-3 py-2">{formatLastUpdated(rule.lastUpdatedAt)}</td>
                  <td className="px-3 py-2">{rule.status}</td>
                  <td className="px-3 py-2 text-right">
                    <button
                      type="button"
                      className="mr-2 text-sm text-primary-600 hover:text-primary-700"
                      data-testid={`auto-categorization-edit-${rule.id}`}
                      onClick={() => {
                        void openEditModal(rule);
                      }}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className="text-sm text-red-600 hover:text-red-700"
                      data-testid={`auto-categorization-delete-${rule.id}`}
                      onClick={() => {
                        handleDelete(rule.id);
                      }}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editingRule && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/20">
          <div className="w-full max-w-md rounded-md bg-white p-4 shadow-lg" data-testid="auto-categorization-edit-modal">
            <h2 className="text-lg font-semibold text-gray-900">Edit Rule</h2>

            <label className="mt-3 block text-sm text-gray-700">Pattern</label>
            <input
              value={editPattern}
              onChange={(event) => setEditPattern(event.target.value)}
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              data-testid="auto-categorization-edit-pattern"
            />

            <label className="mt-3 block text-sm text-gray-700">Match Type</label>
            <select
              value={editMatchType}
              onChange={(event) => setEditMatchType(event.target.value as "exact" | "keyword")}
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              data-testid="auto-categorization-edit-match-type"
            >
              <option value="exact">exact</option>
              <option value="keyword">keyword</option>
            </select>

            <label className="mt-3 block text-sm text-gray-700">Target Category</label>
            <select
              value={editTargetCategoryAccountId}
              onChange={(event) => setEditTargetCategoryAccountId(event.target.value)}
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              data-testid="auto-categorization-edit-target"
            >
              <option value="">Select category</option>
              {activeCategories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>

            {editError && <div className="mt-3 text-sm text-red-600">{editError}</div>}

            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                className="rounded-md border border-gray-300 px-3 py-2 text-sm"
                onClick={() => {
                  setEditingRule(null);
                  setEditError(null);
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="rounded-md bg-primary-600 px-3 py-2 text-sm text-white"
                data-testid="auto-categorization-save-button"
                onClick={() => {
                  void handleSave();
                }}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {pendingDeleteRuleId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
          <div className="w-full max-w-sm rounded-md bg-white p-4 shadow-lg" data-testid="auto-categorization-delete-confirmation">
            <h2 className="text-base font-semibold text-gray-900">Delete rule?</h2>
            <p className="mt-2 text-sm text-gray-600">This action cannot be undone.</p>

            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                className="rounded-md border border-gray-300 px-3 py-2 text-sm"
                onClick={() => setPendingDeleteRuleId(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="rounded-md bg-red-600 px-3 py-2 text-sm text-white"
                data-testid="auto-categorization-delete-confirm-button"
                onClick={() => {
                  void confirmDelete();
                }}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
