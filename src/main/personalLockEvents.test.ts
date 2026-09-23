import { expect, it, vi } from "vitest";
import { EventEmitter } from "events";
import { installPersonalLockEvents } from "./personalLockEvents";
it("locks on OS lock, suspend, and user-session deactivation but never automatically unlocks", () => {
  const events = new EventEmitter();
  const lock = vi.fn(async () => {});
  installPersonalLockEvents(events, lock);
  for (const event of ["lock-screen", "suspend", "user-did-resign-active"]) events.emit(event);
  expect(lock).toHaveBeenCalledTimes(3);
  events.emit("unlock-screen"); events.emit("resume");
  expect(lock).toHaveBeenCalledTimes(3);
});
