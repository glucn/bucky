function preparationState(checkReady) {
  let output = "", launched = false;
  return {
    observe(chunk) {
      const combined = output + String(chunk);
      if (/(?:^|\r?\n)BUCKY_E2E_PREPARED\r?\n/.test(combined)) launched = true;
      output = combined.slice(-4096);
    },
    ready() { return launched && checkReady(); },
  };
}
module.exports = { preparationState };
