import { readFile } from "node:fs/promises";
import { resolve as resolvePath } from "node:path";
import type { RenderManyItem } from "./types.js";

export class RenderManifestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RenderManifestError";
  }
}

const parseBoolean = (label: string, value: unknown): boolean | undefined => {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "number") {
    if (value === 0) {
      return false;
    }
    if (value === 1) {
      return true;
    }
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["1", "true", "yes", "y"].includes(normalized)) {
      return true;
    }
    if (["0", "false", "no", "n"].includes(normalized)) {
      return false;
    }
  }

  throw new RenderManifestError(`${label} must be boolean (true/false/1/0).`);
};

const parseNumber = (label: string, value: unknown): number | undefined => {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new RenderManifestError(`${label} must be a number.`);
    }
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
      throw new RenderManifestError(`${label} must be a number.`);
    }
    return parsed;
  }

  throw new RenderManifestError(`${label} must be a number.`);
};

const parseStringArray = (value: unknown): string[] | undefined => {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  if (Array.isArray(value)) {
    const filtered = value.map((entry) => String(entry).trim()).filter(Boolean);
    return filtered.length > 0 ? filtered : undefined;
  }

  if (typeof value === "string") {
    const filtered = value
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean);
    return filtered.length > 0 ? filtered : undefined;
  }

  return undefined;
};

const parseEnum = <T extends string>(label: string, value: unknown, allowed: readonly T[]): T | undefined => {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  const normalized = String(value).trim();
  if (allowed.includes(normalized as T)) {
    return normalized as T;
  }

  throw new RenderManifestError(`${label} must be one of: ${allowed.join(", ")}.`);
};

const parseCsvTable = (input: string): string[][] => {
  const text = input.replace(/^\uFEFF/, "");
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;

  const pushField = () => {
    row.push(field);
    field = "";
  };

  const pushRow = () => {
    if (row.length === 0 || (row.length === 1 && row[0].trim() === "")) {
      row = [];
      return;
    }
    rows.push(row);
    row = [];
  };

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];

    if (inQuotes) {
      if (char === "\"") {
        if (text[index + 1] === "\"") {
          field += "\"";
          index += 1;
          continue;
        }
        inQuotes = false;
        continue;
      }

      field += char;
      continue;
    }

    if (char === "\"") {
      inQuotes = true;
      continue;
    }

    if (char === ",") {
      pushField();
      continue;
    }

    if (char === "\n") {
      pushField();
      pushRow();
      continue;
    }

    if (char === "\r") {
      continue;
    }

    field += char;
  }

  pushField();
  pushRow();
  return rows;
};

const pickFirst = (source: Record<string, unknown>, keys: string[]): unknown => {
  for (const key of keys) {
    if (source[key] !== undefined) {
      return source[key];
    }
  }
  return undefined;
};

const normalizeManifestItem = (value: Record<string, unknown>, index: number): RenderManyItem => {
  const queryOrIconRaw = pickFirst(value, ["queryOrIcon", "query", "icon"]);
  const outputRaw = pickFirst(value, ["output", "path", "file"]);
  const queryOrIcon = String(queryOrIconRaw ?? "").trim();
  const output = String(outputRaw ?? "").trim();

  if (!queryOrIcon) {
    throw new RenderManifestError(`Manifest item #${index + 1}: queryOrIcon/query/icon is required.`);
  }
  if (!output) {
    throw new RenderManifestError(`Manifest item #${index + 1}: output/path/file is required.`);
  }

  return {
    queryOrIcon,
    output,
    size: parseNumber(`Manifest item #${index + 1} size`, value.size),
    bg: pickFirst(value, ["bg", "background"])?.toString().trim() || undefined,
    fg: pickFirst(value, ["fg", "foreground"])?.toString().trim() || undefined,
    strokeWidth: parseNumber(`Manifest item #${index + 1} strokeWidth`, pickFirst(value, ["strokeWidth", "stroke_width"])),
    match: parseEnum(`Manifest item #${index + 1} match`, value.match, ["exact", "fuzzy"]),
    source: parseEnum(`Manifest item #${index + 1} source`, value.source, ["auto", "index", "api"]),
    offline: parseBoolean(`Manifest item #${index + 1} offline`, value.offline),
    collections: parseStringArray(pickFirst(value, ["collections", "collection"])),
    preferPrefixes: parseStringArray(pickFirst(value, ["preferPrefixes", "preferPrefix", "prefer_prefix"])),
    autoSelect: parseEnum(`Manifest item #${index + 1} autoSelect`, pickFirst(value, ["autoSelect", "auto_select"]), ["top1"]),
    minScore: parseNumber(`Manifest item #${index + 1} minScore`, pickFirst(value, ["minScore", "min_score"])),
    force: parseBoolean(`Manifest item #${index + 1} force`, value.force),
    dryRun: parseBoolean(`Manifest item #${index + 1} dryRun`, pickFirst(value, ["dryRun", "dry_run"]))
  };
};

const parseCsvManifest = (text: string): RenderManyItem[] => {
  const table = parseCsvTable(text);
  if (table.length === 0) {
    return [];
  }

  const headers = table[0].map((entry) => entry.trim());
  if (headers.length === 0) {
    throw new RenderManifestError("CSV manifest is missing header row.");
  }

  return table.slice(1).map((values, index) => {
    const raw: Record<string, string> = {};
    headers.forEach((header, headerIndex) => {
      raw[header] = (values[headerIndex] ?? "").trim();
    });
    return normalizeManifestItem(raw, index);
  });
};

const parseJsonManifest = (text: string): RenderManyItem[] => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new RenderManifestError(`Invalid JSON manifest: ${error.message}`);
    }
    throw error;
  }
  const values = Array.isArray(parsed)
    ? parsed
    : parsed && typeof parsed === "object" && Array.isArray((parsed as { items?: unknown[] }).items)
      ? (parsed as { items: unknown[] }).items
      : null;

  if (!values) {
    throw new RenderManifestError("JSON manifest must be an array or an object with an items array.");
  }

  return values.map((entry, index) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      throw new RenderManifestError(`Manifest item #${index + 1} must be an object.`);
    }
    return normalizeManifestItem(entry as Record<string, unknown>, index);
  });
};

export const loadRenderManifestItems = async (manifestPath: string): Promise<RenderManyItem[]> => {
  const absolutePath = resolvePath(manifestPath);
  const text = await readFile(absolutePath, "utf8");
  const trimmed = text.trimStart();
  const isJson = manifestPath.toLowerCase().endsWith(".json") || trimmed.startsWith("[") || trimmed.startsWith("{");
  return isJson ? parseJsonManifest(text) : parseCsvManifest(text);
};
