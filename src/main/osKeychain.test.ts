import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ available: vi.fn(), encrypt: vi.fn(), decrypt: vi.fn() }));
vi.mock("electron", () => ({ safeStorage: { isEncryptionAvailable: mocks.available,
  encryptString: mocks.encrypt, decryptString: mocks.decrypt } }));
import { createOsKeychain } from "./osKeychain";
const osKeychain = createOsKeychain("darwin");

describe("Electron OS keychain adapter", () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.available.mockReturnValue(true); });
  it("wraps and unwraps through Electron safeStorage without caching plaintext", async () => {
    mocks.encrypt.mockReturnValue(Buffer.from("protected"));
    mocks.decrypt.mockReturnValue("secret");
    expect(await osKeychain.encryptString("secret")).toEqual(Buffer.from("protected"));
    expect(await osKeychain.decryptString(Buffer.from("protected"))).toBe("secret");
    expect(mocks.encrypt).toHaveBeenCalledWith("secret");
    expect(mocks.decrypt).toHaveBeenCalledWith(Buffer.from("protected"));
  });
  it("fails closed when OS encryption is unavailable", async () => {
    mocks.available.mockReturnValue(false);
    expect(osKeychain.isAvailable()).toBe(false);
    await expect(osKeychain.encryptString("secret")).rejects.toThrow(/unavailable/i);
    await expect(osKeychain.decryptString(Buffer.from("protected"))).rejects.toThrow(/unavailable/i);
    expect(mocks.encrypt).not.toHaveBeenCalled();
    expect(mocks.decrypt).not.toHaveBeenCalled();
  });
  it("does not treat an unvalidated platform/backend as a working keychain", () => {
    expect(createOsKeychain("linux").isAvailable()).toBe(false);
    expect(createOsKeychain("win32").isAvailable()).toBe(false);
  });
});
