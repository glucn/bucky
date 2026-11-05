import { expect, it, vi } from "vitest";
import { createBookSetupGate } from "./bookSetupGate";

it("denies every financial action before explicit setup and permits only reviewed setup/reset operations", async () => {
  const getState = vi.fn().mockResolvedValue({ required: true }), action = vi.fn().mockResolvedValue("records");
  const run = createBookSetupGate(getState);
  for (const channel of ["get-accounts", "add-account", "get-app-setting", "set-app-setting", "start-enrichment-run", "get-overview-summary"]) {
    await expect(run(channel, action)).rejects.toThrow(/base currency/i);
  }
  expect(action).not.toHaveBeenCalled();
  for (const channel of ["get-book-setup-state", "complete-book-setup", "reset-all-data"]) expect(await run(channel, action)).toBe("records");
  getState.mockResolvedValue({ required: false });
  expect(await run("get-accounts", action)).toBe("records");
  getState.mockRejectedValue(new Error("Cannot read setup"));
  await expect(run("add-account", action)).rejects.toThrow();
});
