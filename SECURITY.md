# Security

## Reporting a vulnerability

Please do not open a public issue for a security problem.

Use GitHub's private reporting: **Security → Report a vulnerability** on the repository page, or email the maintainer through the profile linked in the README.

Include what you did, what you expected, what happened, and the version you used. A proof of concept helps. Please give the maintainer a reasonable amount of time to ship a fix before disclosing it publicly.

## What the project does about security

- **Least privilege.** The extension asks for `tabs`, `tabGroups`, `storage`, `sessions`, and `sidePanel`. Host permissions for AI providers are optional and requested one provider at a time.
- **No page scraping.** Tabman reads tab titles, URLs, and hostnames. It never injects scripts into pages and never reads the page body.
- **Keys stay local.** API keys live in the browser profile. They are never written to an export, a log, or a command line argument. The CLI reads them from the environment, the config directory, or an interactive prompt.
- **Signed releases.** The Python packages are published to PyPI with trusted publishing, so the workflow uses a short lived identity token instead of a stored password. The GitHub Release assets are built by the workflow, not by a laptop.
- **Pinned actions.** Every action in the workflows is pinned to a commit hash, the checkout does not persist credentials, and the release job runs without caches so a poisoned cache cannot reach a published artifact.
- **Scanning.** The pipeline runs Bandit over the Python sources, detect-secrets over the repository, pip-audit over the dependencies, actionlint over the workflows, and zizmor over the workflow security.

## Running the security checks locally

```powershell
uv run bandit -q -r src
uv run pip-audit
uv run detect-secrets-hook --baseline .secrets.baseline
uv run zizmor --persona=regular --min-severity=low .github/workflows
actionlint
```

## Hardening notes for contributors

- Never log a key, a token, or a full tab URL in a way that reaches a shared artifact.
- Never add a host permission that is not optional and justified.
- Never fetch a remote script or style at runtime.
- Keep the shared export format free of anything that identifies the machine.
