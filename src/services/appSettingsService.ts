import { databaseService } from "./database";

type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

const BASE_CURRENCY_PATTERN = /^[A-Z]{3}$/;

export const ALLOWED_BASE_CURRENCIES = [
  "USD",
  "CAD",
  "EUR",
  "GBP",
  "JPY",
  "CNY",
  "HKD",
  "AUD",
] as const;

const ALLOWED_BASE_CURRENCY_SET = new Set<string>(ALLOWED_BASE_CURRENCIES);

const BASE_CURRENCY_RECONCILIATION_KEY = "baseCurrencyReconciliationState";

export type BaseCurrencyReconciliationState = {
  targetBaseCurrency: string;
  status: "pending" | "resolved";
  changedAt: string;
  resolvedAt?: string;
};

const isIsoDateString = (value: string): boolean => {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp);
};

const parseBaseCurrencyReconciliationState = (
  value: JsonValue | null
): BaseCurrencyReconciliationState | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, JsonValue>;
  const targetBaseCurrency = record.targetBaseCurrency;
  const status = record.status;
  const changedAt = record.changedAt;
  const resolvedAt = record.resolvedAt;

  if (typeof targetBaseCurrency !== "string" || !BASE_CURRENCY_PATTERN.test(targetBaseCurrency)) {
    return null;
  }

  if (status !== "pending" && status !== "resolved") {
    return null;
  }

  if (typeof changedAt !== "string" || !isIsoDateString(changedAt)) {
    return null;
  }

  if (resolvedAt !== undefined && (typeof resolvedAt !== "string" || !isIsoDateString(resolvedAt))) {
    return null;
  }

  return {
    targetBaseCurrency,
    status,
    changedAt,
    ...(resolvedAt ? { resolvedAt } : {}),
  };
};

class AppSettingsService {
  async getAppSetting(key: string): Promise<JsonValue | null> {
    const row = await databaseService.prismaClient.appSetting.findUnique({
      where: { key },
    });

    if (!row) {
      return null;
    }

    try {
      return JSON.parse(row.jsonValue) as JsonValue;
    } catch {
      return null;
    }
  }

  async setAppSetting(key: string, value: JsonValue): Promise<void> {
    await databaseService.prismaClient.appSetting.upsert({
      where: { key },
      create: {
        key,
        jsonValue: JSON.stringify(value),
      },
      update: {
        jsonValue: JSON.stringify(value),
      },
    });
  }

  async getBaseCurrencyReconciliationState(): Promise<BaseCurrencyReconciliationState | null> {
    const value = await this.getAppSetting(BASE_CURRENCY_RECONCILIATION_KEY);
    return parseBaseCurrencyReconciliationState(value);
  }

  async setBaseCurrencyReconciliationState(state: BaseCurrencyReconciliationState): Promise<void> {
    const existing = await this.getBaseCurrencyReconciliationState();
    if (existing && JSON.stringify(existing) === JSON.stringify(state)) {
      return;
    }

    await this.setAppSetting(BASE_CURRENCY_RECONCILIATION_KEY, state as unknown as JsonValue);
  }

  async getBaseCurrency(): Promise<string | null> {
    const value = await this.getAppSetting("baseCurrency");

    if (typeof value !== "string") {
      return null;
    }

    if (!BASE_CURRENCY_PATTERN.test(value)) {
      return null;
    }

    if (!ALLOWED_BASE_CURRENCY_SET.has(value)) {
      return null;
    }

    return value;
  }

  async setBaseCurrency(nextBaseCurrency: string): Promise<void> {
    if (!BASE_CURRENCY_PATTERN.test(nextBaseCurrency) || !ALLOWED_BASE_CURRENCY_SET.has(nextBaseCurrency)) {
      throw new Error(`Unsupported base currency: ${nextBaseCurrency}`);
    }

    const currentBaseCurrency = await this.getBaseCurrency();
    if (currentBaseCurrency === nextBaseCurrency) {
      return;
    }

    await this.setAppSetting("baseCurrency", nextBaseCurrency);
    await this.setBaseCurrencyReconciliationState({
      targetBaseCurrency: nextBaseCurrency,
      status: "pending",
      changedAt: new Date().toISOString(),
    });
  }

  getAllowedBaseCurrencies(): readonly string[] {
    return ALLOWED_BASE_CURRENCIES;
  }
}

export const appSettingsService = new AppSettingsService();
