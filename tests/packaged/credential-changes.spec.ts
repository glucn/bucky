import { test, expect, type Page } from "@playwright/test";
import fs from "fs/promises";
import path from "path";
import { personalAppHarness } from "./launchPersonalApp";
import { ProtectedProfileSetup, readProtectedProfile } from "../../src/services/protectedProfiles";
import { unlockWithPassphrase, unlockWithRecovery } from "../../src/services/profileKeys";

test("packaged credential changes require fresh proof, retain recovery, and survive restart", async () => {
  const app = await personalAppHarness();
  const initial = "Synthetic initial protection passphrase";
  const replacement = "Synthetic replacement protection passphrase";
  const recovered = "Synthetic saved code replacement passphrase";
  const closed = async (page: Page) => {
    expect(await page.evaluate(async () => {
      try { await (window as any).electron.ipcRenderer.invoke("get-accounts"); return false; }
      catch { return true; }
    })).toBe(true);
    await expect(page.getByRole("link", { name: "Accounts", exact: true })).toHaveCount(0);
  };
  try {
    const setup = new ProtectedProfileSetup(app.directory, path.resolve("prisma/migrations"));
    const pending = await setup.begin({ baseCurrency: "CAD", passphrase: initial });
    await setup.confirm(pending.setupId, pending.recoverySecret);
    const original = await readProtectedProfile(app.directory);
    const bookBefore = await fs.readFile(original.databaseFile);
    const page = await app.launch();
    await page.getByRole("button", { name: "Change profile protection", exact: true }).click();
    const form = page.getByTestId("credential-change-page");
    await page.getByLabel("Current passphrase", { exact: true }).fill(initial);
    await page.getByLabel("New passphrase", { exact: true }).fill(replacement);
    await page.getByLabel("Repeat new passphrase").fill(replacement);
    await page.getByRole("button", { name: "Update profile protection" }).click();
    await expect(page.getByRole("status")).toContainText("Profile protection updated");
    await expect(form).toHaveAttribute("aria-busy", "false");
    await closed(page);
    expect(await fs.readFile(original.databaseFile)).toEqual(bookBefore);
    await page.getByRole("button", { name: "Back to unlock" }).click();
    await page.getByLabel("Passphrase", { exact: true }).fill(initial);
    await page.getByRole("button", { name: "Unlock", exact: true }).click();
    await expect(page.getByRole("alert")).toContainText("Unable to unlock");
    await closed(page);
    await app.stop();
    const restarted = await app.launch();
    await restarted.getByLabel("Passphrase", { exact: true }).fill(replacement);
    await restarted.getByRole("button", { name: "Unlock", exact: true }).click();
    await expect(restarted.getByRole("link", { name: "Accounts", exact: true }).first()).toBeVisible();
    await restarted.getByRole("button", { name: "Lock Bucky" }).click().catch(() => {});
    const locked = await app.pageAfter(restarted);
    await locked.getByRole("button", { name: "Change profile protection", exact: true }).click();
    await locked.getByRole("combobox", { name: "Verify current protection", exact: true }).selectOption("recovery");
    await locked.getByLabel("Saved recovery code", { exact: true }).fill(pending.recoverySecret);
    await locked.getByLabel("New passphrase", { exact: true }).fill(recovered);
    await locked.getByLabel("Repeat new passphrase").fill(recovered);
    await locked.getByRole("button", { name: "Update profile protection" }).click();
    await expect(locked.getByRole("status")).toContainText("Profile protection updated");
    await expect(locked.getByTestId("credential-change-page")).toHaveAttribute("aria-busy", "false");
    await closed(locked);
    await locked.screenshot({ path: test.info().outputPath("changed-profile-protection.png"), fullPage: true });
    await app.stop();
    const updated = await readProtectedProfile(app.directory);
    await expect(unlockWithPassphrase(updated.envelope, replacement, "default")).rejects.toThrow();
    const key = await unlockWithPassphrase(updated.envelope, recovered, "default");
    const recoveryKey = unlockWithRecovery(updated.envelope, pending.recoverySecret, "default");
    try { expect(key.equals(recoveryKey)).toBe(true); expect(updated.envelope.recovery).toEqual(original.envelope.recovery); }
    finally { key.fill(0); recoveryKey.fill(0); }
    const final = await app.launch();
    await closed(final);
    await final.getByLabel("Passphrase", { exact: true }).fill(recovered);
    await final.getByRole("button", { name: "Unlock", exact: true }).click();
    await expect(final.getByRole("link", { name: "Accounts", exact: true }).first()).toBeVisible();
    for (const secret of [initial, replacement, recovered, pending.recoverySecret]) expect(app.output()).not.toContain(secret);
  } catch (error) {
    await test.info().attach("packaged-credentials.log", { body: app.output(), contentType: "text/plain" });
    throw error;
  } finally { await app.dispose(); }
});
