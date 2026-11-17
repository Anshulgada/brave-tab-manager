import packageJson from '../package.json';

export function getAppVersion(): string {
  try {
    const g = globalThis as {
      browser?: { runtime?: { getManifest?: () => { version?: string } } };
      chrome?: { runtime?: { getManifest?: () => { version?: string } } };
    };
    const manifest =
      g.browser?.runtime?.getManifest?.() ?? g.chrome?.runtime?.getManifest?.();
    if (manifest?.version) {
      return manifest.version;
    }
  } catch {
    // fallback
  }
  return packageJson.version;
}

export const APP_VERSION = getAppVersion();
