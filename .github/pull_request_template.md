## What this changes

<!-- One paragraph. What is different after this pull request? -->

## Why

<!-- The problem this solves. Link the issue. -->

## How it was checked

<!-- The commands you ran. The local gate is the same one CI runs: -->

```powershell
uv run python scripts\ci_local.py
```

## Checklist

- [ ] The change is one logical change, and the commit message explains why.
- [ ] Tests cover the new behaviour, and the suite passes without any live key.
- [ ] No secret, vault, or local build output is committed.
- [ ] `CHANGELOG.md` is updated when this is user visible.
- [ ] The version in `pyproject.toml` and `extension/package.json` still agree.
- [ ] Nothing in the interface reads the page, and no new permission was added without a reason.
