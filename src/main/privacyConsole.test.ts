import { describe, expect, it, vi } from "vitest";
import { configurePrivacyConsole } from "./privacyConsole";

describe("Packaged console privacy", () => {
  it("does not emit payload-bearing console messages in packaged builds", () => {
    const methods = ["log", "info", "debug", "warn", "error", "trace"] as const;
    const spies = Object.fromEntries(methods.map((name) => [name, vi.fn()]));
    const target = { ...spies } as unknown as Console;
    configurePrivacyConsole(target, true);
    for (const name of methods) {
      target[name]("Account private-name", new Error("secret query"));
      expect(spies[name]).not.toHaveBeenCalled();
    }
  });
  it("retains development diagnostics", () => {
    const target = { log: vi.fn() };
    configurePrivacyConsole(target as unknown as Console, false);
    target.log("diagnostic");
    expect(target.log).toHaveBeenCalledWith("diagnostic");
  });
});
