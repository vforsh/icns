#!/usr/bin/env node
import { Command } from "commander";
import {
  errorToExitCode,
  parseAutoSelect,
  parseFloatStrict,
  parseIntStrict,
  parseMatch,
  parseOutputFormat,
  parsePositiveFloat,
  parsePositiveInt,
  parsePrefixCsv,
  parseRenderStdinLine,
  parseSource,
  readNonEmptyStdinLines,
  requireArgument,
  updateBatchExitCode,
  validateSourceMode
} from "./cli-utils.js";
import {
  indexClear,
  indexStatus,
  indexSync,
  previewIcons,
  renderIcon,
  resolveIcon,
  searchIcons
} from "./commands.js";
import { collectionInfo, doctor, fetchIcon, listCollections, renderMany } from "./extra-commands.js";
import { printResult } from "./output.js";

const program = new Command();
program
  .name("icns")
  .description("Agent-first Iconify icon resolver and PNG renderer")
  .version("0.2.0")
  .showHelpAfterError()
  .configureOutput({
    outputError: (str, write) => write(str)
  });

program
  .command("resolve")
  .description("Resolve query or icon id to canonical prefix:name")
  .argument("[query-or-icon]")
  .option("--stdin", "read newline-separated queries from stdin")
  .option("--match <mode>", "exact|fuzzy", "exact")
  .option("--source <mode>", "auto|index|api", "auto")
  .option("--offline", "disable network and use local index only", false)
  .option("--collection <prefixes>", "comma-separated collection prefixes")
  .option("--prefer-prefix <prefixes>", "comma-separated prefixes to boost in fuzzy mode")
  .option("--auto-select <mode>", "top1")
  .option("--min-score <value>", "minimum fuzzy score", "0.45")
  .option("--format <format>", "json|plain", "json")
  .action(async (queryOrIcon, options) => {
    const format = parseOutputFormat(options.format);
    const source = parseSource(options.source);
    const offline = Boolean(options.offline);
    const sourceMode = validateSourceMode(source, offline);
    const parsed = {
      match: parseMatch(options.match),
      source: sourceMode.source,
      offline: sourceMode.offline,
      collections: parsePrefixCsv("--collection", options.collection),
      preferPrefixes: parsePrefixCsv("--prefer-prefix", options.preferPrefix),
      autoSelect: options.autoSelect ? parseAutoSelect(options.autoSelect) : undefined,
      minScore: parseFloatStrict("--min-score", options.minScore),
      format
    };

    if (options.stdin) {
      if (queryOrIcon) {
        throw new Error("Positional <query-or-icon> cannot be used with --stdin.");
      }

      const lines = await readNonEmptyStdinLines();
      let exitCode = 0;
      for (const line of lines) {
        const result = await resolveIcon(line, parsed);
        printResult(result, format);
        exitCode = updateBatchExitCode(exitCode, result);
      }
      process.exitCode = exitCode;
      return;
    }

    const result = await resolveIcon(requireArgument(queryOrIcon, "query-or-icon"), parsed);
    printResult(result, format);
    process.exitCode = result.ok ? 0 : errorToExitCode(result.error?.code);
  });

program
  .command("render")
  .description("Resolve icon and render PNG to output path")
  .argument("[query-or-icon]")
  .option("-o, --output <path>", "output png path")
  .option("--stdin", "read tab-separated lines from stdin: <query-or-icon>\\t<output-path>")
  .option("--size <px>", "png width/height", "24")
  .option("--bg <color>", "background color", "transparent")
  .option("--fg <color>", "foreground icon color (default: preserve original colors)")
  .option("--stroke-width <value>", "override SVG stroke width for stroked icons")
  .option("--match <mode>", "exact|fuzzy", "exact")
  .option("--source <mode>", "auto|index|api", "auto")
  .option("--offline", "disable network and use local index only", false)
  .option("--collection <prefixes>", "comma-separated collection prefixes")
  .option("--prefer-prefix <prefixes>", "comma-separated prefixes to boost in fuzzy mode")
  .option("--auto-select <mode>", "top1")
  .option("--min-score <value>", "minimum fuzzy score", "0.45")
  .option("--force", "overwrite existing file", false)
  .option("--dry-run", "no file write", false)
  .option("--format <format>", "json|plain", "json")
  .action(async (queryOrIcon, options) => {
    const format = parseOutputFormat(options.format);
    const source = parseSource(options.source);
    const offline = Boolean(options.offline);
    const sourceMode = validateSourceMode(source, offline);
    const baseParsed = {
      size: parsePositiveInt("--size", options.size),
      bg: options.bg,
      fg: options.fg,
      strokeWidth: options.strokeWidth === undefined ? undefined : parsePositiveFloat("--stroke-width", options.strokeWidth),
      match: parseMatch(options.match),
      source: sourceMode.source,
      offline: sourceMode.offline,
      collections: parsePrefixCsv("--collection", options.collection),
      preferPrefixes: parsePrefixCsv("--prefer-prefix", options.preferPrefix),
      autoSelect: options.autoSelect ? parseAutoSelect(options.autoSelect) : undefined,
      minScore: parseFloatStrict("--min-score", options.minScore),
      force: Boolean(options.force),
      dryRun: Boolean(options.dryRun),
      format
    };

    if (options.stdin) {
      if (queryOrIcon) {
        throw new Error("Positional <query-or-icon> cannot be used with --stdin.");
      }

      const lines = await readNonEmptyStdinLines();
      const parsedLines = lines.map((line, index) => parseRenderStdinLine(line, index));
      let exitCode = 0;

      for (const entry of parsedLines) {
        const result = await renderIcon(entry.queryOrIcon, {
          ...baseParsed,
          output: entry.output
        });
        printResult(result, format);
        exitCode = updateBatchExitCode(exitCode, result);
      }

      process.exitCode = exitCode;
      return;
    }

    const output = requireArgument(options.output, "--output");
    const result = await renderIcon(requireArgument(queryOrIcon, "query-or-icon"), {
      output,
      ...baseParsed
    });
    printResult(result, format);
    process.exitCode = result.ok ? 0 : errorToExitCode(result.error?.code);
  });

program
  .command("render-many")
  .description("Render many icons from JSON or CSV manifest")
  .argument("<manifest>", "path to manifest file")
  .option("--size <px>", "default png width/height", "24")
  .option("--bg <color>", "default background color", "transparent")
  .option("--fg <color>", "default foreground icon color")
  .option("--stroke-width <value>", "default stroke width for stroked icons")
  .option("--match <mode>", "exact|fuzzy", "exact")
  .option("--source <mode>", "auto|index|api", "auto")
  .option("--offline", "disable network and use local index only", false)
  .option("--collection <prefixes>", "default comma-separated collection prefixes")
  .option("--prefer-prefix <prefixes>", "default comma-separated prefixes to boost in fuzzy mode")
  .option("--auto-select <mode>", "top1")
  .option("--min-score <value>", "default minimum fuzzy score", "0.45")
  .option("--force", "overwrite existing files", false)
  .option("--dry-run", "no file writes", false)
  .option("--concurrency <n>", "parallel render workers", "4")
  .option("--fail-fast", "stop processing on first failure", false)
  .option("--format <format>", "json|plain", "json")
  .action(async (manifest, options) => {
    const format = parseOutputFormat(options.format);
    const source = parseSource(options.source);
    const offline = Boolean(options.offline);
    const sourceMode = validateSourceMode(source, offline);
    const result = await renderMany({
      manifestPath: manifest,
      size: parsePositiveInt("--size", options.size),
      bg: options.bg,
      fg: options.fg,
      strokeWidth: options.strokeWidth === undefined ? undefined : parsePositiveFloat("--stroke-width", options.strokeWidth),
      match: parseMatch(options.match),
      source: sourceMode.source,
      offline: sourceMode.offline,
      collections: parsePrefixCsv("--collection", options.collection),
      preferPrefixes: parsePrefixCsv("--prefer-prefix", options.preferPrefix),
      autoSelect: options.autoSelect ? parseAutoSelect(options.autoSelect) : undefined,
      minScore: parseFloatStrict("--min-score", options.minScore),
      force: Boolean(options.force),
      dryRun: Boolean(options.dryRun),
      concurrency: parsePositiveInt("--concurrency", options.concurrency),
      failFast: Boolean(options.failFast),
      format
    });
    printResult(result, format);
    process.exitCode = result.ok ? 0 : errorToExitCode(result.error?.code);
  });

program
  .command("fetch")
  .description("Resolve icon and download raw SVG")
  .argument("<query-or-icon>")
  .requiredOption("-o, --output <path>", "output svg path")
  .option("--match <mode>", "exact|fuzzy", "exact")
  .option("--source <mode>", "auto|index|api", "auto")
  .option("--offline", "disable network and use local index only", false)
  .option("--collection <prefixes>", "comma-separated collection prefixes")
  .option("--prefer-prefix <prefixes>", "comma-separated prefixes to boost in fuzzy mode")
  .option("--auto-select <mode>", "top1")
  .option("--min-score <value>", "minimum fuzzy score", "0.45")
  .option("--force", "overwrite existing file", false)
  .option("--format <format>", "json|plain", "json")
  .action(async (queryOrIcon, options) => {
    const format = parseOutputFormat(options.format);
    const source = parseSource(options.source);
    const offline = Boolean(options.offline);
    const sourceMode = validateSourceMode(source, offline);
    const result = await fetchIcon(queryOrIcon, {
      output: options.output,
      match: parseMatch(options.match),
      source: sourceMode.source,
      offline: sourceMode.offline,
      collections: parsePrefixCsv("--collection", options.collection),
      preferPrefixes: parsePrefixCsv("--prefer-prefix", options.preferPrefix),
      autoSelect: options.autoSelect ? parseAutoSelect(options.autoSelect) : undefined,
      minScore: parseFloatStrict("--min-score", options.minScore),
      force: Boolean(options.force),
      format
    });
    printResult(result, format);
    process.exitCode = result.ok ? 0 : errorToExitCode(result.error?.code);
  });

program
  .command("search")
  .description("Search icons by query")
  .argument("[query]")
  .option("--stdin", "read newline-separated queries from stdin")
  .option("--source <mode>", "auto|index|api", "auto")
  .option("--offline", "disable network and use local index only", false)
  .option("--collection <prefixes>", "comma-separated collection prefixes")
  .option("--limit <n>", "max results", "20")
  .option("--format <format>", "json|plain", "json")
  .action(async (query, options) => {
    const format = parseOutputFormat(options.format);
    const source = parseSource(options.source);
    const offline = Boolean(options.offline);
    const sourceMode = validateSourceMode(source, offline);
    const parsed = {
      limit: parsePositiveInt("--limit", options.limit),
      source: sourceMode.source,
      offline: sourceMode.offline,
      collections: parsePrefixCsv("--collection", options.collection),
      format
    };

    if (options.stdin) {
      if (query) {
        throw new Error("Positional <query> cannot be used with --stdin.");
      }

      const lines = await readNonEmptyStdinLines();
      let exitCode = 0;
      for (const line of lines) {
        const result = await searchIcons(line, parsed);
        printResult(result, format);
        exitCode = updateBatchExitCode(exitCode, result);
      }
      process.exitCode = exitCode;
      return;
    }

    const result = await searchIcons(requireArgument(query, "query"), parsed);
    printResult(result, format);
    process.exitCode = result.ok ? 0 : errorToExitCode(result.error?.code);
  });

program
  .command("preview")
  .description("Open Icônes browser preview page for a query")
  .argument("<query>")
  .option("--collection <name>", "Icônes collection page", "all")
  .option("--no-open", "print URL without opening browser")
  .option("--format <format>", "json|plain", "json")
  .action(async (query, options) => {
    const format = parseOutputFormat(options.format);
    const result = await previewIcons(query, {
      collection: options.collection,
      open: Boolean(options.open),
      format
    });
    printResult(result, format);
    process.exitCode = result.ok ? 0 : errorToExitCode(result.error?.code);
  });

const collectionsCommand = program.command("collections").description("Inspect Iconify collections");

collectionsCommand
  .command("list")
  .description("List available collections and icon counts")
  .option("--source <mode>", "auto|index|api", "auto")
  .option("--offline", "disable network and use local index only", false)
  .option("--limit <n>", "max collections (0 = all)", "0")
  .option("--format <format>", "json|plain", "json")
  .action(async (options) => {
    const format = parseOutputFormat(options.format);
    const source = parseSource(options.source);
    const offline = Boolean(options.offline);
    const sourceMode = validateSourceMode(source, offline);
    const result = await listCollections({
      source: sourceMode.source,
      offline: sourceMode.offline,
      limit: parseIntStrict("--limit", options.limit),
      format
    });
    printResult(result, format);
    process.exitCode = result.ok ? 0 : errorToExitCode(result.error?.code);
  });

collectionsCommand
  .command("info")
  .description("Show details for one collection")
  .argument("<prefix>")
  .option("--source <mode>", "auto|index|api", "auto")
  .option("--offline", "disable network and use local index only", false)
  .option("--icons-limit <n>", "sample icon limit", "20")
  .option("--format <format>", "json|plain", "json")
  .action(async (prefix, options) => {
    const format = parseOutputFormat(options.format);
    const source = parseSource(options.source);
    const offline = Boolean(options.offline);
    const sourceMode = validateSourceMode(source, offline);
    const result = await collectionInfo(prefix, {
      source: sourceMode.source,
      offline: sourceMode.offline,
      iconsLimit: parsePositiveInt("--icons-limit", options.iconsLimit),
      format
    });
    printResult(result, format);
    process.exitCode = result.ok ? 0 : errorToExitCode(result.error?.code);
  });

program
  .command("doctor")
  .description("Run health checks for API, cache, and local index")
  .option("--offline", "skip API reachability checks", false)
  .option("--format <format>", "json|plain", "json")
  .action(async (options) => {
    const format = parseOutputFormat(options.format);
    const result = await doctor({
      offline: Boolean(options.offline),
      format
    });
    printResult(result, format);
    process.exitCode = result.ok ? 0 : errorToExitCode(result.error?.code);
  });

const indexCommand = program.command("index").description("Manage icon index cache");

indexCommand
  .command("sync")
  .description("Sync icon index from Iconify API")
  .option("--concurrency <n>", "parallel collection fetches", "12")
  .option("--include-hidden", "include hidden icons and aliases", false)
  .option("--format <format>", "json|plain", "json")
  .action(async (options) => {
    const format = parseOutputFormat(options.format);
    const result = await indexSync({
      concurrency: parsePositiveInt("--concurrency", options.concurrency),
      includeHidden: Boolean(options.includeHidden)
    });
    printResult(result, format);
    process.exitCode = result.ok ? 0 : errorToExitCode(result.error?.code);
  });

indexCommand
  .command("status")
  .description("Show local index cache status")
  .option("--format <format>", "json|plain", "json")
  .action(async (options) => {
    const format = parseOutputFormat(options.format);
    const result = await indexStatus();
    printResult(result, format);
    process.exitCode = result.ok ? 0 : errorToExitCode(result.error?.code);
  });

indexCommand
  .command("clear")
  .description("Clear local index cache")
  .option("--format <format>", "json|plain", "json")
  .action(async (options) => {
    const format = parseOutputFormat(options.format);
    const result = await indexClear();
    printResult(result, format);
    process.exitCode = result.ok ? 0 : errorToExitCode(result.error?.code);
  });

program.parseAsync(process.argv).catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(2);
});
