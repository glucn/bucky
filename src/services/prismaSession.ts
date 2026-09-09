import type { PrismaClient } from "@prisma/client";

/** Stable service facade; only its main-process owner may open/close the underlying client.
 * Prisma promises are lazy, so revocation must cover execution, not just method creation.
 * This is a lifecycle boundary for trusted services, not a sandbox for arbitrary JavaScript.
 */
export class PrismaSession {
  private active: PrismaClient | undefined;
  private epoch = 0;
  private closing: Promise<void> | undefined;
  readonly client: PrismaClient = this.facade(() => this.requireActive()) as PrismaClient;

  activate(client: PrismaClient) {
    if (this.active || this.closing) throw new Error("Database session is already open or closing");
    this.epoch++;
    this.active = client;
  }

  async close(): Promise<void> {
    if (this.closing) return this.closing;
    const client = this.active;
    this.active = undefined;
    this.epoch++;
    if (!client) return;
    this.closing = client.$disconnect();
    try { await this.closing; } finally { this.closing = undefined; }
  }

  private requireActive(epoch = this.epoch): PrismaClient {
    if (!this.active || this.epoch !== epoch) throw new Error("Database session is closed");
    return this.active;
  }

  private facade(resolve: () => any, guard?: () => void): object {
    const delegates = new Map<PropertyKey, object>();
    return new Proxy({}, {
      get: (_target, property) => {
        if (property === "then" || typeof property === "symbol") return undefined;
        if (property.startsWith("_")) throw new Error("Database internals are not exposed");
        if (["$connect", "$disconnect", "$extends", "$use", "$on"].includes(property)) {
          return () => { throw new Error("Database lifecycle and extensions require the session owner"); };
        }
        // Model delegates can be retained before unlock, but their methods resolve at invocation.
        if (!property.startsWith("$") && !guard) {
          if (!delegates.has(property)) delegates.set(property, this.facade(() => resolve()[property], () => { this.requireActive(); }));
          return delegates.get(property);
        }
        return (...args: any[]) => {
          guard?.();
          const owner = resolve();
          const epoch = this.epoch;
          const check = () => { this.requireActive(epoch); guard?.(); };
          check();
          if (property === "$transaction" && typeof args[0] === "function") {
            const callback = args[0];
            args[0] = (tx: any) => callback(this.transactionFacade(tx, check));
          }
          return this.guardPromise(owner[property](...args), check);
        };
      },
    });
  }

  private transactionFacade(tx: any, check: () => void): object {
    return new Proxy({}, { get: (_target, property) => {
      check();
      if (typeof property === "symbol" || property === "then") return undefined;
      if (property.startsWith("_")) throw new Error("Database internals are not exposed");
      const value = tx[property];
      if (typeof value === "function") return (...args: any[]) => {
        check(); return this.guardPromise(value.apply(tx, args), check);
      };
      return this.facade(() => tx[property], check);
    } });
  }

  private guardPromise(value: any, check: () => void): any {
    if (!value || typeof value.then !== "function") return value;
    return new Proxy(value, { get: (target, property) => {
      if (property === "then") return (fulfilled?: (result: any) => any, rejected?: (error: any) => any) => {
        // Convert a revoked lazy request into a rejected thenable without executing the driver.
        try { check(); } catch (error) { return Promise.reject(error).then(fulfilled, rejected); }
        return target.then(
          (result: any) => { check(); return result; },
          (error: any) => { check(); throw error; },
        ).then(fulfilled, rejected);
      };
      if (property === "catch") return (rejected: (error: any) => any) =>
        Promise.resolve(this.guardPromise(target, check)).catch(rejected);
      if (property === "finally") return (done: () => void) =>
        Promise.resolve(this.guardPromise(target, check)).finally(done);
      const member = Reflect.get(target, property, target);
      if (typeof member === "function") return (...args: any[]) => {
        check(); return this.guardPromise(member.apply(target, args), check);
      };
      return member;
    } });
  }
}
