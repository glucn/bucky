import { expect, it, vi } from "vitest";
import { setupDevelopmentIpcHandlers } from "./ipcHandlers.development";

it("requires an explicit reviewed reset mode and passes it to the guarded service", async () => {
  const handlers = new Map<string, (...args: any[]) => any>();
  const resetAllData = vi.fn().mockResolvedValue(undefined);
  setupDevelopmentIpcHandlers({ handle: (name: string, handler: any) => handlers.set(name, handler) } as any, { resetAllData });
  const reset = handlers.get("reset-all-data")!;
  for (const request of [undefined, {}, { mode: "invalid" }, { mode: "data", extra: true }]) {
    expect(await reset({}, request)).toMatchObject({ success: false });
  }
  expect(resetAllData).not.toHaveBeenCalled();
  expect(await reset({}, { mode: "data" })).toEqual({ success: true });
  expect(resetAllData).toHaveBeenLastCalledWith({ mode: "data" });
  expect(await reset({}, { mode: "factory" })).toEqual({ success: true });
  expect(resetAllData).toHaveBeenLastCalledWith({ mode: "factory" });
  resetAllData.mockRejectedValueOnce(new Error("Personal database reset prohibited"));
  expect(await reset({}, { mode: "factory" })).toEqual({ success: false, error: "Personal database reset prohibited" });
});
