import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ canPromptTouchID: vi.fn(), promptTouchID: vi.fn() }));
vi.mock("electron", () => ({ systemPreferences: mocks }));
import { createOsAuthentication } from "./osAuthentication";
beforeEach(() => { vi.clearAllMocks(); mocks.canPromptTouchID.mockReturnValue(true); mocks.promptTouchID.mockResolvedValue(undefined); });
it("requires a successful OS challenge and propagates cancellation", async () => {
  const authentication = createOsAuthentication("darwin");
  expect(authentication.available()).toBe(true);
  await authentication.authenticate();
  expect(mocks.promptTouchID).toHaveBeenCalledTimes(1);
  mocks.promptTouchID.mockRejectedValueOnce(new Error("cancelled"));
  await expect(authentication.authenticate()).rejects.toThrow();
});
it("refuses unavailable and unsupported OS authentication without a fallback challenge", async () => {
  expect(createOsAuthentication("linux").available()).toBe(false);
  await expect(createOsAuthentication("linux").authenticate()).rejects.toThrow(/unavailable/i);
  mocks.canPromptTouchID.mockReturnValue(false);
  await expect(createOsAuthentication("darwin").authenticate()).rejects.toThrow(/unavailable/i);
  expect(mocks.promptTouchID).not.toHaveBeenCalled();
});
