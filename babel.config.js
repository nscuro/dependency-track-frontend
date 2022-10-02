module.exports = {
  presets: [
    ["@vue/cli-plugin-babel/preset", {
      polyfills: [
        //'es6.array.find',
        //'es6.array.from',
        //'es6.symbol'
      ]
    }],
    ["@babel/preset-env", {
      "useBuiltIns": "entry",
      "corejs": "3"
    }]
  ]
}
