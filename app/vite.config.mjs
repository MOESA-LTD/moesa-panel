import { PrimeVueResolver } from '@primevue/auto-import-resolver';
import vue from '@vitejs/plugin-vue';
import lodash from 'lodash';
import * as path from 'node:path';
import AutoImport from 'unplugin-auto-import/vite';
import Components from 'unplugin-vue-components/vite';
import viteCompression from 'vite-plugin-compression';
import packageVersion from 'vite-plugin-package-version';

import { defineConfig } from 'vite';

export default defineConfig({
   build: {
      target: 'esnext',
      modulePreload: true,
      minify: 'esbuild',
      assetsInlineLimit: 2048,
      rollupOptions: {
         output: {
            chunkFileNames: 'assets/chunk.[name].[hash].js',
            entryFileNames: 'assets/[name].[hash].js',
            assetFileNames: 'assets/[name].[hash].[ext]'
         }
      },
      dynamicImportVarsOptions: {
         warnOnError: true,
         exclude: []
      },
      commonjsOptions: {
         transformMixedEsModules: true
      }
   },
   server: {
      port: 6161,
      watch: {
         usePolling: true
      }
   },
   plugins: [
      viteCompression({ algorithm: 'brotliCompress', ext: '.br' }),
      viteCompression({ algorithm: 'gzip', ext: '.gz' }),
      packageVersion(),
      vue(),
      Components({ resolvers: [PrimeVueResolver()] }),
      AutoImport({
         vueTemplate: true,
         defaultExportByFilename: true,
         imports: [
            'vue',
            'vue-router',
            '@vueuse/core',
            'pinia',
            'vue-i18n',
            {
               from: '@primevue/core/api',
               imports: [
                  'FilterMatchMode',
                  'FilterOperator',
                  'FilterService',
                  'PrimeIcons',
                  'ToastSeverity'
               ]
            },
            {
               from: '@lib/supabase',
               imports: ['supabase']
            },
            {
               from: '@composables/useLayout',
               imports: [['default', 'useLayout']]
            },
            {
               from: '@store/index.js',
               imports: ['useAuthStore', 'useAccountStore']
            },
            {
               from: '@plugins/i18n',
               imports: ['locale', 'loadLocaleMessages', 'SUPPORTED_LOCALES', ['default', 'i18n']]
            },
            {
               from: '@plugins/mitt',
               imports: ['emitter']
            },
            {
               from: 'lodash',
               imports: lodash
                  .toPairs(lodash)
                  .filter(([, value]) => typeof value == 'function')
                  .map(([key]) => [key, '_' + key])
            }
         ],
         eslintrc: {
            enabled: true
         }
      })
   ],
   resolve: {
      alias: {
         '@': path.resolve(__dirname, 'src'),
         '@assets': path.resolve(__dirname, 'src/assets'),
         '@style': path.resolve(__dirname, 'src/assets/style'),
         '@plugins': path.resolve(__dirname, 'src/plugins'),
         '@components': path.resolve(__dirname, 'src/components'),
         '@store': path.resolve(__dirname, 'src/store'),
         '@lib': path.resolve(__dirname, 'src/lib'),
         '@services': path.resolve(__dirname, 'src/services'),
         '@composables': path.resolve(__dirname, 'src/composables'),
         '@types': path.resolve(__dirname, 'src/@types')
      }
   },
   optimizeDeps: {
      include: ['vue', 'vue-router', '@vueuse/core', 'pinia', '@primevue/core/api', 'lodash']
   }
});
