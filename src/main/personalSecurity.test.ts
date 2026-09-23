import { afterEach, beforeEach, expect, it, vi } from "vitest";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { PersonalSecurity } from "./personalSecurity";
import { ProtectedProfileSetup } from "../services/protectedProfiles";

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
    onRevoked: vi.fn(), onStateChanged: vi.fn(), now: () => Date.now() };
  security = new PersonalSecurity(directory, migrations, deps);
});
afterEach(async () => { await security.lock(); await fs.rm(directory, { recursive: true, force: true }); });
async function existing() {
  const setup = new ProtectedProfileSetup(directory, migrations);
  const pending = await setup.begin({ baseCurrency: "CAD", keychain });
  await setup.confirm(pending.setupId, pending.recoverySecret);
  await security.initialize();
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
