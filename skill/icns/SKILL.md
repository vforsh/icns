---
name: icns
description: Resolve, preview, search, fetch, and render Iconify icons with the `icns` CLI. Use when an agent needs icon IDs, browser preview URLs, raw SVG files, PNG output, collection metadata, or health diagnostics.
---

# icns

Machine-first default. Prefer `--format json`.

## Command Summary

- `icns search <query>`: ranked icon IDs.
- `icns resolve <query-or-icon>`: canonical `prefix:name` resolution.
- `icns preview <query>`: Icônes browser URL/open action.
- `icns fetch <query-or-icon> -o <file.svg>`: raw SVG download.
- `icns render <query-or-icon> -o <file.png>`: single PNG render.
- `icns render-many <manifest>`: JSON/CSV batch render.
- `icns collections list|info`: collection discovery and metadata.
- `icns doctor`: API/cache/index health checks.
- `icns index sync|status|clear`: local index lifecycle.

## Typical Flows

### 1) Candidate IDs

```bash
icns search bacon --limit 20 --format plain
```

### 2) Visual preview

```bash
icns preview bacon --collection all --no-open --format plain
```

### 3) Lock final icon ID

```bash
icns resolve bacon --match fuzzy --auto-select top1 --format json
```

### 4) Download SVG or render PNG

```bash
icns fetch simple-icons:github -o ./github.svg --force --format json
icns render simple-icons:github -o ./github.png --size 64 --force --format json
```

### 5) Batch render

```bash
icns render-many ./icons.json --concurrency 8 --format json
```

### 6) Collection lookup + health

```bash
icns collections list --limit 25 --format json
icns collections info simple-icons --icons-limit 10 --format json
icns doctor --format json
```

## Stdin Modes

- `resolve --stdin`: newline-delimited queries.
- `search --stdin`: newline-delimited queries.
- `render --stdin`: tab-delimited `<query-or-icon>\t<output-path>`.

```bash
printf "bacon\nmdi:home\n" | icns resolve --stdin --match fuzzy --auto-select top1 --format json
printf "simple-icons:github\t/tmp/github.png\n" | icns render --stdin --size 64 --force --format json
```

## Key Flags

- `--format json|plain`: envelope JSON vs line output.
- `--source auto|index|api`: source selection.
- `--offline`: local-index-only mode.
- `--match exact|fuzzy`: exact ID check vs fuzzy ranking.
- `--auto-select top1`: deterministic fuzzy auto-pick.
- `--collection`: constrain allowed prefixes.
- `--prefer-prefix`: boost fuzzy scores for prefixes.
- `--dry-run`: no file writes (render/render-many).

## Exit Codes

- `0` success
- `2` invalid usage
- `3` not found
- `4` API/network error
- `5` render error
- `6` filesystem/output error
- `7` browser open error
- `8` ambiguous fuzzy match

## Environment Variables

- `ICONES_API_BASE`: API base URL.
- `ICONES_TIMEOUT_MS`: request timeout in ms.
- `ICONES_CACHE_DIR`: cache directory.

## Deterministic Agent Pattern

1. `search` or `preview` to inspect candidates.
2. `resolve` to lock icon ID.
3. `fetch` or `render` with explicit flags and `--format json`.

