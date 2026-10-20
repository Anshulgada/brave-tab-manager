# Dos and don'ts

A short list of the things that have bitten this project, and the habits that avoid them.

## The browser

- **Do** keep the extension local. No accounts, no telemetry, no page content.
- **Do** treat a host permission as something you ask for one provider at a time, and drop it when the provider is gone.
- **Don't** add a content script. Tabman reads tab metadata, never the page.
- **Don't** widen the permissions because a feature is easier that way. The permission list is a promise to the user.
- **Do** close the tabs you parked, and tell the user when you could not.

## Secrets

- **Do** read a key from the environment, the config directory, or an interactive prompt.
- **Don't** accept a key as a command line argument. It lands in the shell history and in the process list.
- **Don't** put a key in an export, a log, a crash report, or a test fixture.
- **Do** default the browser key to session storage, and offer a forget button.

## The vault

- **Do** write the vault through a transaction, so a failure leaves the file as it was.
- **Do** merge by the stable identifiers, so an import is idempotent.
- **Don't** read a whole document when a query can do the work. The search and the Markdown export read the collection rows only.
- **Do** keep the schema, the Pydantic mirror, and the Zod mirror in step. The contract tests exist for that.

## The interface

- **Do** make the destructive action the one that needs a confirmation, and put the confirmation in the interface.
- **Do** show the state while something is in flight. A silent button is a broken button.
- **Do** let the keyboard work. Arrows to move, space to select, escape to leave, `Ctrl` or `Cmd` plus `K` for the palette.
- **Don't** truncate the one thing the user needs. Let the row grow, and wrap the text.

## The release

- **Do** keep the version in `pyproject.toml` and mirror it in the extension.
- **Do** tag the version, and let the workflow publish. The tag must match the project version or the release fails on purpose.
- **Don't** publish from a laptop with a stored token. The workflow uses trusted publishing.
- **Do** run the local gate before you push. It is the same gate the workflow runs.

## The repository

- **Do** commit one logical change with a message that explains why.
- **Do** keep the lockfiles in the same commit as the dependency change.
- **Don't** check in build output, vaults, keys, or local vaults.
- **Do** update the changelog in the last commit of a batch.
