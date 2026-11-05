import { expect, it } from "vitest";
import { developmentServer } from "./developmentServer";

it("uses one explicit loopback port for development and E2E origins", () => {
  expect(developmentServer({})).toEqual({ port: 3000, url: "http://localhost:3000" });
  expect(developmentServer({ BUCKY_DEV_PORT: "31731" })).toEqual({ port: 31731, url: "http://localhost:31731" });
});
it.each(["", "0", "80", "65535", "65536", "3000/evil", "3000.5", "https://example.com", "-1"])("rejects unsafe/invalid development port %j", (port) => {
  expect(() => developmentServer({ BUCKY_DEV_PORT: port })).toThrow(/port/i);
});
