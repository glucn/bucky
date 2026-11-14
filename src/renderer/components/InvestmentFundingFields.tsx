import React from "react";
import type { FundingAccount } from "../../shared/investmentFunding";

export function InvestmentFundingFields({ accounts, otherId, onOtherChange, cashCurrency, amount, counterAmount, onCounterAmountChange, withdrawal, disabled }: {
  accounts: FundingAccount[]; otherId: string; onOtherChange: (id: string) => void; cashCurrency?: string;
  amount: string; counterAmount: string; onCounterAmountChange: (amount: string) => void; withdrawal: boolean; disabled: boolean;
}) {
  const other = accounts.find((account) => account.id === otherId), isFx = !!other && !!cashCurrency && other.currency !== cashCurrency;
  const rate = withdrawal ? Number(counterAmount) / Number(amount) : Number(amount) / Number(counterAmount);
  return <>
    <div><label htmlFor="funding-other" className="block text-sm font-medium mb-1">Other account</label>
      <select id="funding-other" className="w-full border rounded-md p-2" value={otherId} onChange={(event) => onOtherChange(event.target.value)} disabled={disabled} required>
        <option value="">Select other account</option>{accounts.map((account) => <option key={account.id} value={account.id}>{account.name} · {account.currency}{account.groupName ? ` · ${account.groupName}` : ""}{account.subtype === "liability" ? " · Liability" : ""}</option>)}
      </select>
      <p className="text-sm text-gray-600 mt-1">{withdrawal ? "Money moves from portfolio cash to the other account." : "Money moves from the other account into portfolio cash."}</p>
    </div>
    {isFx ? <div><label htmlFor="funding-counter-amount" className="block text-sm font-medium mb-1">Other account amount ({other!.currency}) *</label>
      <input id="funding-counter-amount" className="w-full border rounded-md p-2" type="number" step="0.01" min="0.01" value={counterAmount} onChange={(event) => onCounterAmountChange(event.target.value)} disabled={disabled} required />
      <p className="text-sm text-gray-600 mt-1">Enter the actual amounts on both accounts. Include any currency conversion spread in those amounts.</p>
      {Number(amount) > 0 && Number(counterAmount) > 0 && Number.isFinite(rate) && rate > 0 ? <p className="text-sm text-gray-600">Implied rate: 1 {withdrawal ? cashCurrency : other!.currency} = {new Intl.NumberFormat("en-US", { maximumSignificantDigits: 10 }).format(rate)} {withdrawal ? other!.currency : cashCurrency}</p> : null}
    </div> : null}
  </>;
}
