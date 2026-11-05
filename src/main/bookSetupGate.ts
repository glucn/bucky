const setupChannels = new Set(["get-book-setup-state", "complete-book-setup", "reset-all-data"]);

export function createBookSetupGate(getState: () => Promise<{ required: boolean }>) {
  return async (channel: string, action: () => Promise<any>) => {
    if (!setupChannels.has(channel) && (await getState()).required) throw new Error("Choose a base currency before opening financial workflows");
    return action();
  };
}
