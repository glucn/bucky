import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Account } from "../types";
import { AccountType, AccountSubtype } from "../../shared/accountTypes";
import { CategoryModal } from "../components/CategoryModal";
import { formatAccountBalance, formatCurrencyAmount, formatMultiCurrencyBalances } from "../utils/currencyUtils";
import { normalizeAccountBalance } from "../utils/displayNormalization";
import { useAccounts } from "../context/AccountsContext";

interface CategoryWithBalances extends Account {
  balances?: Record<string, number>;
}

export const Categories: React.FC = () => {
  const { refreshAccounts } = useAccounts();
  const [categories, setCategories] = useState<CategoryWithBalances[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingCategoryId, setDeletingCategoryId] = useState<string | null>(null);
  const [archivingCategoryId, setArchivingCategoryId] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<CategoryWithBalances | null>(null);

  // Fetch categories on mount
  useEffect(() => {
    fetchCategories();
  }, []);

  const fetchCategories = async () => {
    try {
      setLoading(true);
      setError(null);
      
      // Fetch all accounts with balances
      const allAccounts = await window.electron.ipcRenderer.invoke(
        "get-accounts-with-balances",
        false // don't include archived
      );
      
      // Filter to only category accounts
      const categoryAccounts = allAccounts.filter(
        (account: Account) => account.type === AccountType.Category
      );
      
      setCategories(categoryAccounts);
    } catch (err) {
      console.error("Error fetching categories:", err);
      setError("Failed to load categories");
    } finally {
      setLoading(false);
    }
  };

  // Helper function to format multi-currency balances with normalization
  const formatBalances = (category: CategoryWithBalances): string => {
    // If multi-currency balances exist, normalize each currency balance
    if (category.balances && Object.keys(category.balances).length > 0) {
      const normalizedBalances: Record<string, number> = {};
      
      for (const [currency, balance] of Object.entries(category.balances)) {
        // Normalize each currency balance (categories always display as positive)
        normalizedBalances[currency] = normalizeAccountBalance(
          balance,
          category.type,
          category.subtype as AccountSubtype
        );
      }
      
      return formatMultiCurrencyBalances(normalizedBalances);
    }
    
    // Single currency balance - normalize and format
    const normalizedBalance = normalizeAccountBalance(
      category.balance || 0,
      category.type,
      category.subtype as AccountSubtype
    );
    
    return formatCurrencyAmount(normalizedBalance, category.currency);
  };

  // Handle delete or archive category
  const handleDeleteOrArchive = async (category: CategoryWithBalances) => {
    // Check if category can be deleted
    const result = await window.electron.ipcRenderer.invoke(
      "can-delete-account",
      category.id
    );
    
    if (result.canDelete) {
      // Confirm hard delete
      if (
        confirm(
          `Are you sure you want to delete the category "${category.name}"? This action cannot be undone.`
        )
      ) {
        setDeletingCategoryId(category.id);
        const delResult = await window.electron.ipcRenderer.invoke(
          "delete-account",
          category.id
        );
        setDeletingCategoryId(null);
        
        if (delResult.success) {
          alert("Category deleted successfully");
          await refreshAccounts();
          await fetchCategories();
        } else {
          alert(`Failed to delete category: ${delResult.error}`);
        }
      }
    } else {
      // Prompt to archive
      if (
        confirm(
          `The category "${category.name}" has ${result.transactionCount} transaction(s).\nYou cannot delete it, but you can archive it.\nArchived categories are hidden from active lists but preserved for reporting.\n\nDo you want to archive this category?`
        )
      ) {
        setArchivingCategoryId(category.id);
        const archResult = await window.electron.ipcRenderer.invoke(
          "archive-account",
          category.id
        );
        setArchivingCategoryId(null);
        
        if (archResult.success) {
          alert("Category archived successfully");
          await refreshAccounts();
          await fetchCategories();
        } else {
          alert(`Failed to archive category: ${archResult.error}`);
        }
      }
    }
  };

  // Separate categories by subtype
  const incomeCategories = categories.filter(
    (cat) => cat.subtype === AccountSubtype.Asset
  );
  const expenseCategories = categories.filter(
    (cat) => cat.subtype === AccountSubtype.Liability
  );

  return (
    <div className="space-y-6">
      {/* Header with Add Category Button */}
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-semibold text-gray-900">Categories</h1>
        <button
          onClick={() => setIsModalOpen(true)}
          className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500"
        >
          Add Category
        </button>
      </div>

      {/* Income Categories Section */}
      <div className="bg-white shadow rounded-lg p-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-medium text-gray-900">Income Categories</h2>
        </div>
        {loading ? (
          <div className="text-center py-4 text-gray-500">Loading...</div>
        ) : error ? (
          <div className="text-center py-4 text-red-500">{error}</div>
        ) : incomeCategories.length === 0 ? (
          <div className="text-center py-4 text-gray-500">No income categories found</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Name
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Balances
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {incomeCategories.map((category) => (
                  <tr key={category.id}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {category.name}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <span className="text-green-600 font-medium" aria-label="Positive amount">
                        {formatBalances(category)}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <div className="flex gap-3 items-center">
                        <Link
                          to={`/accounts/${category.id}/transactions`}
                          className="text-blue-600 hover:text-blue-900 hover:underline"
                        >
                          View Transactions
                        </Link>
                        <button
                          className="text-blue-600 hover:text-blue-900 hover:underline"
                          onClick={() => {
                            setEditingCategory(category);
                            setIsModalOpen(true);
                          }}
                        >
                          Edit
                        </button>
                        <button
                          className="text-red-600 hover:text-red-900 hover:underline disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:no-underline"
                          onClick={() => handleDeleteOrArchive(category)}
                          disabled={
                            deletingCategoryId === category.id ||
                            archivingCategoryId === category.id
                          }
                        >
                          {deletingCategoryId === category.id
                            ? "Deleting..."
                            : archivingCategoryId === category.id
                            ? "Archiving..."
                            : "Delete / Archive"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Expense Categories Section */}
      <div className="bg-white shadow rounded-lg p-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-medium text-gray-900">Expense Categories</h2>
        </div>
        {loading ? (
          <div className="text-center py-4 text-gray-500">Loading...</div>
        ) : error ? (
          <div className="text-center py-4 text-red-500">{error}</div>
        ) : expenseCategories.length === 0 ? (
          <div className="text-center py-4 text-gray-500">No expense categories found</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Name
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Balances
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {expenseCategories.map((category) => (
                  <tr key={category.id}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {category.name}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <span className="text-red-600 font-medium" aria-label="Positive amount">
                        {formatBalances(category)}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <div className="flex gap-3 items-center">
                        <Link
                          to={`/accounts/${category.id}/transactions`}
                          className="text-blue-600 hover:text-blue-900 hover:underline"
                        >
                          View Transactions
                        </Link>
                        <button
                          className="text-blue-600 hover:text-blue-900 hover:underline"
                          onClick={() => {
                            setEditingCategory(category);
                            setIsModalOpen(true);
                          }}
                        >
                          Edit
                        </button>
                        <button
                          className="text-red-600 hover:text-red-900 hover:underline disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:no-underline"
                          onClick={() => handleDeleteOrArchive(category)}
                          disabled={
                            deletingCategoryId === category.id ||
                            archivingCategoryId === category.id
                          }
                        >
                          {deletingCategoryId === category.id
                            ? "Deleting..."
                            : archivingCategoryId === category.id
                            ? "Archiving..."
                            : "Delete / Archive"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Category Modal */}
      <CategoryModal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setEditingCategory(null);
        }}
        onCategoryCreated={() => {
          fetchCategories();
          setEditingCategory(null);
        }}
        editingCategory={editingCategory}
      />
    </div>
  );
};
