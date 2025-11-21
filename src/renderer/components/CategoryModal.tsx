import React, { useState, useEffect } from "react";
import { AccountType, AccountSubtype } from "../../shared/accountTypes";
import { Account } from "../types";
import { useAccounts } from "../context/AccountsContext";

interface CategoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCategoryCreated: () => void;
  editingCategory?: Account | null;
}

export const CategoryModal: React.FC<CategoryModalProps> = ({
  isOpen,
  onClose,
  onCategoryCreated,
  editingCategory,
}) => {
  const { refreshAccounts } = useAccounts();
  const [categoryName, setCategoryName] = useState("");
  const [categoryType, setCategoryType] = useState<"income" | "expense">("expense");
  const [defaultCurrency, setDefaultCurrency] = useState("USD");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Populate form when editing
  useEffect(() => {
    if (editingCategory) {
      setCategoryName(editingCategory.name);
      setCategoryType(editingCategory.subtype === AccountSubtype.Asset ? "income" : "expense");
      setDefaultCurrency(editingCategory.currency);
    } else {
      // Reset form for new category
      setCategoryName("");
      setCategoryType("expense");
      setDefaultCurrency("USD");
    }
    setError(null);
  }, [editingCategory, isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    
    // Validate category name
    if (!categoryName.trim()) {
      setError("Category name is required");
      return;
    }

    setLoading(true);
    
    try {
      if (editingCategory) {
        // Update existing category
        const result = await window.electron.ipcRenderer.invoke("update-account", {
          id: editingCategory.id,
          name: categoryName.trim(),
          currency: defaultCurrency,
        });

        if (result.success) {
          await refreshAccounts();
          onCategoryCreated();
          onClose();
        } else {
          setError("Failed to update category");
        }
      } else {
        // Check if category name already exists
        const allAccounts = await window.electron.ipcRenderer.invoke(
          "get-accounts-with-balances",
          false
        );
        
        const categoryExists = allAccounts.some(
          (account: any) => 
            account.type === AccountType.Category && 
            account.name.toLowerCase() === categoryName.trim().toLowerCase()
        );
        
        if (categoryExists) {
          setError("A category with this name already exists");
          setLoading(false);
          return;
        }

        // Determine subtype based on category type
        // Income categories are assets (natural debit balance)
        // Expense categories are liabilities (natural credit balance)
        const subtype = categoryType === "income" 
          ? AccountSubtype.Asset 
          : AccountSubtype.Liability;

        // Create the category account
        const result = await window.electron.ipcRenderer.invoke("add-account", {
          name: categoryName.trim(),
          type: AccountType.Category,
          subtype: subtype,
          currency: defaultCurrency,
        });

        if (result.success) {
          await refreshAccounts();
          onCategoryCreated();
          onClose();
        } else {
          setError("Failed to create category");
        }
      }
    } catch (err) {
      console.error("Error saving category:", err);
      setError("An error occurred while saving the category");
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    // Reset form state
    setCategoryName("");
    setCategoryType("expense");
    setDefaultCurrency("USD");
    setError(null);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40">
      <div className="bg-white rounded-lg shadow-lg p-6 w-full max-w-md relative">
        <button
          className="absolute top-2 right-2 text-gray-400 hover:text-gray-600"
          onClick={handleClose}
          aria-label="Close"
        >
          ×
        </button>
        <h2 className="text-lg font-medium text-gray-900 mb-4">
          {editingCategory ? "Edit Category" : "Add New Category"}
        </h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="categoryName"
              className="block text-sm font-medium text-gray-700"
            >
              Category Name
            </label>
            <input
              type="text"
              id="categoryName"
              value={categoryName}
              onChange={(e) => setCategoryName(e.target.value)}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
              required
              placeholder="e.g., Groceries, Salary, Rent"
            />
          </div>
          
          <div>
            <label
              htmlFor="categoryType"
              className="block text-sm font-medium text-gray-700"
            >
              Category Type
            </label>
            <select
              id="categoryType"
              value={categoryType}
              onChange={(e) => setCategoryType(e.target.value as "income" | "expense")}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
              disabled={!!editingCategory}
            >
              <option value="expense">Expense</option>
              <option value="income">Income</option>
            </select>
            <p className="mt-1 text-xs text-gray-500">
              {editingCategory 
                ? "Category type cannot be changed after creation"
                : categoryType === "income" 
                ? "Income categories track money coming in" 
                : "Expense categories track money going out"}
            </p>
          </div>
          
          <div>
            <label
              htmlFor="defaultCurrency"
              className="block text-sm font-medium text-gray-700"
            >
              Default Currency
            </label>
            <select
              id="defaultCurrency"
              value={defaultCurrency}
              onChange={(e) => setDefaultCurrency(e.target.value)}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
            >
              <option value="USD">USD</option>
              <option value="CAD">CAD</option>
              <option value="CNY">CNY</option>
              <option value="EUR">EUR</option>
              <option value="GBP">GBP</option>
              <option value="JPY">JPY</option>
            </select>
            <p className="mt-1 text-xs text-gray-500">
              This category can be used with any currency
            </p>
          </div>

          {error && (
            <div className="text-sm text-red-600 bg-red-50 p-2 rounded">
              {error}
            </div>
          )}

          <button
            type="submit"
            className="inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={loading}
          >
            {loading 
              ? (editingCategory ? "Updating..." : "Creating...") 
              : (editingCategory ? "Update Category" : "Create Category")}
          </button>
        </form>
      </div>
    </div>
  );
};
