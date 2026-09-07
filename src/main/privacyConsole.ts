/** Existing console calls include financial payloads. Disable them in personal builds
 * until an explicit, non-sensitive diagnostic event format replaces them. */
export function configurePrivacyConsole(target: Console, packaged: boolean): void {
  if (!packaged) return;
  for (const method of ["log", "info", "debug", "warn", "error", "trace"] as const) {
    target[method] = () => {};
  }
}
