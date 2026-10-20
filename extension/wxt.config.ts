import { defineConfig } from 'wxt';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  outDir: 'output',
  manifest: {
    name: 'Tabman',
    description:
      'A local-first switchboard and collection library for open tabs.',
    minimum_chrome_version: '114',
    permissions: ['tabs', 'tabGroups', 'storage', 'sessions', 'sidePanel'],
    optional_host_permissions: [
      'https://*/*',
      'http://localhost/*',
      'http://127.0.0.1/*',
    ],
    icons: {
      16: 'icon-16.png',
      32: 'icon-32.png',
      48: 'icon-48.png',
      128: 'icon-128.png',
    },
    action: {
      default_title: 'Open the Tabman library',
      default_icon: {
        16: 'icon-16.png',
        32: 'icon-32.png',
        48: 'icon-48.png',
        128: 'icon-128.png',
      },
    },
  },
});
