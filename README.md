# icns

Agent-first CLI to resolve Iconify icons and render PNGs.

## Status

Scaffold with stable command surface and machine-oriented JSON contract. `render` currently returns a planned action payload; API integration and rasterization are not implemented yet.

## Commands

- `icns resolve <query-or-icon>`
- `icns render <query-or-icon> -o <path>`
- `icns search <query>`
- `icns index sync`
- `icns index clear`

## Local development

```bash
bun install
bun run check
bun run dev -- --help
```
