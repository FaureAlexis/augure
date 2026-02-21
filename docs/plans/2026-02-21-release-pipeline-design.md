# Release Pipeline Design

## Overview

Setup the full release lifecycle for Augure: npm package publishing, CLI entry point, versioning with changesets, and GitHub Actions CI/CD.

## Decisions

| Composant | Décision |
|-----------|----------|
| Package publié | `augure` (monolith, un seul sur npm) |
| CLI location | `packages/cli/` |
| Arg parser | citty (unjs) |
| Sous-packages | Restent `private`, workspace only |
| Versioning | Changesets (semver, un seul CHANGELOG) |
| Release channels | `stable` (latest) + `beta` (pre-release mode changesets) |
| Branche par défaut | `master` |
| CI | GitHub Actions: `ci.yml` (PR) + `release.yml` (publish) |
| npm auth | `setup-node` registry-url + `NODE_AUTH_TOKEN` secret |
| Root package name | `augure-monorepo` (private, avoids collision with CLI) |
| Install | `npm install -g augure` |
| Commandes CLI | `augure init`, `augure start`, `augure --version` |
| Update | `npm update -g augure` |
| Docker | Reste disponible comme alternative d'installation |

## Architecture

```
packages/
  cli/        ← publié comme `augure` sur npm (bin entry point)
  core/       ← private, workspace only (@augure/core)
  types/      ← private, workspace only (@augure/types)
  channels/   ← private, workspace only
  memory/     ← private, workspace only
  scheduler/  ← private, workspace only
  tools/      ← private, workspace only
  sandbox/    ← private, workspace only (stub)
  skills/     ← private, workspace only (stub)
```

### CLI Package (`packages/cli/`)

```
packages/cli/
  package.json          ← name: "augure", bin: { augure: "./dist/bin.js" }
  src/
    bin.ts              ← #!/usr/bin/env node entry point
    commands/
      start.ts          ← augure start [--config path]
      init.ts           ← augure init (generates config + .env)
  tsconfig.json
  CHANGELOG.md
```

**package.json:**
```json
{
  "name": "augure",
  "version": "0.1.0",
  "type": "module",
  "bin": { "augure": "./dist/bin.js" },
  "files": ["dist"],
  "engines": { "node": ">=22.0.0" },
  "dependencies": {
    "@augure/core": "workspace:*",
    "@augure/channels": "workspace:*",
    "@augure/memory": "workspace:*",
    "@augure/scheduler": "workspace:*",
    "@augure/tools": "workspace:*",
    "citty": "^0.1"
  }
}
```

At `pnpm publish`, pnpm resolves `workspace:*` to actual versions.

### Release Flow

```
Developer flow:
  code → PR → CI (build+test+lint+typecheck) → merge master

Release flow:
  pnpm changeset              ← dev describes the change (patch/minor/major)
  merge to master
  → changeset GitHub Action opens PR "Version Packages"
  → review + merge that PR
  → CI: npm publish augure@latest + GitHub Release + git tag

Beta flow (when needed):
  pnpm changeset pre enter beta
  → merge PRs normally
  → publish augure@0.2.0-beta.1
  pnpm changeset pre exit
  → publish augure@0.2.0 (stable)
```

### GitHub Actions

**ci.yml** — triggers on PR and push to master:
```yaml
- checkout
- setup node 22 + pnpm
- pnpm install --frozen-lockfile
- pnpm build
- pnpm lint
- pnpm typecheck
- pnpm test
```

**release.yml** — triggers on push to master (after "Version Packages" PR merge):
```yaml
- checkout
- setup node 22 + pnpm + registry-url (uses NODE_AUTH_TOKEN)
- pnpm install + build + test
- changeset publish (no double-build — release script is just `changeset publish`)
- create GitHub Release + tag
```

### User Experience

```bash
# Install
npm install -g augure

# First run
augure init
# → Creates ./augure.json5 + ./.env template
# → Prints: "Edit augure.json5 and .env, then run: augure start"

# Run
augure start
augure start --config ./custom/augure.json5

# Version
augure --version

# Update
npm update -g augure
```

### Secrets Required

- `NPM_TOKEN` — npm publish token (GitHub repo secret, exposed as `NODE_AUTH_TOKEN` in release workflow)

### Post-Implementation Notes

- **No `.npmrc` committed** — npm auth handled via `setup-node` `registry-url` option in CI
- **Root package** renamed to `augure-monorepo` to avoid `pnpm --filter augure` ambiguity
- **Version in CLI** read dynamically from `package.json` at runtime (not hardcoded)
- **Tests excluded** from `dist/` via tsconfig `exclude` (not shipped to npm)
- **Error handling** in `start` command wraps `startAgent` with try/catch for clean output
