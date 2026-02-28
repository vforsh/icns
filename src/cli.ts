#!/usr/bin/env node
import { Command } from "commander";
import { indexClear, indexStatus, indexSync, previewIcons, renderIcon, resolveIcon, searchIcons } from "./commands.js";
import { printResult } from "./output.js";
import type { AutoSelectMode, MatchMode, OutputFormat, SourceMode } from "./types.js";

const prefixPattern = /^[a-z0-9-]+$/i;

const parseOutputFormat = (value: string): OutputFormat => {
  if (value === "json" || value === "plain") {
    return value;
  }
  throw new Error(`Invalid --format: ${value}. Expected json|plain.`);
};

const parseMatch = (value: string): MatchMode => {
  if (value === "exact" || value === "fuzzy") {
    return value;
  }
  throw new Error(`Invalid --match: ${value}. Expected exact|fuzzy.`);
};

const parseSource = (value: string): SourceMode => {
  if (value === "auto" || value === "index" || value === "api") {
    return value;
  }
  throw new Error(`Invalid --source: ${value}. Expected auto|index|api.`);
};

const parseAutoSelect = (value: string): AutoSelectMode => {
  if (value === "top1") {
    return value;
  }
  throw new Error(`Invalid --auto-select: ${value}. Expected top1.`);
};

const parseIntStrict = (label: string, value: string): number => {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) {
    throw new Error(`${label} must be an integer.`);
  }
  return parsed;
};

const parseFloatStrict = (label: string, value: string): number => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`${label} must be a number.`);
  }
  return parsed;
};

const parsePositiveFloat = (label: string, value: string): number => {
  const parsed = parseFloatStrict(label, value);
  if (parsed <= 0) {
    throw new Error(`${label} must be a positive number.`);
  }
  return parsed;
};

const parsePrefixCsv = (label: string, value?: string): string[] | undefined => {
  if (!value) {
    return undefined;
  }

  const prefixes = value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);

  if (prefixes.length === 0) {
    throw new Error(`${label} must contain at least one prefix.`);
  }

  for (const prefix of prefixes) {
    if (!prefixPattern.test(prefix)) {
      throw new Error(`${label} contains invalid prefix: ${prefix}. Expected [a-z0-9-]+.`);
    }
  }

  return Array.from(new Set(prefixes.map((prefix) => prefix.toLowerCase())));
};

const validateSourceMode = (source: SourceMode, offline: boolean): { source: SourceMode; offline: boolean } => {
  if (offline && source === "api") {
    throw new Error("--offline cannot be used with --source api.");
  }

  return { source, offline };
};

const errorToExitCode = (code: string | undefined): number => {
  switch (code) {
    case "INVALID_USAGE":
      return 2;
    case "NOT_FOUND":
      return 3;
    case "API_ERROR":
      return 4;
    case "RENDER_ERROR":
      return 5;
    case "FS_ERROR":
    case "OUTPUT_EXISTS":
      return 6;
    case "BROWSER_ERROR":
      return 7;
    case "AMBIGUOUS":
      return 8;
    default:
      return 1;
  }
};

const program = new Command();
program
  .name("icns")
  .description("Agent-first Iconify icon resolver and PNG renderer")
  .version("0.1.3")
  .showHelpAfterError()
  .configureOutput({
    outputError: (str, write) => write(str)
  });

program
  .command("resolve")
  .description("Resolve query or icon id to canonical prefix:name")
  .argument("<query-or-icon>")
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
    const result = await resolveIcon(queryOrIcon, {
      match: parseMatch(options.match),
      source: sourceMode.source,
      offline: sourceMode.offline,
      collections: parsePrefixCsv("--collection", options.collection),
      preferPrefixes: parsePrefixCsv("--prefer-prefix", options.preferPrefix),
      autoSelect: options.autoSelect ? parseAutoSelect(options.autoSelect) : undefined,
      minScore: parseFloatStrict("--min-score", options.minScore),
      format
    });
    printResult(result, format);
    process.exitCode = result.ok ? 0 : errorToExitCode(result.error?.code);
  });

program
  .command("render")
  .description("Resolve icon and render PNG to output path")
  .argument("<query-or-icon>")
  .requiredOption("-o, --output <path>", "output png path")
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
    const result = await renderIcon(queryOrIcon, {
      output: options.output,
      size: parseIntStrict("--size", options.size),
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
    });
    printResult(result, format);
    process.exitCode = result.ok ? 0 : errorToExitCode(result.error?.code);
  });

program
  .command("search")
  .description("Search icons by query")
  .argument("<query>")
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
    const result = await searchIcons(query, {
      limit: parseIntStrict("--limit", options.limit),
      source: sourceMode.source,
      offline: sourceMode.offline,
      collections: parsePrefixCsv("--collection", options.collection),
      format
    });
    printResult(result, format);
    process.exitCode = result.ok ? 0 : errorToExitCode(result.error?.code);
  });

program
  .command("preview")
  .description("Open Ic\u00f4nes browser preview page for a query")
  .argument("<query>")
  .option("--collection <name>", "Ic\u00f4nes collection page", "all")
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
      concurrency: parseIntStrict("--concurrency", options.concurrency),
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
