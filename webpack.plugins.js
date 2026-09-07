const ForkTsCheckerWebpackPlugin = require("fork-ts-checker-webpack-plugin");
const webpack = require("webpack");

module.exports = (mode = "development") => [
  new ForkTsCheckerWebpackPlugin({
    logger: "webpack-infrastructure",
  }),
  new webpack.DefinePlugin({
    "process.type": JSON.stringify(process.type),
    "process.env.NODE_ENV": JSON.stringify(
      mode
    ),
  }),
  ...(mode === "development" && process.env.PLAYWRIGHT_TEST !== "1" ? [new webpack.HotModuleReplacementPlugin()] : []),
];
