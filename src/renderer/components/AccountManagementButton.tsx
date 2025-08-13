import React from "react";
import { useNavigate } from "react-router-dom";

const AccountManagementButton: React.FC = () => {
  const navigate = useNavigate();
  return (
    <button
      className="w-full mt-4 py-2 px-4 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition"
      onClick={() => navigate("/accounts/manage")}
      data-testid="account-management-button"
    >
      Manage Accounts
    </button>
  );
};

export default AccountManagementButton;