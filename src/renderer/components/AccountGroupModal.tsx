import React, { useState, useEffect } from "react";
import { AccountType } from "../../shared/accountTypes";
import { AccountGroup } from "../types";

interface AccountGroupModalProps {
  isOpen: boolean;
  onClose: () => void;
  onGroupCreated: () => void;
  accountType: AccountType;
  editingGroup?: AccountGroup | null;
}

export const AccountGroupModal: React.FC<AccountGroupModalProps> = ({
  isOpen,
  onClose,
  onGroupCreated,
  accountType,
  editingGroup,
}) => {
  const [groupName, setGroupName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Populate form when editing
  useEffect(() => {
    if (editingGroup) {
      setGroupName(editingGroup.name);
    } else {
      // Reset form for new group
      setGroupName("");
    }
    setError(null);
  }, [editingGroup, isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    
    // Validate group name is not empty
    if (!groupName.trim()) {
      setError("Group name is required");
      return;
    }

    setLoading(true);
    
    try {
      if (editingGroup) {
        // Update existing group
        const result = await window.electron.ipcRenderer.invoke("update-account-group", {
          id: editingGroup.id,
          data: { name: groupName.trim() },
        });

        if (result.success) {
          onGroupCreated();
          onClose();
        } else {
          setError(result.error || "Failed to update group");
        }
      } else {
        // Create new group
        const result = await window.electron.ipcRenderer.invoke("create-account-group", {
          name: groupName.trim(),
          accountType: accountType,
        });

        if (result.success) {
          onGroupCreated();
          onClose();
        } else {
          setError(result.error || "Failed to create group");
        }
      }
    } catch (err: any) {
      console.error("Error saving group:", err);
      setError("An error occurred while saving the group");
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    // Reset form state
    setGroupName("");
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
          {editingGroup ? "Edit Group" : "Create New Group"}
        </h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="groupName"
              className="block text-sm font-medium text-gray-700"
            >
              Group Name
            </label>
            <input
              type="text"
              id="groupName"
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
              required
              placeholder="e.g., Bank Accounts, Credit Cards"
            />
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
              ? (editingGroup ? "Updating..." : "Creating...") 
              : (editingGroup ? "Update Group" : "Create Group")}
          </button>
        </form>
      </div>
    </div>
  );
};
