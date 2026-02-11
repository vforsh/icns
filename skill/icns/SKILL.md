---
name: icns
description: Resolve, preview, search, and render Iconify icons with the `icns` CLI. Use when an agent or CLI consumer needs to find icon IDs, inspect matches in a browser, or produce PNG files from SVG icons at a target path.
---

# icns

Use machine-first flows. Prefer `--format json` for automation.

## Command Summary

- `icns search <query>`: return matching icon IDs from Iconify API.
- `icns preview <query>`: open browser preview page for visual selection.
- `icns resolve <query-or-icon>`: convert query to a canonical `prefix:name` icon ID.
- `icns render <query-or-icon> -o <path>`: fetch SVG and save PNG.
- `icns index sync|clear`: manage local index cache.

## Typical Flows

### 1) Find candidate icon IDs

```bash
icns search bacon --limit 20 --format plain
```

### 2) Preview matches in browser

```bash
icns preview bacon --collection all
```

Print preview URL without opening browser:

```bash
icns preview bacon --collection all --no-open --format plain
```

### 3) Resolve to one icon ID

Exact mode:

```bash
icns resolve mdi:home --match exact --format plain
```

Fuzzy mode, fail on ambiguity:

```bash
icns resolve bacon --match fuzzy --format json
```

Fuzzy mode, auto-pick best result:

```bash
icns resolve bacon --match fuzzy --auto-select top1 --format plain
```

### 4) Render PNG

Render by exact icon ID:

```bash
icns render simple-icons:github -o ./github.png --size 64 --force --format json
```

Render from fuzzy query:

```bash
icns render bacon -o ./bacon.png --match fuzzy --auto-select top1 --size 48 --format json
```

Dry run without writing file:

```bash
icns render bacon -o ./bacon.png --match fuzzy --auto-select top1 --dry-run --format json
```

## Key Flags

- `--format json|plain`: machine payload vs line output.
- `--match exact|fuzzy`: strict ID check vs query matching.
- `--auto-select top1`: required for deterministic fuzzy auto-pick.
- `--size <px>`: PNG output size.
- `--bg <color>`: PNG background color (`transparent` by default).
- `--force`: overwrite output file.
- `--dry-run`: return plan only, no write.

## Exit Codes

- `0`: success.
- `2`: invalid usage.
- `3`: not found.
- `4`: API/network error.
- `5`: render error.
- `6`: filesystem/output error.
- `7`: browser open error.
- `8`: ambiguous fuzzy match.

## Environment Variables

- `ICONES_API_BASE`: Iconify API base URL.
- `ICONES_TIMEOUT_MS`: request timeout in milliseconds.
- `ICONES_CACHE_DIR`: local cache directory.

## Deterministic Agent Pattern

1. `search` or `preview` to inspect options.
2. `resolve` to lock final icon ID.
3. `render` with explicit `--size`, `--force`/`--dry-run`, and `--format json`.
