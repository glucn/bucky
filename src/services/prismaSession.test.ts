import { describe, expect, it, vi } from "vitest";
import { PrismaClient } from "@prisma/client";
import { PrismaSession } from "./prismaSession";

function fakeClient(name: string) {
  const execute = vi.fn(async () => [{ name }]);
  const client = { account: { findMany: () => ({
    [Symbol.toStringTag]: "PrismaPromise",
    then: (resolve: any, reject: any) => execute().then(resolve, reject),
    requestTransaction: () => ({ then: (resolve: any, reject: any) => execute().then(resolve, reject) }),
  }) }, $disconnect: vi.fn(async () => {}), $transaction: vi.fn(async (fn: any) => fn(client)) };
  return { client: client as unknown as PrismaClient, execute };
}

describe("main-owned Prisma session", () => {
  it("routes retained service/delegate references to the explicitly opened session", async () => {
    const session = new PrismaSession();
    const retained = session.client.account;
    session.activate(fakeClient("first").client);
    expect(await retained.findMany()).toEqual([{ name: "first" }]);
    await session.close();
    session.activate(fakeClient("second").client);
    expect(await retained.findMany()).toEqual([{ name: "second" }]);
    await session.close();
  });

  it("revokes lazy requests and never implicitly reconnects a closed session", async () => {
    const session = new PrismaSession();
    const first = fakeClient("first");
    session.activate(first.client);
    const delayed = session.client.account.findMany();
    await session.close();
    await expect(Promise.resolve(delayed)).rejects.toThrow(/closed/i);
    expect(() => session.client.account.findMany()).toThrow(/closed/i);
    session.activate(fakeClient("second").client);
    await expect(Promise.resolve(delayed)).rejects.toThrow(/closed/i);
    expect(first.execute).not.toHaveBeenCalled();
    await session.close();
  });

  it("revokes a retained interactive transaction client and batch transaction request", async () => {
    const session = new PrismaSession();
    const first = fakeClient("first");
    session.activate(first.client);
    let captured: any;
    await session.client.$transaction(async (tx) => { captured = tx; });
    const pending: any = session.client.account.findMany();
    await session.close();
    expect(() => captured.account.findMany()).toThrow(/closed/i);
    expect(() => pending.requestTransaction({})).toThrow(/closed/i);
    expect(first.execute).not.toHaveBeenCalled();
  });

  it("blocks reopening until disconnect finishes, and does not expose lifecycle internals", async () => {
    const session = new PrismaSession();
    const first = fakeClient("first");
    let finish!: () => void;
    first.client.$disconnect = () => new Promise<void>((resolve) => { finish = resolve; });
    session.activate(first.client);
    const closed = session.close();
    expect(() => session.activate(fakeClient("second").client)).toThrow();
    expect(() => session.client.$connect()).toThrow(/owner/i);
    expect(() => (session.client as any)._engine).toThrow(/internal/i);
    finish();
    await closed;
  });

  it.each([false, true])("does not deliver a pending result or sensitive error after close (reject=%s)", async (reject) => {
    const session = new PrismaSession();
    const first = fakeClient("first");
    let finish!: () => void;
    first.execute.mockImplementationOnce(() => new Promise((resolve, fail) => {
      finish = () => reject ? fail(new Error("Sensitive SQL details")) : resolve([{ name: "Private account" }]);
    }));
    session.activate(first.client);
    const request = Promise.resolve(session.client.account.findMany());
    const rejected = expect(request).rejects.toThrow("Database session is closed");
    await Promise.resolve();
    await session.close();
    finish();
    await rejected;
  });

  it("revokes immediately but lets active transactions roll back before disconnecting their driver", async () => {
    const session = new PrismaSession(), first = fakeClient("first"), events: string[] = [];
    let release!: () => void;
    first.execute.mockImplementationOnce(() => new Promise((resolve) => { release = () => resolve([]); }));
    (first.client as any).$transaction = async (callback: any) => {
      try { return await callback(first.client); } finally { events.push("transaction finished"); }
    };
    first.client.$disconnect = vi.fn(async () => { events.push("disconnect"); });
    session.activate(first.client);
    const request = Promise.resolve(session.client.$transaction(async (tx) => { await tx.account.findMany(); })).catch((error: Error) => error);
    await vi.waitFor(() => expect(first.execute).toHaveBeenCalledOnce());
    const closing = session.close();
    const disconnectedBeforeRollback = events.includes("disconnect");
    expect(() => session.client.account.findMany()).toThrow(/closed/i);
    release();
    const result = await request; await closing;
    expect(disconnectedBeforeRollback).toBe(false);
    expect(events).toEqual(["transaction finished", "disconnect"]);
    expect(result).toBeInstanceOf(Error); expect((result as Error).message).toMatch(/closed/i);
  });

  it("does not enter a queued transaction callback after session revocation", async () => {
    const session = new PrismaSession(), first = fakeClient("first"), callback = vi.fn(async () => "private result");
    let start!: () => void;
    (first.client as any).$transaction = (run: any) => {
      const pending = new Promise((resolve, reject) => { start = () => { void Promise.resolve().then(() => run(first.client)).then(resolve, reject); }; });
      void pending.catch(() => {}); return pending;
    };
    session.activate(first.client);
    const request = Promise.resolve(session.client.$transaction(callback)).catch((error: Error) => error);
    const closing = session.close(); start();
    const result = await request; await closing;
    expect(callback).not.toHaveBeenCalled();
    expect(result).toBeInstanceOf(Error); expect((result as Error).message).toMatch(/closed/i);
  });
});
