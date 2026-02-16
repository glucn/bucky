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
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
