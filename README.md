# icns

Agent-first CLI for Iconify icons.

- Resolve icon IDs from exact or fuzzy queries
- Download raw SVG assets
- Rasterize PNG files (single or batch)
- Inspect collections metadata
- Run health checks for API/cache/index
- Keep a local index cache for local-first lookups

## Install

```bash
# one-off execution
npx @vforsh/icns --help
bunx @vforsh/icns --help

# global install
npm i -g @vforsh/icns
bun add -g @vforsh/icns
```

## Local Development

```bash
bun install
bun run check
bun run build
bun link
```

## Commands

```bash
icns resolve [query-or-icon] [--stdin] [--match exact|fuzzy] [--source auto|index|api] [--offline] [--collection mdi,simple-icons] [--prefer-prefix mdi] [--auto-select top1] [--min-score 0.45] [--format json|plain]
icns search [query] [--stdin] [--source auto|index|api] [--offline] [--collection mdi,simple-icons] [--limit 20] [--format json|plain]
icns render [query-or-icon] [-o <path>] [--stdin] [--size 24] [--bg transparent] [--fg <color>] [--stroke-width <value>] [--match exact|fuzzy] [--source auto|index|api] [--offline] [--collection mdi,simple-icons] [--prefer-prefix mdi] [--auto-select top1] [--force] [--dry-run] [--format json|plain]
icns render-many <manifest> [--concurrency 4] [--fail-fast] [render defaults...] [--format json|plain]
icns fetch <query-or-icon> -o <path.svg> [resolve flags...] [--force] [--format json|plain]
icns preview <query> [--collection all] [--no-open] [--format json|plain]
icns collections list [--source auto|index|api] [--offline] [--limit 0] [--format json|plain]
icns collections info <prefix> [--source auto|index|api] [--offline] [--icons-limit 20] [--format json|plain]
icns doctor [--offline] [--format json|plain]
icns index sync [--concurrency 12] [--include-hidden] [--format json|plain]
icns index status [--format json|plain]
icns index clear [--format json|plain]
```

## Render-Many Manifest

`render-many` accepts JSON or CSV.

JSON (`items` array or raw array):

```json
[
  { "query": "simple-icons:github", "output": "./icons/github.png", "size": 64 },
  { "queryOrIcon": "bacon", "output": "./icons/bacon.png", "match": "fuzzy", "autoSelect": "top1" }
]
```

CSV (headers map to item fields):

```csv
query,output,size,match,autoSelect
simple-icons:github,./icons/github.png,64,exact,
bacon,./icons/bacon.png,48,fuzzy,top1
```

## Stdin Modes

- `resolve --stdin`: newline-separated queries
- `search --stdin`: newline-separated queries
- `render --stdin`: tab-separated lines: `<query-or-icon>\t<output-path>`

Examples:

```bash
printf "bacon\nmdi:home\n" | icns resolve --stdin --match fuzzy --auto-select top1 --format json
printf "bacon\nheart\n" | icns search --stdin --limit 5 --format json
printf "simple-icons:github\t/tmp/gh.png\n" | icns render --stdin --size 64 --force --format json
```

## API + Cache

- API base: `ICONES_API_BASE` (default: `https://api.iconify.design`)
- Request timeout ms: `ICONES_TIMEOUT_MS` (default: `10000`)
- Cache dir: `ICONES_CACHE_DIR` (default: `~/.cache/icns`)
- Index file: `~/.cache/icns/index.json`

## Source Modes

- `--source auto`: use local index if present; fallback to API.
- `--source index`: local index only (`icns index sync` required).
- `--source api`: API only.
- `--offline`: disable network and force local-index behavior.
- `render --offline`: supported only with `--dry-run`.
- `fetch --offline`: not supported (fetch always downloads SVG).

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
icns index sync --concurrency 16 --format json
icns search bacon --collection simple-icons --limit 10 --format plain
icns resolve bacon --match fuzzy --auto-select top1 --format json
icns render simple-icons:github -o ./github.png --size 64 --force --format json
icns fetch simple-icons:github -o ./github.svg --force --format json
icns render-many ./manifest.json --concurrency 8 --format json
icns collections list --limit 20 --format json
icns collections info simple-icons --icons-limit 5 --format json
icns doctor --format json
```

