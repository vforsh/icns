import { readStdinLines } from "./stdin.js";
import type { AutoSelectMode, CommandResult, MatchMode, OutputFormat, SourceMode } from "./types.js";

const prefixPattern = /^[a-z0-9-]+$/i;

export const parseOutputFormat = (value: string): OutputFormat => {
  if (value === "json" || value === "plain") {
    return value;
  }
  throw new Error(`Invalid --format: ${value}. Expected json|plain.`);
};

export const parseMatch = (value: string): MatchMode => {
  if (value === "exact" || value === "fuzzy") {
    return value;
  }
  throw new Error(`Invalid --match: ${value}. Expected exact|fuzzy.`);
};

export const parseSource = (value: string): SourceMode => {
  if (value === "auto" || value === "index" || value === "api") {
    return value;
  }
  throw new Error(`Invalid --source: ${value}. Expected auto|index|api.`);
};

export const parseAutoSelect = (value: string): AutoSelectMode => {
  if (value === "top1") {
    return value;
  }
  throw new Error(`Invalid --auto-select: ${value}. Expected top1.`);
};

export const parseIntStrict = (label: string, value: string): number => {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) {
    throw new Error(`${label} must be an integer.`);
  }
  return parsed;
};

export const parsePositiveInt = (label: string, value: string): number => {
  const parsed = parseIntStrict(label, value);
  if (parsed <= 0) {
    throw new Error(`${label} must be a positive integer.`);
  }
  return parsed;
};

export const parseFloatStrict = (label: string, value: string): number => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`${label} must be a number.`);
  }
  return parsed;
};

export const parsePositiveFloat = (label: string, value: string): number => {
  const parsed = parseFloatStrict(label, value);
  if (parsed <= 0) {
    throw new Error(`${label} must be a positive number.`);
  }
  return parsed;
};

export const parsePrefixCsv = (label: string, value?: string): string[] | undefined => {
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

export const validateSourceMode = (source: SourceMode, offline: boolean): { source: SourceMode; offline: boolean } => {
  if (offline && source === "api") {
    throw new Error("--offline cannot be used with --source api.");
  }

  return { source, offline };
};

export const errorToExitCode = (code: string | undefined): number => {
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

export const requireArgument = (value: string | undefined, label: string): string => {
  const trimmed = (value ?? "").trim();
  if (!trimmed) {
    throw new Error(`${label} is required.`);
  }
  return trimmed;
};

export const readNonEmptyStdinLines = async (): Promise<string[]> => {
  const lines = await readStdinLines();
  if (lines.length === 0) {
    throw new Error("--stdin was set, but no non-empty lines were provided.");
  }
  return lines;
};

export const updateBatchExitCode = (currentExitCode: number, result: CommandResult): number => {
  if (result.ok || currentExitCode !== 0) {
    return currentExitCode;
  }
  return errorToExitCode(result.error?.code);
};

export const parseRenderStdinLine = (line: string, index: number): { queryOrIcon: string; output: string } => {
  const separator = line.indexOf("\t");
  if (separator <= 0 || separator === line.length - 1) {
    throw new Error(`Invalid render stdin line #${index + 1}. Expected "<query-or-icon>\\t<output-path>".`);
  }

  const queryOrIcon = line.slice(0, separator).trim();
  const output = line.slice(separator + 1).trim();
  if (!queryOrIcon || !output) {
    throw new Error(`Invalid render stdin line #${index + 1}. Expected "<query-or-icon>\\t<output-path>".`);
  }

  return { queryOrIcon, output };
};

