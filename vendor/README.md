# vendor/

Pre-packaged third-party runtimes bundled with this SOP distribution so
recipients can bootstrap **offline** (or behind corporate proxies that
block `registry.npmjs.org`).

## Contents

| File | Upstream | Version | License | Purpose |
|---|---|---|---|---|
| `figma-console-mcp-1.23.0.tgz` | [`figma-console-mcp`](https://www.npmjs.com/package/figma-console-mcp) | 1.23.0 | MIT | MCP server that bridges your AI agent to Figma Desktop |

The tarball is a verbatim `npm pack` of the upstream package — no patches,
no re-signing. If you want to verify integrity, compare the SHA-1:

```
shasum -a 1 figma-console-mcp-1.23.0.tgz
# should print: b12e4d519783d354775042b0763b58b9faafff58
```

## Installing

Do **not** manually extract these tarballs. Run the helper script from
the repo root, which wires everything into your agent:

```bash
node scripts/install-mcp.mjs --agent codex
```

It will:

1. Install `figma-console-mcp` from the bundled tarball (offline) or
   fall back to `npm install -g figma-console-mcp@1.23.0` if the local
   tarball is missing.
2. Register the MCP server in your agent's config (`~/.codex/mcp.json`
   or equivalent).
3. Print the Figma Desktop bridge plugin's install instructions (the
   `.tgz` also ships the `figma-desktop-bridge/` folder that must be
   imported into Figma manually — one-time per machine).

## Refreshing the bundle

To re-pack a newer upstream version:

```bash
cd vendor
rm figma-console-mcp-*.tgz
npm pack figma-console-mcp@<new-version>
# then update vendor/README.md + scripts/install-mcp.mjs tarball paths
```

## Why we bundle (and why it's OK)

- `figma-console-mcp` is MIT-licensed — redistribution is explicitly
  permitted so long as the LICENSE file is retained (it is, inside the
  tarball).
- Shipping the tarball means a recipient can onboard from a single zip
  without any npm registry access.
- We pin to an exact version so everyone on a team debugs the same MCP.
