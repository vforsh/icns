#!/usr/bin/env node
import { Command } from "commander";
import { indexClear, indexSync, renderIcon, resolveIcon, searchIcons } from "./commands.js";
import { printResult } from "./output.js";
import type { OutputFormat } from "./types.js";

const parseOutputFormat = (value: string): OutputFormat => (value === "plain" ? "plain" : "json");

const program = new Command();
program
  .name("icns")
  .description("Agent-first Iconify icon resolver and PNG renderer")
  .version("0.1.0")
  .showHelpAfterError()
  .configureOutput({
    outputError: (str, write) => write(str)
  });

program
  .command("resolve")
  .description("Resolve query or icon id to canonical prefix:name")
  .argument("<query-or-icon>")
  .option("--match <mode>", "exact|fuzzy", "exact")
  .option("--auto-select <mode>", "top1")
  .option("--min-score <value>", "minimum fuzzy score", "0.45")
  .option("--format <format>", "json|plain", "json")
  .action((queryOrIcon, options) => {
    const result = resolveIcon(queryOrIcon, {
      match: options.match,
      autoSelect: options.autoSelect,
      minScore: Number(options.minScore),
      format: parseOutputFormat(options.format)
    });
    printResult(result, parseOutputFormat(options.format));
    process.exit(result.ok ? 0 : result.error?.code === "AMBIGUOUS" ? 8 : 3);
  });

program
  .command("render")
  .description("Resolve icon and render PNG to output path")
  .argument("<query-or-icon>")
  .requiredOption("-o, --output <path>", "output png path")
  .option("--size <px>", "png width/height", "24")
  .option("--bg <color>", "background color", "transparent")
  .option("--match <mode>", "exact|fuzzy", "exact")
  .option("--auto-select <mode>", "top1")
  .option("--min-score <value>", "minimum fuzzy score", "0.45")
  .option("--force", "overwrite existing file", false)
  .option("--dry-run", "no file write", false)
  .option("--format <format>", "json|plain", "json")
  .action((queryOrIcon, options) => {
    const result = renderIcon(queryOrIcon, {
      output: options.output,
      size: Number(options.size),
      bg: options.bg,
      match: options.match,
      autoSelect: options.autoSelect,
      minScore: Number(options.minScore),
      force: Boolean(options.force),
      dryRun: Boolean(options.dryRun),
      format: parseOutputFormat(options.format)
    });
    printResult(result, parseOutputFormat(options.format));
    process.exit(result.ok ? 0 : result.error?.code === "AMBIGUOUS" ? 8 : 1);
  });

program
  .command("search")
  .description("Fuzzy search icons from local index")
  .argument("<query>")
  .option("--limit <n>", "max results", "20")
  .option("--format <format>", "json|plain", "json")
  .action((query, options) => {
    const result = searchIcons(query, {
      limit: Number(options.limit),
      format: parseOutputFormat(options.format)
    });
    printResult(result, parseOutputFormat(options.format));
    process.exit(result.ok ? 0 : 3);
  });

const indexCommand = program.command("index").description("Manage icon index cache");

indexCommand.command("sync").description("Sync icon index").action(() => {
  const result = indexSync();
  printResult(result, "json");
  process.exit(0);
});

indexCommand.command("clear").description("Clear icon index cache").action(() => {
  const result = indexClear();
  printResult(result, "json");
  process.exit(0);
});

program.parseAsync(process.argv);
