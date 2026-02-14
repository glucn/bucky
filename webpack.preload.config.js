const rules = require("./webpack.rules");
const plugins = require("./webpack.plugins");
const path = require("path");
const isPlaywrightTest = process.env.PLAYWRIGHT_TEST === "1";

module.exports = {
  mode: isPlaywrightTest ? "production" : "development",
  entry: "./src/preload.ts",
  target: "electron-preload",
  module: {
    rules,
  },
  plugins: plugins,
  resolve: {
    extensions: [".js", ".ts", ".jsx", ".tsx", ".css", ".json"],
  },
  output: {
    path: path.resolve(__dirname, ".webpack/renderer/main_window"),
    filename: "preload.js",
  },
};
