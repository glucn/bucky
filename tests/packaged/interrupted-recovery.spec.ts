import { test, expect } from "@playwright/test";
import fs from "fs/promises";
import path from "path";
import { personalAppHarness } from "./launchPersonalApp";
import { ProtectedProfileSetup, readProtectedProfile } from "../../src/services/protectedProfiles";
import { unlockWithRecovery, unlockWithPassphrase } from "../../src/services/profileKeys";
import { createEncryptedPrisma } from "../../src/services/encryptedDatabase";
import { selectProtectedProfile } from "../../src/services/protectedRestore";
import { AccountType, AccountSubtype } from "../../src/shared/accountTypes";

test("packaged interrupted recovery requires fresh confirmation and reopens the recovered records", async () => {
  const app = await personalAppHarness(), migrations = path.resolve("prisma/migrations");
  const sourcePassphrase = "Synthetic interrupted source passphrase";
  const replacement = "Synthetic recovered profile passphrase";
  let selectionKey: Buffer | undefined;
  try {
    const setup = new ProtectedProfileSetup(app.directory, migrations);
    const pending = await setup.begin({ baseCurrency: "CAD", passphrase: sourcePassphrase });
    await setup.confirm(pending.setupId, pending.recoverySecret);
    const original = await readProtectedProfile(app.directory);
    const key = unlockWithRecovery(original.envelope, pending.recoverySecret, "default");
    const fixture = createEncryptedPrisma(original.databaseFile, key);
    try {
      await fixture.account.createMany({ data: [
        { id: "interrupted-cash", name: "Synthetic interrupted cash", type: AccountType.User, subtype: AccountSubtype.Asset, currency: "CAD" },
        { id: "interrupted-equity", name: "Synthetic interrupted equity", type: AccountType.System, subtype: AccountSubtype.Asset, currency: "CAD" },
      ] });
      await fixture.journalEntry.create({ data: { id: "interrupted-posting", date: "2026-09-01", description: "Synthetic posting", lines: { create: [
        { accountId: "interrupted-cash", amount: 654.32, currency: "CAD" },
        { accountId: "interrupted-equity", amount: -654.32, currency: "CAD" },
      ] } } });
    } finally { await fixture.$disconnect(); key.fill(0); }
    // Simulate retained staging after interruption. No installed-app test bypass is added.
    const artifactId = ".creating-default-packaged";
    const source = path.join(app.directory, "profiles", artifactId);
    await fs.rename(path.dirname(original.databaseFile), source);
    await fs.mkdir(path.join(app.directory, "profiles", ".setup-default.lock"));
    const before = await fs.readFile(path.join(source, "book.sqlite"));
    const keysBefore = await fs.readFile(path.join(source, "profile.keys.json"));
    const page = await app.launch();
    await expect(page.getByRole("heading", { name: "Recovery required" })).toBeVisible();
    await page.getByRole("button", { name: "Encrypted backup recovery" }).click();
    await expect(page.getByTestId("interrupted-artifacts")).toBeVisible({ timeout: 5000 });
    await expect(page.getByRole("button", { name: "Preserve unfinished setup files" })).toBeVisible();
    await page.getByLabel("Recovery source").selectOption("interrupted");
    await page.getByRole("combobox", { name: "Interrupted snapshot", exact: true }).selectOption(artifactId);
    await page.getByLabel("Interrupted profile credential", { exact: true }).fill(pending.recoverySecret);
    await page.getByLabel("New profile protection").selectOption("passphrase");
    await page.getByLabel("New passphrase", { exact: true }).fill(replacement);
    await page.getByLabel("Repeat new passphrase").fill(replacement);
    await page.getByLabel(/I understand this interrupted snapshot may be incomplete/).check();
    await page.getByRole("button", { name: "Verify interrupted snapshot" }).click();
    const freshCode = await page.getByTestId("restore-recovery-code").innerText();
    expect(freshCode).not.toBe(pending.recoverySecret);
    await page.getByLabel("Re-enter new recovery code").fill(pending.recoverySecret);
    await page.getByRole("button", { name: "Confirm and publish restored profile" }).click();
    await expect(page.getByRole("alert")).toContainText("Unable to confirm recovery");
    await page.getByLabel("Re-enter new recovery code").fill(freshCode);
    await page.getByRole("button", { name: "Confirm and publish restored profile" }).click();
    await expect(page.getByTestId("protected-recovery-result")).toBeVisible();
    await expect(page.getByTestId("restore-recovery-code")).toHaveCount(0);
    await expect(page.getByTestId("protected-recovery-page")).toHaveAttribute("aria-busy", "false");
    const state = await page.evaluate(() => (window as any).electron.protectedRecovery.getState());
    expect(state.profiles).toHaveLength(1); expect(state.nextProfile).toBe("default");
    const profileId = state.profiles[0].id;
    expect(await fs.readFile(path.join(source, "book.sqlite"))).toEqual(before);
    expect(await fs.readFile(path.join(source, "profile.keys.json"))).toEqual(keysBefore);
    await page.screenshot({ path: test.info().outputPath("recovered-interrupted-snapshot.png"), fullPage: true });
    await app.stop();

    // Selection uses the real trusted service in the fixture. Actual native selection consent
    // is still a separate manual acceptance gate; restart/unlock use the shipped app UI.
    const restored = await readProtectedProfile(app.directory, profileId);
    selectionKey = await unlockWithPassphrase(restored.envelope, replacement, profileId);
    await selectProtectedProfile(app.directory, profileId, selectionKey, migrations);
    selectionKey.fill(0); selectionKey = undefined;
    const reopened = await app.launch();
    await expect(reopened.getByRole("heading", { name: "Unlock Bucky" })).toBeVisible();
    await reopened.getByLabel("Authentication method").selectOption("passphrase");
    await reopened.getByLabel("Passphrase", { exact: true }).fill(replacement);
    await reopened.getByRole("button", { name: "Unlock", exact: true }).click();
    await expect(reopened.getByRole("link", { name: "Accounts", exact: true }).first()).toBeVisible();
    expect(await reopened.evaluate(() => (window as any).electron.ipcRenderer.invoke("get-account-balance", "interrupted-cash")))
      .toEqual({ success: true, balance: 654.32 });
    await app.stop();
    expect(await fs.readFile(path.join(source, "book.sqlite"))).toEqual(before);
    for (const secret of [sourcePassphrase, replacement, pending.recoverySecret, freshCode]) expect(app.output()).not.toContain(secret);
  } catch (error) {
    await test.info().attach("interrupted-recovery.log", { body: app.output(), contentType: "text/plain" });
    throw error;
  } finally { selectionKey?.fill(0); await app.dispose(); }
});
