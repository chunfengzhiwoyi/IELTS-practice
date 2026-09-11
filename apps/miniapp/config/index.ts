import { defineConfig } from '@tarojs/cli'
import path from 'path'
import TsconfigPathsPlugin from 'tsconfig-paths-webpack-plugin'
import devConfig from './dev'
import prodConfig from './prod'

export default defineConfig<'webpack5'>(async (merge) => {
  const baseConfig = {
    projectName: 'ielts-mini',
    date: '2026-08-11',
    designWidth: 750,
    deviceRatio: {
      640: 2.34 / 2,
      750: 1,
      375: 2,
      828: 1.81 / 2,
    },
    sourceRoot: 'src',
    outputRoot: process.env.TARO_OUTPUT_ROOT || 'dist',
    plugins: ['@tarojs/plugin-framework-react'],
    defineConstants: {},
    copy: {
      patterns: [],
      options: {},
    },
    framework: 'react',
    compiler: 'webpack5',
    alias: {
      '@ielts/core$': path.resolve(__dirname, '../core/src/index.ts'),
      '@ielts/core/mini': path.resolve(__dirname, '../core/src/storage/mini.ts'),
    },
    mini: {
      postcss: {
        pxtransform: { enable: true, config: {} },
        cssModules: {
          enable: false,
          config: {
            namingPattern: 'module',
            generateScopedName: '[name]__[local]___[hash:base64:5]',
          },
        },
      },
      webpackChain(chain) {
        chain.resolve.plugin('tsconfig-paths').use(TsconfigPathsPlugin)
        chain.module
          .rule('compile-ielts-core')
          .test(/\.[jt]sx?$/)
          .include.add(path.resolve(__dirname, '../core'))
          .end()
          .use('babel-loader')
          .loader('babel-loader')
          .options({
            presets: [['taro', { framework: 'react', ts: true, compiler: 'webpack5' }]],
            configFile: false,
          })
      },
    },
    h5: {
      publicPath: '/',
      staticDirectory: 'static',
      postcss: {
        autoprefixer: { enable: true, config: {} },
        cssModules: {
          enable: false,
          config: {
            namingPattern: 'module',
            generateScopedName: '[name]__[local]___[hash:base64:5]',
          },
        },
      },
      webpackChain(chain) {
        chain.module
          .rule('compile-ielts-core')
          .test(/\.[jt]sx?$/)
          .include.add(path.resolve(__dirname, '../core'))
          .end()
          .use('babel-loader')
          .loader('babel-loader')
          .options({
            presets: [['taro', { framework: 'react', ts: true, compiler: 'webpack5' }]],
            configFile: false,
          })
      },
    },
    rn: {
      appName: 'ieltsMini',
      postcss: { cssModules: { enable: false } },
    },
  }

  if (process.env.NODE_ENV === 'development') {
    return merge({}, baseConfig, devConfig)
  }
  return merge({}, baseConfig, prodConfig)
})
