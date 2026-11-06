import { expect, it } from "vitest";

it("preserves BigInt arithmetic through the actual application Babel rule", () => {
  const babel = require("@babel/core");
  const rules = require("../../webpack.rules.js");
  const rule = rules.find((candidate: { test: RegExp }) => candidate.test.test("investmentDistributions.ts"));
  const { code } = babel.transformSync("module.exports = (base, exponent) => base ** exponent;", {
    ...rule.use.options, filename: "runtime.js", babelrc: false, configFile: false,
  });
  const compiled = { exports: undefined as unknown as (base: bigint, exponent: bigint) => bigint };
  new Function("module", code)(compiled);
  expect(compiled.exports(10n, 3n)).toBe(1000n);
});
