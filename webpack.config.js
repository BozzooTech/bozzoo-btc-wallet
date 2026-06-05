const path = require('path');
const CopyPlugin = require('copy-webpack-plugin');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');
const webpack = require('webpack');


const isFirefox = process.env.BROWSER === 'firefox';

module.exports = {
  //  Entry Points (all TypeScript) 
  entry: {
    popup: './src/ui/index.tsx',
    background: './src/background/background.ts',
  },

  output: {
    path: path.resolve(__dirname, isFirefox ? 'dist/firefox' : 'dist/chrome'),
    filename: '[name].js',
    clean: true,
  },

  //  Module Resolution 
  resolve: {
    extensions: ['.tsx', '.ts', '.js'],   // .tsx takes priority
    fallback: {
      crypto: false,             // Use browser's native Web Crypto API
      stream: require.resolve('stream-browserify'),
      buffer: require.resolve('buffer/'),
      vm: false,
      process: false,
    },
    alias: {
      '@engine': path.resolve(__dirname, 'src/engine'),
      '@security': path.resolve(__dirname, 'src/security'),
      '@ui': path.resolve(__dirname, 'src/ui'),
      '@types': path.resolve(__dirname, 'src/types'),
    },
  },

  //  Loaders 
  module: {
    rules: [
      // TypeScript — all .ts files (engine, security, background, ui)
      {
        test: /\.tsx?$/,
        exclude: /node_modules/,
        use: {
          loader: 'ts-loader',
          options: {
            transpileOnly: false,       // Full type-check on every build
            configFile: path.resolve(__dirname, 'tsconfig.json'),
          },
        },
      },
      // CSS — extracted to separate file, not inlined
      {
        test: /\.css$/,
        use: [MiniCssExtractPlugin.loader, 'css-loader'],
      },
    ],
  },

  //  Plugins 
  plugins: [
    new webpack.ProvidePlugin({
      Buffer: ['buffer', 'Buffer'],
    }),
    new webpack.DefinePlugin({
      'process.browser': true,
      'process.version': JSON.stringify(''),
      'global': 'globalThis',
    }),
    new MiniCssExtractPlugin({
      filename: 'styles/[name].css',
    }),
    new CopyPlugin({
      patterns: [
        {
          from: isFirefox ? 'manifest.firefox.json' : 'manifest.json',
          to: 'manifest.json',
        },
        { from: 'index.html', to: 'popup.html' },
        { from: 'assets', to: 'assets', noErrorOnMissing: true },
      ],
    }),
  ],

  //  Node Polyfills 
  node: {
    global: false,
  },

  //  Optimization 
  optimization: {
    // No code splitting — extensions require a single bundle per entry
    splitChunks: false,
    // Do NOT minify Firefox builds to prevent automated "Deceptive" flags
    minimize: !isFirefox,
  },
  performance: {
    maxEntrypointSize: 5_000_000,
    maxAssetSize: 5_000_000,
  },
  // Ensure we never use () in development mode (violates MV3 CSP)
  devtool: 'source-map',
  //  Dev Server 
  devServer: {
    static: {
      directory: path.join(__dirname, 'dist/chrome'),
    },
    port: 3000,
    open: ['/popup.html'],
    hot: true,
    historyApiFallback: {
      index: '/popup.html'
    }
  }
};
