const path = require('path')
const webpack = require('webpack')

module.exports = {
  target: 'node',
  entry: './src/index.ts',
  devtool: 'source-map',
  context: __dirname,
  mode: process.env.NODE_ENV === 'production' ? 'production' : 'development',
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'index.js',
    libraryTarget: 'commonjs2',
    devtoolModuleFilenameTemplate: 'webpack-tabby-secure-workbench:///[resource-path]',
  },
  resolve: {
    modules: ['.', 'src', 'node_modules'].map(x => path.join(__dirname, x)),
    extensions: ['.ts', '.js', '.json', '.scss', '.css', '.html'],
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        loader: 'ts-loader',
        options: {
          configFile: path.resolve(__dirname, 'tsconfig.json'),
        },
      },
      {
        test: /\.scss$/,
        use: ['style-loader', 'css-loader', 'sass-loader'],
      },
      {
        test: /\.css$/,
        use: ['style-loader', 'css-loader'],
      },
      {
        test: /\.html$/,
        type: 'asset/source',
      },
    ],
  },
  externals: [
    'fs',
    'path',
    'os',
    'crypto',
    'net',
    'stream',
    'readline',
    'electron',
    /^rxjs/,
    /^@angular/,
    /^tabby-/,
  ],
  plugins: [
    new webpack.DefinePlugin({
      __WORKBENCH_BUILD_TIME__: JSON.stringify(new Date().toISOString()),
    }),
  ],
}
