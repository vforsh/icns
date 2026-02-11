import { homedir } from "node:os";
import { join } from "node:path";

const trimTrailingSlash = (value: string): string => value.replace(/\/+$/, "");

export const SCHEMA_VERSION = 1 as const;
export const API_BASE = trimTrailingSlash(process.env.ICONES_API_BASE ?? "https://api.iconify.design");
export const REQUEST_TIMEOUT_MS = Number(process.env.ICONES_TIMEOUT_MS ?? "10000");
export const CACHE_DIR = process.env.ICONES_CACHE_DIR ?? join(homedir(), ".cache", "icns");
export const INDEX_PATH = join(CACHE_DIR, "index.json");
