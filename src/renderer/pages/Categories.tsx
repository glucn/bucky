import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Account, AccountGroup, GroupedAccountsView } from "../types";
import { AccountType, AccountSubtype } from "../../shared/accountTypes";
import { CategoryModal } from "../components/CategoryModal";
import { AccountGroupModal } from "../components/AccountGroupModal";
import { GroupedAccountsList } from "../components/GroupedAccountsList";
import { formatAccountBalance, formatCurrencyAmount, formatMultiCurrencyBalances } from "../utils/currencyUtils";
import { normalizeAccountBalance } from "../utils/displayNormalization";
import { useAccounts } from "../context/AccountsContext";

interface CategoryWithBalances extends Account {
  balances?: Record<string, number>;
}

export const Categories: React.FC = () => {
  const { refreshAccounts } = useAccounts();
  const [groupedAccountsView, setGroupedAccountsView] = useState<GroupedAccountsView>({
    groups: [],
    ungroupedAccounts: [],
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingCategoryId, setDeletingCategoryId] = useState<string | null>(null);
  const [archivingCategoryId, setArchivingCategoryId] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [showGroupModal, setShowGroupModal] = useState(false);
  const [editingCategory, setEditingCategory] = useState<CategoryWithBalances | null>(null);
  const [editingGroup, setEditingGroup] = useState<AccountGroup | null>(null);

  // Fetch grouped categories
  const fetchGroupedCategories = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await window.electron.ipcRenderer.invoke(
        "get-accounts-with-groups",
        { includeArchived: false, accountType: AccountType.Category }
      );
      
      if (response.success && response.data) {
        setGroupedAccountsView(response.data);
      } else {
        console.error("Failed to fetch grouped categories:", response.error);
        setError(response.error || "Failed to load categories");
      }
    } catch (err) {
      console.error("Error fetching grouped categories:", err);
      setError("Failed to load categories");
    } finally {
      setLoading(false);
    }
  };

  // Fetch categories on mount
  useEffect(() => {
    fetchGroupedCategories();
  }, []);

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
          await fetchGroupedCategories();
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
          await fetchGroupedCategories();
        } else {
          alert(`Failed to archive category: ${archResult.error}`);
        }
      }
    }
  };

  // Group management handlers
  const handleCreateGroup = () => {
    setEditingGroup(null);
    setShowGroupModal(true);
  };

  const handleGroupCreated = async () => {
    await fetchGroupedCategories();
    await refreshAccounts();
  };

  const handleGroupEdit = (group: AccountGroup) => {
    setEditingGroup(group);
    setShowGroupModal(true);
  };

  const handleGroupDelete = async (group: AccountGroup) => {
    if (confirm(`Are you sure you want to delete the group "${group.name}"? Categories in this group will be moved to ungrouped.`)) {
      try {
        const result = await window.electron.ipcRenderer.invoke("delete-account-group", group.id);
        if (result.success) {
          await fetchGroupedCategories();
          await refreshAccounts();
        } else {
          alert(result.error || "Failed to delete group");
        }
      } catch (error) {
        console.error("Error deleting group:", error);
        alert("Failed to delete group");
      }
    }
  };

  const handleAccountMove = async (accountId: string, groupId: string | null) => {
    try {
      let result;
      if (groupId === null) {
        result = await window.electron.ipcRenderer.invoke("remove-account-from-group", accountId);
      } else {
        result = await window.electron.ipcRenderer.invoke("add-account-to-group", { accountId, groupId });
      }
      
      if (result.success) {
        await fetchGroupedCategories();
        await refreshAccounts();
      } else {
        alert(result.error || "Failed to move category");
      }
    } catch (error) {
      console.error("Error moving category:", error);
      alert("Failed to move category");
    }
  };

  const handleGroupReorder = async (groupId: string, direction: 'up' | 'down') => {
    try {
      const currentGroups = groupedAccountsView.groups;
      const currentIndex = currentGroups.findIndex(g => g.id === groupId);
      
      if (currentIndex === -1) return;
      
      // Calculate new positions
      const newGroups = [...currentGroups];
      if (direction === 'up' && currentIndex > 0) {
        // Swap with previous group
        [newGroups[currentIndex - 1], newGroups[currentIndex]] = 
        [newGroups[currentIndex], newGroups[currentIndex - 1]];
      } else if (direction === 'down' && currentIndex < newGroups.length - 1) {
        // Swap with next group
        [newGroups[currentIndex], newGroups[currentIndex + 1]] = 
        [newGroups[currentIndex + 1], newGroups[currentIndex]];
      } else {
        return; // No change needed
      }
      
      // Create array of {id, displayOrder} for all groups
      const groupOrders = newGroups.map((group, index) => ({
        id: group.id,
        displayOrder: index,
      }));
      
      // Call IPC handler to persist the new order
      const result = await window.electron.ipcRenderer.invoke("reorder-account-groups", groupOrders);
      
      if (!result.success) {
        console.error("Failed to reorder groups:", result.error);
        alert(result.error || "Failed to reorder groups");
        return;
      }
      
      // Refresh the groups list
      await fetchGroupedCategories();
    } catch (error) {
      console.error("Error reordering groups:", error);
      alert("Failed to reorder groups");
    }
  };

  return (
    <div className="space-y-6">
      {/* Header with Add Category and Create Group Buttons */}
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-semibold text-gray-900">Categories</h1>
        <div className="flex gap-2">
          <button
            onClick={() => setIsModalOpen(true)}
            className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500"
          >
            Add Category
          </button>
          <button
            onClick={handleCreateGroup}
            className="inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md shadow-sm text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500"
          >
            Create Group
          </button>
        </div>
      </div>

      {/* Grouped Categories List */}
      <div className="bg-white shadow rounded-lg p-6">
        {loading ? (
          <div className="text-center py-4 text-gray-500">Loading...</div>
        ) : error ? (
          <div className="text-center py-4 text-red-500">{error}</div>
        ) : (
          <GroupedAccountsList
            groups={groupedAccountsView.groups}
            ungroupedAccounts={groupedAccountsView.ungroupedAccounts}
            accountType={AccountType.Category}
            onAccountEdit={(account) => {
              setEditingCategory(account as CategoryWithBalances);
              setIsModalOpen(true);
            }}
            onGroupEdit={handleGroupEdit}
            onGroupDelete={handleGroupDelete}
            onAccountMove={handleAccountMove}
            onGroupReorder={handleGroupReorder}
            accountBalances={{}}
          />
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
          fetchGroupedCategories();
          setEditingCategory(null);
        }}
        editingCategory={editingCategory}
      />

      {/* Account Group Modal */}
      <AccountGroupModal
        isOpen={showGroupModal}
        onClose={() => {
          setShowGroupModal(false);
          setEditingGroup(null);
        }}
        onGroupCreated={handleGroupCreated}
        accountType={AccountType.Category}
        editingGroup={editingGroup}
      />
    </div>
  );
};
