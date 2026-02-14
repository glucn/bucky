const rules = require("./webpack.rules");
const plugins = require("./webpack.plugins");
const path = require("path");
const HtmlWebpackPlugin = require("html-webpack-plugin");

rules.push({
  test: /\.css$/,
  use: [
    { loader: "style-loader" },
    { loader: "css-loader" },
    { loader: "postcss-loader" },
  ],
});

module.exports = {
  mode: "development",
  entry: "./src/renderer/index.tsx",
  output: {
    filename: "renderer.js",
    path: path.resolve(__dirname, ".webpack/renderer"),
    publicPath: "http://localhost:3000/",
  },
  module: {
    rules,
  },
  plugins: [
    ...plugins,
    new HtmlWebpackPlugin({
      template: path.resolve(__dirname, "src/renderer/index.html"),
      inject: true,
    }),
  ],
  resolve: {
    extensions: [".js", ".ts", ".jsx", ".tsx", ".css"],
    alias: {
      "@": path.resolve(__dirname, "src/renderer"),
    },
  },
  target: "web",
  devServer: {
    port: 3000,
    hot: process.env.PLAYWRIGHT_TEST === "1" ? false : true,
    liveReload: process.env.PLAYWRIGHT_TEST === "1" ? false : true,
    client: process.env.PLAYWRIGHT_TEST === "1" ? false : undefined,
    static: {
      directory: path.join(__dirname, ".webpack/renderer"),
      publicPath: "/",
    },
    historyApiFallback: true,
    headers: {
      "Access-Control-Allow-Origin": "*",
    },
  },
};
