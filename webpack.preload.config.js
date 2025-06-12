const rules = require("./webpack.rules");
const plugins = require("./webpack.plugins");

module.exports = {
  entry: "./src/preload.ts",
  module: {
    rules,
  },
  plugins: plugins,
  resolve: {
    extensions: [".js", ".ts", ".jsx", ".tsx", ".css", ".json"],
  },
};
