import React from "react";
import { useNavigate } from "react-router-dom";
import { Account } from "../types";
import { formatCurrencyAmountDetail } from "../utils/currencyUtils";

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
      <div className="flex justify-between items-start">
        <span>{account.name}</span>
        {typeof balance === "number" && (
          <span className="text-sm text-gray-600">
            {formatCurrencyAmountDetail(balance, account.currency)}
          </span>
        )}
      </div>
    </div>
  );
};

export default AccountNavItem;
