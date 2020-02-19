'use strict'
const path = require('path');
const webpack = require('webpack');
const { VueLoaderPlugin } = require('vue-loader')
const TerserPlugin = require('terser-webpack-plugin');
module.exports = {
  mode: 'production',
  entry: {
    index: './index.js'
  },
  module: {
    rules: [
      {
        test: /\.vue$/,
        use: 'vue-loader'
      }
    ]
  },
  output:{
    filename: '[name].js',
    publicPath: '/scripts/',
    path: path.resolve(__dirname, '../public/scripts')
  },
  optimization: {
    minimizer: [
      new TerserPlugin({
        terserOptions: {
          output: {
            comments: false,
          },
        },
      }),
    ],
  },
  plugins: [new VueLoaderPlugin()]
}