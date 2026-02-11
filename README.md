# icns

Agent-first CLI for Iconify icons.

- Resolve icon ids from exact or fuzzy queries
- Download SVG from Iconify API
- Rasterize to PNG
- Save full icon index locally

## Install

```bash
bun install
bun run build
bun link
```

## Commands

```bash
icns resolve <query-or-icon> [--match exact|fuzzy] [--auto-select top1] [--min-score 0.45] [--format json|plain]
icns render <query-or-icon> -o <path> [--size 24] [--bg transparent] [--match exact|fuzzy] [--auto-select top1] [--force] [--dry-run] [--format json|plain]
icns search <query> [--limit 20] [--format json|plain]
icns preview <query> [--collection all] [--no-open] [--format json|plain]
icns index sync [--concurrency 12] [--include-hidden] [--format json|plain]
icns index clear [--format json|plain]
```

## API + Cache

- API base: `ICONES_API_BASE` (default: `https://api.iconify.design`)
- Request timeout ms: `ICONES_TIMEOUT_MS` (default: `10000`)
- Cache dir: `ICONES_CACHE_DIR` (default: `~/.cache/icns`)
- Index file: `~/.cache/icns/index.json`

## Exit Codes

- `0` success
- `2` invalid usage
- `3` not found
- `4` API/network error
- `5` render error
- `6` filesystem/output error
- `7` browser open error
- `8` ambiguous match

## Examples

```bash
icns search bacon --limit 10 --format plain
icns resolve bacon --match fuzzy --auto-select top1 --format json
icns resolve mdi:home --match exact --format plain
icns render simple-icons:github -o ./github.png --size 64 --force --format json
icns preview bacon --collection all --format plain
icns preview bacon --no-open --format json
icns index sync --concurrency 16 --format json
```
