import { expect, it } from "vitest";
import { preparationState } from "../../scripts/e2e-preparation-state";

it("does not treat old bundle files as evidence the current prepare process has built and launched", () => {
  const state = preparationState(() => true);
  expect(state.ready()).toBe(false);
  state.observe("Building renderer code...\n"); expect(state.ready()).toBe(false);
  state.observe("BUCKY_E2E_"); expect(state.ready()).toBe(false);
  state.observe("PREPARED\n"); expect(state.ready()).toBe(true);
});
it("requires both a fresh launch marker and complete output files", () => {
  let files = false; const state = preparationState(() => files);
  state.observe("BUCKY_E2E_PREPARED\n"); expect(state.ready()).toBe(false);
  files = true; expect(state.ready()).toBe(true);
});
it("does not accept a compiler diagnostic quoting the launch-marker source", () => {
  const state = preparationState(() => true);
  state.observe('Error at source line: console.log("BUCKY_E2E_PREPARED");\n');
  expect(state.ready()).toBe(false);
});
