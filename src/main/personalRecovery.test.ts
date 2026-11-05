import { afterEach, beforeEach, expect, it, vi } from "vitest";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { PersonalRecovery } from "./personalRecovery";
import { ProtectedProfileSetup, readProtectedProfile } from "../services/protectedProfiles";
import { readActiveProfile } from "../services/personalProfiles";
import type { SecurityStatus } from "../shared/security";
import { initializePersonalDatabase } from "../services/localDatabase";

const migrations = path.resolve("prisma/migrations");
const passphrase = "Personal recovery test passphrase";
const keychain = { isAvailable: () => true, encryptString: async (v: string) => Buffer.from(v), decryptString: async (v: Buffer) => v.toString() };
let directory: string;
let recovery: PersonalRecovery;
let status: SecurityStatus;
let deps: any;
beforeEach(async () => {
  directory = await fs.mkdtemp(path.join(os.tmpdir(), "bucky-main-recovery-"));
  const setup = new ProtectedProfileSetup(directory, migrations);
  const pending = await setup.begin({ baseCurrency: "CAD", keychain, passphrase });
  await setup.confirm(pending.setupId, pending.recoverySecret);
  status = "unlocked";
  deps = { getStatus: () => status, getActiveProfile: () => "default", keychain,
    osAuthenticationAvailable: () => true, authenticateOS: vi.fn(async () => {}),
    chooseBackupDirectory: vi.fn(async () => directory), chooseBackupFile: vi.fn(), chooseLegacyFile: vi.fn(),
    confirmSelection: vi.fn(async () => true), now: () => Date.now() };
  recovery = new PersonalRecovery(directory, migrations, deps);
});
afterEach(async () => { await recovery?.cancel(); await fs.rm(directory, { recursive: true, force: true }); });

it("exports only while unlocked after fresh authentication, and returns no key metadata", async () => {
  status = "locked";
  await expect(recovery.createBackup({ mode: "keychain" })).rejects.toThrow(/unlocked/i);
  expect(deps.chooseBackupDirectory).not.toHaveBeenCalled();
  status = "unlocked";
  deps.authenticateOS.mockRejectedValueOnce(new Error("private OS error"));
  await expect(recovery.createBackup({ mode: "keychain" })).rejects.toThrow(/authenticate/i);
  expect(deps.chooseBackupDirectory).not.toHaveBeenCalled();
  deps.now = () => Date.now() + 60_000;
  const result = await recovery.createBackup({ mode: "keychain" });
  expect(deps.authenticateOS).toHaveBeenCalledTimes(2);
  expect(result?.path).toMatch(/\.buckybackup$/);
  expect((await fs.readFile(result!.path)).subarray(0, 8).toString()).toBe("BUCKYBK1");
  expect(JSON.stringify(result)).not.toMatch(/dataKey|envelope|recoverySecret/);
});

it("restores while locked with fresh credentials, confirms recovery, and selects only after target authentication and native consent", async () => {
  const backup = await recovery.createBackup({ mode: "passphrase", passphrase });
  deps.chooseBackupFile.mockResolvedValue(backup!.path);
  status = "locked";
  const pending = await recovery.beginRestore({ credential: { mode: "passphrase", secret: passphrase },
    protection: { mode: "passphrase", passphrase, passphraseConfirmation: passphrase } });
  expect(readActiveProfile(directory)).toBe("default");
  await expect(readProtectedProfile(directory, pending!.profileId)).rejects.toThrow();
  await expect(recovery.confirmRestore({ restoreId: pending!.restoreId, recoverySecret: "wrong" })).rejects.toThrow(/recovery/i);
  const restored = await recovery.confirmRestore({ restoreId: pending!.restoreId, recoverySecret: pending!.recoverySecret });
  expect(readActiveProfile(directory)).toBe("default");
  deps.confirmSelection.mockResolvedValueOnce(false);
  expect(await recovery.selectProfile({ profileId: restored.profileId, authentication: { mode: "passphrase", passphrase } })).toBe(false);
  expect(readActiveProfile(directory)).toBe("default");
  expect(await recovery.selectProfile({ profileId: restored.profileId, authentication: { mode: "passphrase", passphrase } })).toBe(true);
  expect(readActiveProfile(directory)).toBe(restored.profileId);
  expect(deps.confirmSelection).toHaveBeenCalledWith(restored.profileId);
  const state = await recovery.getState();
  expect(state.activeProfile).toBe("default");
  expect(state.nextProfile).toBe(restored.profileId);
});

it("revokes delayed authentication immediately and drains it before accepting new work", async () => {
  let finish!: () => void;
  deps.authenticateOS.mockImplementationOnce(() => new Promise<void>((resolve) => { finish = resolve; }));
  const operation = recovery.createBackup({ mode: "keychain" });
  const rejected = expect(operation).rejects.toThrow(/cancel|lock/i);
  await vi.waitFor(() => expect(finish).toBeDefined());
  status = "locking";
  const canceled = recovery.cancel();
  await expect(recovery.getState()).rejects.toThrow();
  finish(); await rejected; await canceled;
  expect(deps.chooseBackupDirectory).not.toHaveBeenCalled();
  status = "locked";
  expect((await recovery.getState()).profiles).toEqual([{ id: "default" }]);
});

it("ignores a late native selection confirmation after lock", async () => {
  let finish!: (value: boolean) => void;
  deps.confirmSelection.mockImplementationOnce(() => new Promise<boolean>((resolve) => { finish = resolve; }));
  const operation = recovery.selectProfile({ profileId: "default", authentication: { mode: "keychain" } });
  const rejected = expect(operation).rejects.toThrow(/cancel|lock/i);
  await vi.waitFor(() => expect(finish).toBeDefined());
  status = "locking";
  const canceled = recovery.cancel();
  finish(true); await rejected; await canceled;
  await expect(fs.stat(path.join(directory, "active-profile.json"))).rejects.toThrow();
});

it("validates renderer inputs before native dialogs or cryptographic work", async () => {
  await expect(recovery.createBackup({ mode: "keychain", source: "/private/file" } as any)).rejects.toThrow(/input/i);
  await expect(recovery.beginRestore({ credential: { mode: "recovery", secret: "code" },
    protection: { mode: "passphrase", passphrase, passphraseConfirmation: "different" } })).rejects.toThrow(/match/i);
  await expect(recovery.selectProfile({ profileId: "../default", authentication: { mode: "keychain" } })).rejects.toThrow(/profile/i);
  expect(deps.authenticateOS).not.toHaveBeenCalled();
  expect(deps.chooseBackupFile).not.toHaveBeenCalled();
  expect(deps.chooseBackupDirectory).not.toHaveBeenCalled();
});

it("cancels pending restoration before another session and never returns a late recovery code", async () => {
  const backup = await recovery.createBackup({ mode: "passphrase", passphrase });
  deps.chooseBackupFile.mockResolvedValue(backup!.path);
  const pending = await recovery.beginRestore({ credential: { mode: "passphrase", secret: passphrase },
    protection: { mode: "keychain" } });
  await recovery.cancel();
  await expect(recovery.confirmRestore({ restoreId: pending!.restoreId, recoverySecret: pending!.recoverySecret })).rejects.toThrow(/pending|matching/i);
  expect((await fs.readdir(path.join(directory, "profiles"))).filter((name) => name.startsWith(".restoring-"))).toEqual([]);
  expect((await recovery.getState()).profiles).toEqual([{ id: "default" }]);
});

it("converts a natively chosen plaintext book while recovery is required, preserving the source until explicit selection", async () => {
  const source = path.join(directory, "legacy.sqlite"); await initializePersonalDatabase(source, migrations);
  const before = await fs.readFile(source); deps.chooseLegacyFile.mockResolvedValue(source); status = "recovery-required";
  const protection = { mode: "passphrase" as const, passphrase, passphraseConfirmation: passphrase };
  await expect(recovery.beginLegacy({ acknowledgePlaintext: false, protection })).rejects.toThrow(/acknowledge/i);
  expect(deps.chooseLegacyFile).not.toHaveBeenCalled();
  const pending = await recovery.beginLegacy({ acknowledgePlaintext: true, protection });
  expect(pending!.profileId).toMatch(/^restored-/);
  expect(readActiveProfile(directory)).toBe("default");
  await expect(readProtectedProfile(directory, pending!.profileId)).rejects.toThrow();
  await recovery.confirmRestore({ restoreId: pending!.restoreId, recoverySecret: pending!.recoverySecret });
  expect((await readProtectedProfile(directory, pending!.profileId)).envelope.passphrase).toBeDefined();
  expect(await fs.readFile(source)).toEqual(before); expect(readActiveProfile(directory)).toBe("default");
});

it("cancels a late legacy picker result before reading the source or generating recovery material", async () => {
  let finish!: (source: string) => void;
  deps.chooseLegacyFile.mockImplementationOnce(() => new Promise<string>((resolve) => { finish = resolve; }));
  const operation = recovery.beginLegacy({ acknowledgePlaintext: true, protection: { mode: "keychain" } });
  const rejected = expect(operation).rejects.toThrow(/cancel|lock/i);
  await vi.waitFor(() => expect(finish).toBeDefined());
  status = "locking"; const canceled = recovery.cancel(); finish(path.join(directory, "not-read.sqlite"));
  await rejected; await canceled;
  expect(deps.authenticateOS).not.toHaveBeenCalled();
  expect(await fs.readdir(path.join(directory, "profiles"))).toEqual(["default"]);
});

it("rejects renderer-provided conversion paths and denied OS protection without changing books", async () => {
  await expect(recovery.beginLegacy({ acknowledgePlaintext: true, source: "/private/file", protection: { mode: "keychain" } } as any)).rejects.toThrow(/input/i);
  expect(deps.chooseLegacyFile).not.toHaveBeenCalled();
  deps.chooseLegacyFile.mockResolvedValue(path.join(directory, "not-read.sqlite"));
  deps.authenticateOS.mockRejectedValueOnce(new Error("Private OS error"));
  await expect(recovery.beginLegacy({ acknowledgePlaintext: true, protection: { mode: "keychain" } })).rejects.toThrow(/authenticate/i);
  expect(await fs.readdir(path.join(directory, "profiles"))).toEqual(["default"]);
});

it("inventories and recovers an interrupted snapshot through fresh confirmation without automatically selecting it", async () => {
  const artifactId = ".creating-default-interrupted";
  await fs.cp(path.join(directory, "profiles", "default"), path.join(directory, "profiles", artifactId), { recursive: true });
  status = "recovery-required";
  expect((await recovery.getState()).interruptedArtifacts).toContainEqual({ id: artifactId, kind: "setup", canAttemptRecovery: true, profileId: "default" });
  const protection = { mode: "passphrase" as const, passphrase, passphraseConfirmation: passphrase };
  await expect(recovery.beginInterrupted({ artifactId, protection, credential: { mode: "passphrase", secret: passphrase }, acknowledgeSnapshot: false })).rejects.toThrow(/acknowledge/i);
  const pending = await recovery.beginInterrupted({ artifactId, protection, credential: { mode: "passphrase", secret: passphrase }, acknowledgeSnapshot: true });
  await recovery.confirmRestore({ restoreId: pending!.restoreId, recoverySecret: pending!.recoverySecret });
  expect(readActiveProfile(directory)).toBe("default");
  expect((await recovery.getState()).profiles).toContainEqual({ id: pending!.profileId });
  expect((await recovery.getState()).unfinishedSetupIds).toEqual([]); // A default book exists.
});

it("offers setup preservation only for unpublished setup and rejects interrupted recovery while security maintenance owns the session", async () => {
  const artifactId = ".creating-default-interrupted";
  await fs.rename(path.join(directory, "profiles", "default"), path.join(directory, "profiles", artifactId));
  await fs.mkdir(path.join(directory, "profiles", ".setup-default.lock")); status = "recovery-required";
  expect((await recovery.getState()).unfinishedSetupIds).toEqual([artifactId, ".setup-default.lock"]);
  status = "recovering";
  await expect(recovery.beginInterrupted({ artifactId, protection: { mode: "keychain" }, credential: { mode: "passphrase", secret: passphrase }, acknowledgeSnapshot: true })).rejects.toThrow(/operation|lock/i);
  expect(deps.authenticateOS).not.toHaveBeenCalled();
});
