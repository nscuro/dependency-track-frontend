const CopyPlugin = require('copy-webpack-plugin')
const { CycloneDxWebpackPlugin } = require('@cyclonedx/webpack-plugin');

module.exports = {
  lintOnSave: false,
  productionSourceMap: false,
  runtimeCompiler: true,
  // Relative paths cannot be supported. Research by @nscur0 - https://owasp.slack.com/archives/CTC03GX9S/p1608400149085400
  publicPath: "/",
  devServer: {
    proxy: { "/api": { target: "http://localhost:8080" } }
  },
  chainWebpack: (config) => {
    config.resolve.alias.set("vue", "@vue/compat")
    config.module
      .rule("vue")
      .use("vue-loader")
      .tap((options) => {
        return {
          ...options,
          compilerOptions: {
            compatConfig: {
              MODE: 3
            }
          }
        }
      })
  },
  configureWebpack: {
    plugins: [
      new CopyPlugin([
        { from: "node_modules/axios/dist/axios.min.js", to: "static/js", force: true },
        { from: "node_modules/oidc-client/dist/oidc-client.min.js", to: "static/js", force: true }
      ]),
      new CycloneDxWebpackPlugin({
        context: '../',
        outputLocation: '../'
      })
    ],
    resolve: {
      fallback: { "querystring": require.resolve("querystring-es3") }
    },
  }
};
