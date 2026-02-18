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

  getAllowedBaseCurrencies(): readonly string[] {
    return ALLOWED_BASE_CURRENCIES;
  }
}

export const appSettingsService = new AppSettingsService();
