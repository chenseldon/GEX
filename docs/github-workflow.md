# GitHub Workflow

## Prerequisites

- `git` installed.
- `gh` installed and authenticated with `gh auth status`.
- Remote repository created or creatable by the user account.

## Version Flow

```bash
git status -sb
node --test
npm.cmd run check
git add README.md docs src test package.json .github
git commit -m "v0: bootstrap gex research platform"
git tag v0-research
git push -u origin main
git push origin v0-research
```

For feature work after V0:

```bash
git switch -c codex/v1-model-core
node --test
npm.cmd run check
git add .
git commit -m "v1: add live model core"
git push -u origin codex/v1-model-core
gh pr create --draft --fill
```

## PR Checklist

- Tests pass.
- Syntax check passes.
- Docs updated for formulas, data contracts, or user-facing behavior.
- Screenshots or notes attached for dashboard changes.
- Known limitations called out in PR body.
