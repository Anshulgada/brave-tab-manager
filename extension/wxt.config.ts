import { defineConfig } from 'wxt';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'Tabman',
    description:
      'A local-first switchboard and collection library for open tabs.',
    minimum_chrome_version: '114',
    permissions: ['tabs', 'tabGroups', 'storage', 'sessions', 'sidePanel'],
  },
});
