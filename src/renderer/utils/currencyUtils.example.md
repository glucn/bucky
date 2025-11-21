# Currency Utilities - Usage Examples

This file demonstrates how to use the currency utility functions for formatting multi-currency balances.

## Basic Usage

### Format a single currency amount

```typescript
import { formatCurrencyAmount } from './currencyUtils';

// With symbol (default)
formatCurrencyAmount(1234.56, 'USD');
// Returns: "$1,234.56"

formatCurrencyAmount(1234.56, 'EUR');
// Returns: "€1,234.56"

// Without symbol, with code
formatCurrencyAmount(1234.56, 'JPY', { showSymbol: false, showCode: true });
// Returns: "1,234.56 JPY"
```

### Format multi-currency balances

```typescript
import { formatMultiCurrencyBalances } from './currencyUtils';

const balances = {
  USD: 1234.56,
  EUR: 500.00,
  CAD: 300.00
};

formatMultiCurrencyBalances(balances);
// Returns: "$1,234.56, €500.00, CA$300.00"

// Custom separator
formatMultiCurrencyBalances(balances, { separator: ' | ' });
// Returns: "$1,234.56 | €500.00 | CA$300.00"
```

### Format account balance (with fallback)

```typescript
import { formatAccountBalance } from './currencyUtils';

// With multi-currency balances
const category = {
  balance: 1000,
  currency: 'USD',
  balances: { USD: 500, CAD: 300 }
};

formatAccountBalance(category.balance, category.currency, category.balances);
// Returns: "$500.00, CA$300.00"

// Without multi-currency balances (fallback)
formatAccountBalance(1000, 'USD');
// Returns: "$1,000.00"
```

### Format transaction currency

```typescript
import { formatTransactionCurrency } from './currencyUtils';

formatTransactionCurrency(1234.56, 'USD');
// Returns: "1,234.56 USD"

formatTransactionCurrency(-500.00, 'EUR');
// Returns: "-500.00 EUR"
```

### Group balances by currency

```typescript
import { groupBalancesByCurrency } from './currencyUtils';

const transactions = [
  { amount: 100, currency: 'USD' },
  { amount: 200, currency: 'USD' },
  { amount: 50, currency: 'EUR' }
];

const grouped = groupBalancesByCurrency(
  transactions,
  (t) => t.currency,
  (t) => t.amount
);
// Returns: { USD: 300, EUR: 50 }
```

## Integration Examples

### In Categories Page

```typescript
const formatBalances = (category: CategoryWithBalances): string => {
  return formatAccountBalance(
    category.balance || 0,
    category.currency,
    category.balances
  );
};
```

### In Transaction Display

```typescript
<td>
  {formatTransactionCurrency(line.amount, line.account.currency)}
</td>
```

## Supported Currencies

The utility includes symbols for common currencies:
- USD ($), EUR (€), GBP (£), JPY (¥), CNY (¥)
- CAD (CA$), AUD (A$), CHF (CHF)
- INR (₹), KRW (₩), BRL (R$), MXN (MX$)
- RUB (₽), ZAR (R), SEK/NOK/DKK (kr)
- PLN (zł), TRY (₺), THB (฿)

For currencies without a defined symbol, the currency code is used instead.
