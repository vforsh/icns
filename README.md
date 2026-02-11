# icns

Agent-first CLI for Iconify icons.

- Resolve icon ids from exact or fuzzy queries
- Download SVG from Iconify API
- Rasterize to PNG
- Save full icon index locally
- Run local-first/offline lookups from index cache

## Install

```bash
bun install
bun run build
bun link
```

## Commands

```bash
icns resolve <query-or-icon> [--match exact|fuzzy] [--source auto|index|api] [--offline] [--collection mdi,simple-icons] [--prefer-prefix mdi] [--auto-select top1] [--min-score 0.45] [--format json|plain]
icns render <query-or-icon> -o <path> [--size 24] [--bg transparent] [--fg white] [--match exact|fuzzy] [--source auto|index|api] [--offline] [--collection mdi,simple-icons] [--prefer-prefix mdi] [--auto-select top1] [--force] [--dry-run] [--format json|plain]
icns search <query> [--source auto|index|api] [--offline] [--collection mdi,simple-icons] [--limit 20] [--format json|plain]
icns preview <query> [--collection all] [--no-open] [--format json|plain]
icns index sync [--concurrency 12] [--include-hidden] [--format json|plain]
icns index status [--format json|plain]
icns index clear [--format json|plain]
```

## API + Cache

- API base: `ICONES_API_BASE` (default: `https://api.iconify.design`)
- Request timeout ms: `ICONES_TIMEOUT_MS` (default: `10000`)
- Cache dir: `ICONES_CACHE_DIR` (default: `~/.cache/icns`)
- Index file: `~/.cache/icns/index.json`

## Source Modes

- `--source auto`: use local index if present; fallback to API when needed.
- `--source index`: local index only (requires `icns index sync`).
- `--source api`: API only.
- `--offline`: disable network access and force local-index behavior.
- `render --offline`: supported only with `--dry-run` (PNG rendering still needs SVG download).

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
icns index status --format json
icns index sync --concurrency 16 --format json

icns search bacon --collection simple-icons --limit 10 --format plain
icns search bacon --source index --offline --format json

icns resolve bacon --match fuzzy --collection mdi --prefer-prefix mdi --auto-select top1 --format json
icns resolve mdi:home --match exact --source index --offline --format plain

icns render simple-icons:github -o ./github.png --size 64 --force --format json
icns render bacon -o ./bacon.png --match fuzzy --source index --offline --dry-run --auto-select top1 --format json
icns render bacon -o ./bacon-red.png --size 48 --fg '#ff0000' --collection simple-icons --auto-select top1 --format json

icns preview bacon --collection all --format plain
```
