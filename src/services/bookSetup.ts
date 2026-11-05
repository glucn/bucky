import { databaseService } from "./database";
import { SUPPORTED_CURRENCY_OPTIONS } from "../shared/currencies";

function configured(raw: string | undefined): boolean {
  try { const value: unknown = JSON.parse(raw ?? "null"); return SUPPORTED_CURRENCY_OPTIONS.some((option) => option.code === value); }
  catch { return false; }
}
let setupInProgress = false;

export const bookSetupService = {
  async getState(): Promise<{ required: boolean }> {
    const setting = await databaseService.prismaClient.appSetting.findUnique({ where: { key: "baseCurrency" } });
    return { required: !configured(setting?.jsonValue) };
  },
  async complete(currency: string): Promise<void> {
    if (!SUPPORTED_CURRENCY_OPTIONS.some((option) => option.code === currency)) throw new Error("Choose a supported base currency");
    if (setupInProgress) throw new Error("Currency setup is already in progress");
    setupInProgress = true;
    try { await databaseService.prismaClient.$transaction(async (tx) => {
      const previous = await tx.appSetting.findUnique({ where: { key: "baseCurrency" } });
      if (configured(previous?.jsonValue)) throw new Error("Base currency setup is already complete; use currency settings to change it");
      const accounts = await tx.account.count(), entries = await tx.journalEntry.count();
      await tx.appSetting.upsert({ where: { key: "baseCurrency" },
        create: { key: "baseCurrency", jsonValue: JSON.stringify(currency) }, update: { jsonValue: JSON.stringify(currency) } });
      // Existing amounts and account currencies are never relabeled or converted by setup.
      if (accounts || entries) {
        const jsonValue = JSON.stringify({ targetBaseCurrency: currency, status: "pending", changedAt: new Date().toISOString() });
        await tx.appSetting.upsert({ where: { key: "baseCurrencyReconciliationState" },
          create: { key: "baseCurrencyReconciliationState", jsonValue }, update: { jsonValue } });
      } else {
        await tx.appSetting.deleteMany({ where: { key: "baseCurrencyReconciliationState" } });
        await databaseService.ensureDefaultAccounts(tx);
      }
    }); } finally { setupInProgress = false; }
  },
};
