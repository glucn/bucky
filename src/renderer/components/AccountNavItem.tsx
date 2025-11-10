import React, { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Account } from "../types";

type Props = {
  account: Account;
  selected: boolean;
  balance?: number;
};

interface CreditCardMetrics {
  availableCredit: number;
  creditUtilization: number;
}

const AccountNavItem: React.FC<Props> = ({ account, selected, balance }) => {
  const navigate = useNavigate();
  const [creditCardMetrics, setCreditCardMetrics] = useState<CreditCardMetrics | null>(null);
  const [isCreditCard, setIsCreditCard] = useState(false);

  useEffect(() => {
    // Check if this account has credit card properties
    checkIfCreditCard();
  }, [account.id]);

  const checkIfCreditCard = async () => {
    try {
      const result = await window.electron.ipcRenderer.invoke(
        "get-credit-card-properties",
        account.id
      );
      if (result.success && result.properties) {
        setIsCreditCard(true);
        fetchCreditCardMetrics();
      } else {
        setIsCreditCard(false);
      }
    } catch (err) {
      setIsCreditCard(false);
    }
  };

  const fetchCreditCardMetrics = async () => {
    try {
      const result = await window.electron.ipcRenderer.invoke(
        "get-credit-card-metrics",
        account.id
      );
      if (result.success) {
        setCreditCardMetrics({
          availableCredit: result.metrics.availableCredit,
          creditUtilization: result.metrics.creditUtilization,
        });
      }
    } catch (err) {
      console.error("Failed to fetch credit card metrics", err);
    }
  };

  const handleClick = () => {
    navigate(`/accounts/${account.id}/transactions`);
  };

  const getUtilizationColor = (utilization: number) => {
    if (utilization >= 90) return "text-red-600";
    if (utilization >= 70) return "text-yellow-600";
    return "text-green-600";
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
        {typeof balance === "number" && !isCreditCard && (
          <span className="text-sm text-gray-600">
            {balance.toLocaleString(undefined, { style: "currency", currency: account.currency })}
          </span>
        )}
      </div>
      
      {/* Credit Card Specific Display */}
      {isCreditCard && creditCardMetrics && (
        <div className="mt-1 text-xs space-y-1">
          <div className="flex justify-between">
            <span className="text-gray-600">Balance:</span>
            <span className="font-medium">
              {typeof balance === "number" 
                ? Math.abs(balance).toLocaleString(undefined, { style: "currency", currency: account.currency })
                : "$0.00"}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">Available:</span>
            <span className="font-medium text-blue-600">
              {creditCardMetrics.availableCredit.toLocaleString(undefined, { 
                style: "currency", 
                currency: account.currency 
              })}
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-gray-600">Utilization:</span>
            <span className={`font-medium ${getUtilizationColor(creditCardMetrics.creditUtilization)}`}>
              {creditCardMetrics.creditUtilization.toFixed(0)}%
            </span>
          </div>
        </div>
      )}
    </div>
  );
};

export default AccountNavItem;