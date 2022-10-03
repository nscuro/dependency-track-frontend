module.exports = {
  presets: [
    ["@vue/cli-plugin-babel/preset", {
      polyfills: []
    }],
    ["@babel/preset-env", {
      "useBuiltIns": "entry",
      "corejs": "3"
    }]
  ]
}
