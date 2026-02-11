## General Rules
- **Runtime**: Bun + TypeScript ESM only. Keep `type: module`; keep `bin.icns -> dist/cli.js`.
- **Keep files small**: Target under ~500 LOC. Split helpers/modules before adding branches.
- **Machine-first behavior**: Default output JSON; no interactive prompts; deterministic payloads.
- **Network discipline**: Route Iconify API calls through `src/http.ts` + `src/iconify.ts`; keep timeout/error mapping consistent.
- **CLI safety**: Validate flags at parse boundary (`src/cli.ts`) before command execution.

---

## Build / Test
- **Install deps**: `bun install`.
- **Typecheck**: `bun run check`.
- **Build**: `bun run build`.
- **Help smoke**: `bun run dev -- --help`.
- **Global link refresh**: `bun link` after command surface changes.

---

## Critical Thinking
- **Root cause only**: Fix source of behavior drift; avoid quick patches in output layer unless contract bug.
- **Unknown behavior**: Reproduce via CLI command first, then inspect module owning that behavior.
- **API uncertainty**: Verify with live Iconify endpoint before changing response assumptions.
- **Unexpected repo changes**: Stop and ask if unrelated edits appear while working.

---

## Git
- **Commit style**: Conventional Commits (`feat|fix|refactor|docs|test|chore|perf|build|ci|style`).
- **Scope**: Keep one logical change per commit.
- **No destructive resets**: Never use `git reset --hard` or revert unrelated files.
- **Sync**: Push `main` only when requested; include test/build status in handoff.

---

## Repo Tour
- **CLI entry**: `src/cli.ts` (command tree, parsing, exit-code mapping).
- **Command logic**: `src/commands.ts` (resolve/search/render/preview/index behaviors).
- **HTTP/API layer**: `src/http.ts`, `src/iconify.ts`.
- **Index cache**: `src/index-cache.ts` (`~/.cache/icns/index.json` writer/reader/clear).
- **Rendering**: `@resvg/resvg-js` usage in `src/commands.ts`.
- **Output contract**: `src/output.ts`, `src/types.ts`.
- **Config/env**: `src/config.ts`.

---

## Debug Cookbook
- **Check CLI surface**: `node dist/cli.js --help`.
- **Search sanity**: `icns search bacon --limit 5 --format plain`.
- **Resolve ambiguity path**: `icns resolve bacon --match fuzzy --format json`.
- **Render smoke**: `icns render simple-icons:github -o /tmp/icns.png --size 64 --force --format json`.
- **Preview URL only**: `icns preview bacon --no-open --format plain`.
- **Index sync smoke**: `icns index sync --concurrency 16 --format json`.

---

## Golden Paths
- **Add new command**: Implement in `src/commands.ts` -> wire in `src/cli.ts` -> document in `README.md` -> run `check` + `build` + smoke command.
- **Change API behavior**: Update `src/iconify.ts` types/parsing -> map errors in command layer -> verify against live endpoint.
- **Change output schema**: Update `src/types.ts` + `src/output.ts` + affected command payloads together.
- **Change render behavior**: Keep `--size`, `--bg`, `--force`, `--dry-run` semantics stable unless explicitly versioning.

---

## Contracts / Invariants
- **Result envelope**: Keep `{ schemaVersion: 1, ok, data? | error? }` for all commands.
- **Exit codes**: Preserve mapping in `src/cli.ts` (`2 usage`, `3 not found`, `4 api`, `5 render`, `6 fs`, `7 browser`, `8 ambiguous`).
- **Plain output**: `--format plain` emits parse-friendly lines/URL/icon IDs only; errors to stderr.
- **Preview URL shape**: `https://icones.js.org/collection/<collection>?s=<query>`.
- **No hidden side effects**: Commands do only requested action; `--dry-run` never writes files.
