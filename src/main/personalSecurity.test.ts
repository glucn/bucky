import { afterEach, beforeEach, expect, it, vi } from "vitest";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { PersonalSecurity } from "./personalSecurity";
import { ProtectedProfileSetup } from "../services/protectedProfiles";
import * as interruptedProfiles from "../services/interruptedProfiles";
import { readProtectedProfile } from "../services/protectedProfiles";

const keychain = { isAvailable: () => true, encryptString: async (v: string) => Buffer.from(v), decryptString: async (v: Buffer) => v.toString() };
const migrations = path.resolve("prisma/migrations");
let directory: string;
let security: PersonalSecurity;
let deps: any;
beforeEach(async () => {
  directory = await fs.mkdtemp(path.join(os.tmpdir(), "bucky-lock-"));
  deps = { keychain, osAuthenticationAvailable: () => true, authenticateOS: vi.fn(async () => {}),
    database: { openEncryptedDatabase: vi.fn(async () => {}), disconnect: vi.fn(async () => {}) },
    enrichment: { suspendForLock: vi.fn(async () => {}), resumeAfterUnlock: vi.fn() },
    cancelRecovery: vi.fn(async () => {}), confirmPreserveSetup: vi.fn(async () => true),
    confirmCredentialRepair: vi.fn(async () => true),
    onRevoked: vi.fn(), onStateChanged: vi.fn(), now: () => Date.now() };
  security = new PersonalSecurity(directory, migrations, deps);
});
afterEach(async () => {
  deps.cancelRecovery.mockReset().mockResolvedValue(undefined);
  vi.restoreAllMocks(); await security.lock(); await fs.rm(directory, { recursive: true, force: true });
});
async function existing(passphrase?: string) {
  const setup = new ProtectedProfileSetup(directory, migrations);
  const pending = await setup.begin({ baseCurrency: "CAD", keychain, ...(passphrase ? { passphrase } : {}) });
  await setup.confirm(pending.setupId, pending.recoverySecret);
  await security.initialize();
  return pending.recoverySecret;
}

it("starts without opening or seeding a book, denies financial work, and rejects malformed setup input", async () => {
  await security.initialize();
  expect(security.getState().status).toBe("setup-required");
  const data = vi.fn();
  await expect(security.runData(data)).rejects.toThrow(/locked/i);
  expect(data).not.toHaveBeenCalled();
  expect(deps.database.openEncryptedDatabase).not.toHaveBeenCalled();
  await expect(security.beginSetup({ baseCurrency: "CAD", mode: "passphrase", passphrase: "test passphrase", passphraseConfirmation: "different" })).rejects.toThrow(/match/i);
  await expect(security.beginSetup({ baseCurrency: "CAD", mode: "passphrase", passphrase: "test passphrase", passphraseConfirmation: "test passphrase", extra: "unreviewed" } as any)).rejects.toThrow(/input/i);
});

it("requires an explicit OS challenge before releasing a key, and closes on denied authentication", async () => {
  await existing();
  deps.authenticateOS.mockRejectedValueOnce(new Error("cancelled by user"));
  await expect(security.unlock({ mode: "keychain" })).rejects.toThrow(/unlock/i);
  expect(security.getState().status).toBe("locked");
  expect(deps.database.openEncryptedDatabase).not.toHaveBeenCalled();
  deps.now = () => Date.now() + 60_000;
  await security.unlock({ mode: "keychain" });
  expect(deps.authenticateOS).toHaveBeenCalledTimes(2);
  expect(security.getState().status).toBe("unlocked");
  expect(JSON.stringify(security.getState())).not.toContain("envelope");
  const passedKey = deps.database.openEncryptedDatabase.mock.calls[0][2];
  expect(passedKey.equals(Buffer.alloc(32))).toBe(true);
});

it("confirms recovery before creating a book and then requires a separate passphrase unlock", async () => {
  await security.initialize();
  const passphrase = "Testing protected launch passphrase";
  const pending = await security.beginSetup({ baseCurrency: "EUR", mode: "passphrase", passphrase, passphraseConfirmation: passphrase });
  expect(security.getState().status).toBe("confirm-recovery");
  await expect(security.confirmSetup({ setupId: pending.setupId, recoverySecret: "wrong" })).rejects.toThrow(/recovery/i);
  await security.confirmSetup(pending);
  expect(security.getState().status).toBe("locked");
  expect(deps.database.openEncryptedDatabase).not.toHaveBeenCalled();
  await security.unlock({ mode: "passphrase", passphrase });
  expect(security.getState().status).toBe("unlocked");
});

it("revokes immediately and waits for late IPC work before allowing another unlock", async () => {
  await existing(); await security.unlock({ mode: "keychain" });
  let finish!: () => void;
  const request = security.runData(() => new Promise<string>((resolve) => { finish = () => resolve("private payload"); }));
  const rejected = expect(request).rejects.toThrow(/locked/i);
  await Promise.resolve();
  const locking = security.lock();
  expect(deps.onRevoked).toHaveBeenCalled();
  expect(security.getState().status).toBe("locking");
  await expect(security.unlock({ mode: "keychain" })).rejects.toThrow();
  finish(); await rejected; await locking;
  expect(security.getState().status).toBe("locked");
});

it("does not let a late authentication response reopen after lock", async () => {
  await existing();
  let finish!: () => void;
  deps.authenticateOS.mockImplementationOnce(() => new Promise<void>((resolve) => { finish = resolve; }));
  const unlocking = security.unlock({ mode: "keychain" });
  const rejected = expect(unlocking).rejects.toThrow(/unlock/i);
  await vi.waitFor(() => expect(finish).toBeDefined());
  const locked = security.lock();
  finish(); await rejected; await locked;
  expect(deps.database.openEncryptedDatabase).not.toHaveBeenCalled();
  expect(security.getState().status).toBe("locked");
});

it("fails closed on damaged profile metadata without attempting a plaintext fallback", async () => {
  await fs.mkdir(path.join(directory, "profiles", "default"), { recursive: true });
  await security.initialize();
  expect(security.getState().status).toBe("recovery-required");
  await expect(security.unlock({ mode: "keychain" })).rejects.toThrow();
  expect(deps.database.openEncryptedDatabase).not.toHaveBeenCalled();
});

it("drains protected recovery before another unlock or completed lock", async () => {
  await existing();
  let finish!: () => void;
  deps.cancelRecovery.mockImplementationOnce(() => new Promise<void>((resolve) => { finish = resolve; }));
  const unlocking = security.unlock({ mode: "keychain" });
  await vi.waitFor(() => expect(finish).toBeDefined());
  expect(deps.authenticateOS).not.toHaveBeenCalled();
  finish(); await unlocking;
  deps.cancelRecovery.mockImplementationOnce(() => new Promise<void>((resolve) => { finish = resolve; }));
  finish = undefined as any;
  const locking = security.lock();
  await vi.waitFor(() => expect(finish).toBeDefined());
  expect(security.getState().status).toBe("locking");
  await expect(security.unlock({ mode: "keychain" })).rejects.toThrow();
  finish(); await locking;
  expect(security.getState().status).toBe("locked");
});

it("refuses to unlock when recovery cleanup cannot finish", async () => {
  await existing();
  deps.cancelRecovery.mockRejectedValueOnce(new Error("cleanup failure"));
  await expect(security.unlock({ mode: "keychain" })).rejects.toThrow();
  expect(deps.authenticateOS).not.toHaveBeenCalled();
  expect(deps.database.openEncryptedDatabase).not.toHaveBeenCalled();
});

it("keeps next-launch profile selection from changing the running profile on relock", async () => {
  await existing(); await security.unlock({ mode: "keychain" });
  const restored = "restored-next-launch";
  await fs.cp(path.join(directory, "profiles", "default"), path.join(directory, "profiles", restored), { recursive: true });
  await fs.writeFile(path.join(directory, "active-profile.json"), JSON.stringify({ id: restored }));
  await security.lock();
  expect(security.getActiveProfile()).toBe("default");
  expect(security.getState().status).toBe("locked");
  await security.unlock({ mode: "keychain" });
  expect(deps.database.openEncryptedDatabase.mock.calls.at(-1)[0]).toBe(path.join(directory, "profiles", "default", "book.sqlite"));
});

async function interruptedSetup() {
  await existing();
  await fs.rename(path.join(directory, "profiles", "default"), path.join(directory, "profiles", ".creating-default-interrupted"));
  await fs.mkdir(path.join(directory, "profiles", ".setup-default.lock"));
  await security.lock();
  expect(security.getState().status).toBe("recovery-required");
  return [".creating-default-interrupted", ".setup-default.lock"];
}

it("drains recovery and serializes native-confirmed setup preservation before allowing a new setup", async () => {
  const artifactIds = await interruptedSetup();
  let finish!: () => void;
  deps.cancelRecovery.mockImplementationOnce(() => new Promise<void>((resolve) => { finish = resolve; }));
  const operation = security.preserveSetup({ artifactIds });
  await vi.waitFor(() => expect(finish).toBeDefined());
  expect(security.getState().status).toBe("recovering");
  expect(deps.confirmPreserveSetup).not.toHaveBeenCalled();
  await expect(security.runData(vi.fn())).rejects.toThrow(/locked/i);
  await expect(security.beginSetup({ baseCurrency: "CAD", mode: "keychain" })).rejects.toThrow();
  finish();
  const result = await operation;
  expect(result.preserved).toBe(true);
  expect(deps.confirmPreserveSetup).toHaveBeenCalledWith(artifactIds);
  expect(security.getState().status).toBe("setup-required");
  expect((await fs.readdir(path.join(directory, "profiles"))).every((name) => name.startsWith(".preserved-"))).toBe(true);
  expect(deps.database.openEncryptedDatabase).not.toHaveBeenCalled();
});

it("preserves nothing if native setup-retry confirmation is canceled", async () => {
  const artifactIds = await interruptedSetup(); deps.confirmPreserveSetup.mockResolvedValueOnce(false);
  expect(await security.preserveSetup({ artifactIds })).toEqual({ preserved: false });
  expect((await fs.readdir(path.join(directory, "profiles"))).sort()).toEqual(artifactIds);
  expect(security.getState().status).toBe("recovery-required");
});

it("revokes a late preservation confirmation after lock and waits before another session", async () => {
  const artifactIds = await interruptedSetup();
  let finish!: (value: boolean) => void;
  deps.confirmPreserveSetup.mockImplementationOnce(() => new Promise<boolean>((resolve) => { finish = resolve; }));
  const operation = security.preserveSetup({ artifactIds });
  const rejected = expect(operation).rejects.toThrow(/preserve|cancel|lock/i);
  await vi.waitFor(() => expect(finish).toBeDefined());
  const locking = security.lock(); expect(security.getState().status).toBe("locking");
  finish(true); await rejected; await locking;
  expect((await fs.readdir(path.join(directory, "profiles"))).sort()).toEqual(artifactIds);
  expect(security.getState().status).toBe("recovery-required");
});

it("refuses unreviewed artifacts before native confirmation and refuses setup retry over an existing book", async () => {
  const artifactIds = await interruptedSetup();
  await expect(security.preserveSetup({ artifactIds: [artifactIds[0]] })).rejects.toThrow();
  expect(deps.confirmPreserveSetup).not.toHaveBeenCalled();
  await fs.mkdir(path.join(directory, "profiles", "default")); await security.lock();
  await expect(security.preserveSetup({ artifactIds })).rejects.toThrow();
  expect(deps.confirmPreserveSetup).not.toHaveBeenCalled();
});

it("does not open a native preservation prompt if locking revoked its inventory read", async () => {
  const artifactIds = await interruptedSetup(), list = interruptedProfiles.listInterruptedProfiles;
  let locking: Promise<void> | undefined;
  vi.spyOn(interruptedProfiles, "listInterruptedProfiles").mockImplementationOnce(async (...args) => {
    const result = await list(...args); locking = security.lock(); return result;
  });
  await expect(security.preserveSetup({ artifactIds })).rejects.toThrow(); await locking;
  expect(deps.confirmPreserveSetup).not.toHaveBeenCalled();
  expect((await fs.readdir(path.join(directory, "profiles"))).sort()).toEqual(artifactIds);
});

const originalPassphrase = "Original main security passphrase", replacementPassphrase = "Replacement main security passphrase";
const credentialChange = () => ({ authentication: { mode: "passphrase" as const, passphrase: originalPassphrase },
  change: { mode: "passphrase" as const, passphrase: replacementPassphrase, passphraseConfirmation: replacementPassphrase } });

it("freshly authenticates and persists a passphrase change while the book stays closed", async () => {
  await existing(originalPassphrase);
  expect(await security.changeCredentials(credentialChange())).toEqual({ updated: true });
  expect(security.getState().status).toBe("locked"); expect(deps.database.openEncryptedDatabase).not.toHaveBeenCalled();
  await expect(security.unlock({ mode: "passphrase", passphrase: originalPassphrase })).rejects.toThrow();
  deps.now = () => Date.now() + 60000;
  await security.unlock({ mode: "passphrase", passphrase: replacementPassphrase });
  expect(security.getState().status).toBe("unlocked");
  await expect(security.changeCredentials(credentialChange())).rejects.toThrow();
});

it("requires matching new credentials before authentication and rate-limits failed current credentials", async () => {
  await existing(originalPassphrase);
  const before = await fs.readFile(path.join(directory, "profiles/default/profile.keys.json"));
  const wrong = credentialChange(); wrong.change.passphraseConfirmation = "does not match";
  await expect(security.changeCredentials(wrong)).rejects.toThrow(/match/i);
  await expect(security.changeCredentials({ ...credentialChange(), extra: "unreviewed" } as any)).rejects.toThrow(/input/i);
  const denied = credentialChange(); denied.authentication.passphrase = "Incorrect current passphrase";
  await expect(security.changeCredentials(denied)).rejects.toThrow();
  await expect(security.changeCredentials(credentialChange())).rejects.toThrow(/wait/i);
  expect(await fs.readFile(path.join(directory, "profiles/default/profile.keys.json"))).toEqual(before);
});

it("requires fresh OS consent when adding or refreshing keychain protection", async () => {
  await existing(originalPassphrase);
  const before = await readProtectedProfile(directory);
  deps.authenticateOS.mockRejectedValueOnce(new Error("OS denied"));
  const request = { authentication: credentialChange().authentication, change: { mode: "keychain" as const } };
  await expect(security.changeCredentials(request)).rejects.toThrow();
  expect((await readProtectedProfile(directory)).envelope).toEqual(before.envelope);
  deps.now = () => Date.now() + 60000;
  expect(await security.changeCredentials(request)).toEqual({ updated: true });
  expect(deps.authenticateOS).toHaveBeenCalledTimes(2);
  const saved = await readProtectedProfile(directory);
  expect(saved.envelope.passphrase).toEqual(before.envelope.passphrase);
  expect(saved.envelope.keychain).not.toEqual(before.envelope.keychain);
});

it("lets a saved recovery code establish an ordinary passphrase without opening financial storage", async () => {
  const recoverySecret = await existing(); deps.osAuthenticationAvailable = () => false;
  expect(await security.changeCredentials({ authentication: { mode: "recovery", recoverySecret }, change: credentialChange().change })).toEqual({ updated: true });
  expect(deps.authenticateOS).not.toHaveBeenCalled(); expect(deps.database.openEncryptedDatabase).not.toHaveBeenCalled();
  expect(security.getState().status).toBe("locked"); expect(security.getState().methods.passphrase).toBe(true);
  await expect(security.unlock({ mode: "recovery", recoverySecret } as any)).rejects.toThrow(/input/i);
  await security.unlock({ mode: "passphrase", passphrase: replacementPassphrase });
  expect(security.getState().status).toBe("unlocked");
});

it("revokes a late OS response and drains a credential change before the next session", async () => {
  await existing(); const before = await fs.readFile(path.join(directory, "profiles/default/profile.keys.json"));
  let finish!: () => void;
  deps.authenticateOS.mockImplementationOnce(() => new Promise<void>((resolve) => { finish = resolve; }));
  const operation = security.changeCredentials({ authentication: { mode: "keychain" }, change: credentialChange().change });
  const rejected = expect(operation).rejects.toThrow();
  await vi.waitFor(() => expect(finish).toBeDefined());
  await expect(security.unlock({ mode: "keychain" })).rejects.toThrow();
  const locking = security.lock(); finish(); await rejected; await locking;
  expect(await fs.readFile(path.join(directory, "profiles/default/profile.keys.json"))).toEqual(before);
  expect(deps.database.openEncryptedDatabase).not.toHaveBeenCalled();
});

it("requires native consent to retain an interrupted credential lock before retrying", async () => {
  await existing(originalPassphrase); const lock = path.join(directory, "profiles/.credentials-default.lock"); await fs.mkdir(lock);
  const before = await fs.readFile(path.join(directory, "profiles/default/profile.keys.json"));
  deps.confirmCredentialRepair.mockResolvedValueOnce(false);
  expect(await security.changeCredentials(credentialChange())).toEqual({ updated: false });
  expect(await fs.readFile(path.join(directory, "profiles/default/profile.keys.json"))).toEqual(before);
  expect(await security.changeCredentials(credentialChange())).toEqual({ updated: true });
  expect(deps.confirmCredentialRepair).toHaveBeenCalledWith("default");
  expect((await fs.readdir(path.join(directory, "profiles"))).some((name) => name.startsWith(".preserved-credentials-default-lock-"))).toBe(true);
});

it("revokes late native credential-repair consent without moving the retained lock", async () => {
  await existing(originalPassphrase); await fs.mkdir(path.join(directory, "profiles/.credentials-default.lock"));
  const before = await fs.readFile(path.join(directory, "profiles/default/profile.keys.json"));
  let finish!: (value: boolean) => void;
  deps.confirmCredentialRepair.mockImplementationOnce(() => new Promise<boolean>((resolve) => { finish = resolve; }));
  const operation = security.changeCredentials(credentialChange()), rejected = expect(operation).rejects.toThrow();
  await vi.waitFor(() => expect(finish).toBeDefined());
  const locking = security.lock(); finish(true); await rejected; await locking;
  expect(await fs.readFile(path.join(directory, "profiles/default/profile.keys.json"))).toEqual(before);
  expect((await fs.readdir(path.join(directory, "profiles"))).some((name) => name.startsWith(".preserved-credentials-"))).toBe(false);
});

it("retains a verified published credential when lock arrives after the envelope rename", async () => {
  await existing(originalPassphrase); const rename = fs.rename;
  let locking: Promise<void> | undefined;
  vi.spyOn(fs, "rename").mockImplementation(async (...args) => {
    await rename(...args);
    if (String(args[1]).endsWith("profile.keys.json")) locking = security.lock();
  });
  await expect(security.changeCredentials(credentialChange())).rejects.toThrow(); await locking;
  expect(security.getState().status).toBe("locked");
  expect(deps.database.openEncryptedDatabase).not.toHaveBeenCalled();
  await security.unlock({ mode: "passphrase", passphrase: replacementPassphrase });
  expect(security.getState().status).toBe("unlocked");
});
