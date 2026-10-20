# Privacy

Tabman is local first. It does not have accounts, servers, analytics, or telemetry.

## What is stored

| Data                                        | Where                                                                              | Why                                                          |
| ------------------------------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| Saved collections, tags, and tabs           | IndexedDB in the browser profile                                                   | The library you see in the dashboard                         |
| Provider profiles (name, base URL, model)   | `chrome.storage.local` in the browser profile                                      | So you do not retype them                                    |
| API key                                     | `chrome.storage.session` by default, `chrome.storage.local` only if you ask for it | The key never reaches the Tabman codebase or a Tabman server |
| Application settings (theme, view, privacy) | IndexedDB with the library                                                         | The preferences you set                                      |
| Vault, configuration, and secrets           | Your own machine, in the paths listed in the README                                | The Python CLI is a local tool                               |

The browser profile storage is not an operating system keychain. Anyone with access to the profile can read it, which is why the API key lives in session storage unless you explicitly choose to remember it.

## What leaves the machine

Only what you ask for:

- **Opening a tab or restoring a collection** asks the browser to open the URL you saved.
- **The organizer** sends the titles and hostnames of your open tabs to the provider you configured, plus the full URLs when you turn that on. Nothing is sent to any other host, and Tabman never reads the page body.
- **The CLI** never phones home. `tabman organize` sends the same fields to the provider you configured.

The extension requests host permissions only for the provider you pick, at the moment you use it, and you can remove that permission in the browser settings at any time.

## What is never collected

- No usage analytics, crash reports, or telemetry.
- No page content, no browsing history outside the browser profile, no screenshots.
- No keys in URLs, logs, or the shared export format. Exports carry tabs, tags, collections, and proposals only.

## Removing your data

- Clear the library from the dashboard by moving the collections to the trash and then deleting them forever.
- Forget the API key with the button in the provider panel, or remove the host permission in the browser settings.
- Delete the CLI vault, configuration, and secrets files listed in the README.
- Uninstalling the extension removes its IndexedDB and storage with the profile.

## Reporting a privacy problem

Please open a security issue as described in [SECURITY.md](SECURITY.md).
