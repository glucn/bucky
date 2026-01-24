const path = require("path");
const CopyPlugin = require("copy-webpack-plugin");

module.exports = {
  /**
   * This is the main entry point for your application, it's the first file
   * that runs in the main process.
   */
  mode: "development",
  entry: "./src/main/index.ts",
  // Put your normal webpack config below here
  module: {
    rules: require("./webpack.rules"),
  },
  resolve: {
    extensions: [".js", ".ts", ".jsx", ".tsx", ".css", ".json"],
  },
  plugins: [
    new CopyPlugin({
      patterns: [
        {
          from: path.join(
            __dirname,
            "node_modules/@prisma/engines/libquery_engine-darwin-arm64.dylib.node"
          ),
          to: path.join(
            __dirname,
            ".webpack/main/libquery_engine-darwin-arm64.dylib.node"
          ),
        },
        {
          from: path.join(__dirname, "prisma/schema.prisma"),
          to: path.join(__dirname, ".webpack/main/schema.prisma"),
        },
      ],
    }),
  ],
  externals: {
    "@prisma/client": "commonjs @prisma/client",
    "electron": "commonjs electron",
    "fs": "commonjs fs",
    "path": "commonjs path",
    "crypto": "commonjs crypto",
    "os": "commonjs os",
    "util": "commonjs util",
    "events": "commonjs events",
    "stream": "commonjs stream",
    "buffer": "commonjs buffer",
  },
  output: {
    path: path.join(__dirname, ".webpack/main"),
    filename: "index.js",
  },
  devtool: "source-map",
};
