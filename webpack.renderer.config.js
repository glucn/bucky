const rules = require("./webpack.rules");
const plugins = require("./webpack.plugins");
const path = require("path");

rules.push({
  test: /\.css$/,
  use: [
    { loader: "style-loader" },
    { loader: "css-loader" },
    { loader: "postcss-loader" },
  ],
});

module.exports = {
  entry: "./src/renderer/index.tsx",
  output: {
    filename: "renderer.js",
    path: path.resolve(__dirname, ".webpack/renderer"),
  },
  module: {
    rules,
  },
  plugins: plugins,
  resolve: {
    extensions: [".js", ".ts", ".jsx", ".tsx", ".css"],
    alias: {
      "@": path.resolve(__dirname, "src/renderer"),
    },
  },
  target: "web",
  devServer: {
    headers: {
      "Content-Type": "application/javascript",
    },
  },
};
