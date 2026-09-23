export function installPersonalLockEvents(events: { on(event: string, listener: () => void): unknown }, lock: () => Promise<void>) {
  const close = () => { void lock(); };
  events.on("lock-screen", close);
  events.on("suspend", close);
  events.on("user-did-resign-active", close);
}
