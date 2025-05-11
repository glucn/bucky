const rules = require("./webpack.rules");
const path = require("path");

rules.push({
  test: /\.css$/,
  use: [{ loader: "style-loader" }, { loader: "css-loader" }],
});

module.exports = {
  entry: "./src/renderer.js",
  output: {
    filename: "renderer.js",
    path: path.resolve(__dirname, ".webpack/renderer"),
  },
  module: {
    rules,
  },
  resolve: {
    extensions: [".js", ".json"],
  },
  devServer: {
    headers: {
      "Content-Type": "application/javascript",
    },
  },
};
