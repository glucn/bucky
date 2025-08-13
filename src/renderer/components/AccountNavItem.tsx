import React from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Account } from "../types";

type Props = {
  account: Account;
  selected: boolean;
  balance?: number;
};

const AccountNavItem: React.FC<Props> = ({ account, selected, balance }) => {
  const navigate = useNavigate();
  const handleClick = () => {
    navigate(`/accounts/${account.id}/transactions`);
  };

  return (
    <div
      className={`cursor-pointer px-4 py-2 rounded-md mb-1 ${
        selected ? "bg-blue-100 text-blue-700 font-semibold" : "hover:bg-gray-200"
      }`}
      onClick={handleClick}
      data-testid={`account-nav-item-${account.id}`}
    >
      <span>{account.name}</span>
      {typeof balance === "number" && (
        <span className="float-right text-sm text-gray-600">
          {balance.toLocaleString(undefined, { style: "currency", currency: account.currency })}
        </span>
      )}
    </div>
  );
};

export default AccountNavItem;