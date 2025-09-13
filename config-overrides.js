const webpack = require('webpack');

module.exports = function override(config, env) {
  // 配置Node.js核心模块的polyfills
  config.resolve.fallback = {
    ...config.resolve.fallback,
    "crypto": require.resolve("crypto-browserify"),
    "stream": require.resolve("stream-browserify"),
    "vm": require.resolve("vm-browserify"),
    "buffer": require.resolve("buffer"),
    "util": require.resolve("util"),
    "process": require.resolve("process/browser"),
    "path": require.resolve("path-browserify"),
    "fs": false,
    "net": false,
    "tls": false,
    "child_process": false
  };

  // 添加全局变量插件
  config.plugins = [
    ...config.plugins,
    new webpack.ProvidePlugin({
      process: 'process/browser',
      Buffer: ['buffer', 'Buffer'],
    }),
    new webpack.DefinePlugin({
      'process.env.NODE_ENV': JSON.stringify(env),
      global: 'globalThis',
    })
  ];

  // 确保处理node_modules中的ES6模块
  config.module.rules.push({
    test: /\.m?js$/,
    resolve: {
      fullySpecified: false
    }
  });

  // 添加source-map支持(开发模式)
  if (env === 'development') {
    config.devtool = 'source-map';
  }

  return config;
};

