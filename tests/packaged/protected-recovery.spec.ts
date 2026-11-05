import { test, expect } from "@playwright/test";
import path from "path";
import { personalAppHarness } from "./launchPersonalApp";
import { ProtectedProfileSetup } from "../../src/services/protectedProfiles";
import { initializePersonalDatabase } from "../../src/services/localDatabase";
import fs from "fs/promises";

test("packaged encrypted recovery is available before unlock and backup is available after authentication", async () => {
  const app = await personalAppHarness();
  const passphrase = "Synthetic recovery navigation passphrase";
  try {
    const setup = new ProtectedProfileSetup(app.directory, path.resolve("prisma/migrations"));
    const pending = await setup.begin({ baseCurrency: "CAD", passphrase });
    await setup.confirm(pending.setupId, pending.recoverySecret);
    const page = await app.launch();
    await page.getByRole("button", { name: "Encrypted backup recovery" }).click();
    await expect(page.getByTestId("protected-recovery-page")).toBeVisible();
    await expect(page.getByRole("button", { name: "Choose encrypted backup and verify" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Create encrypted backup" })).toHaveCount(0);
    expect(await page.evaluate(async () => {
      try { await (window as any).electron.ipcRenderer.invoke("get-accounts"); return "unexpected success"; }
      catch (error) { return String(error); }
    })).toMatch(/locked/i);
    await expect(page.getByText(/Current profile:/)).toBeVisible();
    await page.screenshot({ path: test.info().outputPath("locked-recovery.png") });
    await page.getByRole("button", { name: "Back to unlock" }).click();
    await page.getByLabel("Authentication method").selectOption("passphrase");
    await page.getByLabel("Passphrase", { exact: true }).fill(passphrase);
    await page.getByRole("button", { name: "Unlock", exact: true }).click();
    await page.getByRole("link", { name: "Backup & recovery" }).click();
    await expect(page.getByRole("button", { name: "Create encrypted backup" })).toBeVisible();
    await expect(page.getByText(/Current profile:/)).toBeVisible();
    await page.screenshot({ path: test.info().outputPath("unlocked-recovery.png") });
    await app.stop();
  } catch (error) {
    await test.info().attach("packaged-recovery.log", { body: app.output(), contentType: "text/plain" });
    throw error;
  } finally { await app.dispose(); }
});

test("packaged legacy recovery requires plaintext acknowledgement and preserves the source before conversion", async () => {
  const app = await personalAppHarness();
  try {
    const source = path.join(app.directory, "profiles/default/book.sqlite");
    await initializePersonalDatabase(source, path.resolve("prisma/migrations"));
    const before = await fs.readFile(source);
    const page = await app.launch();
    await expect(page.getByRole("heading", { name: "Recovery required" })).toBeVisible();
    await page.getByRole("button", { name: "Encrypted backup recovery" }).click();
    await expect(page.getByLabel("Recovery source")).toBeVisible({ timeout: 5000 });
    await page.getByLabel("Recovery source").selectOption("legacy");
    await expect(page.getByLabel("Backup credential", { exact: true })).toHaveCount(0);
    const convert = page.getByRole("button", { name: "Choose legacy book and convert" });
    await expect(convert).toBeDisabled();
    await page.getByLabel("New profile protection").selectOption("passphrase");
    await page.getByLabel("New passphrase", { exact: true }).fill("Synthetic converted profile passphrase");
    await page.getByLabel("Repeat new passphrase").fill("Synthetic converted profile passphrase");
    await page.getByLabel(/I understand the original book and existing copies remain plaintext/).check();
    await expect(convert).toBeEnabled();
    await page.screenshot({ path: test.info().outputPath("legacy-conversion.png") });
    expect(await fs.readFile(source)).toEqual(before);
    expect(await fs.readdir(path.join(app.directory, "profiles"))).toEqual(["default"]);
    await page.getByRole("button", { name: "Back to unlock" }).click();
    await expect(page.getByRole("heading", { name: "Recovery required" })).toBeVisible();
    expect(await fs.readFile(source)).toEqual(before);
    await app.stop();
  } catch (error) {
    await test.info().attach("packaged-conversion.log", { body: app.output(), contentType: "text/plain" });
    throw error;
  } finally { await app.dispose(); }
});
