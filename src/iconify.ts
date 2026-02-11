import { fetchJson, fetchText, resourceExists } from "./http.js";

interface SearchResponse {
  icons: string[];
  total: number;
  limit: number;
  start: number;
}

interface CollectionsResponse {
  [prefix: string]: unknown;
}

interface CollectionResponse {
  prefix: string;
  uncategorized?: string[];
  categories?: Record<string, string[]>;
  hidden?: string[];
  aliases?: Record<string, string>;
}

const normalizeQuery = (value: string): string => encodeURIComponent(value.trim());

export const searchIconIds = async (query: string, limit: number): Promise<string[]> => {
  const q = normalizeQuery(query);
  const requestedLimit = Math.max(1, Math.min(200, Math.floor(limit)));
  const apiLimit = Math.max(32, requestedLimit);
  const data = await fetchJson<SearchResponse>(`/search?query=${q}&limit=${apiLimit}`);
  return (data.icons ?? []).slice(0, requestedLimit);
};

export const iconExists = async (iconId: string): Promise<boolean> => resourceExists(`/${iconId}.svg`);

export const downloadIconSvg = async (iconId: string): Promise<string> => fetchText(`/${iconId}.svg`);

export const getCollectionPrefixes = async (): Promise<string[]> => {
  const collections = await fetchJson<CollectionsResponse>("/collections");
  return Object.keys(collections);
};

export const getCollectionIconNames = async (prefix: string, includeHidden: boolean): Promise<string[]> => {
  const payload = await fetchJson<CollectionResponse>(`/collection?prefix=${encodeURIComponent(prefix)}`);
  const names = new Set<string>();

  if (Array.isArray(payload.uncategorized)) {
    for (const name of payload.uncategorized) {
      names.add(name);
    }
  }

  if (payload.categories) {
    for (const values of Object.values(payload.categories)) {
      for (const name of values) {
        names.add(name);
      }
    }
  }

  if (includeHidden && Array.isArray(payload.hidden)) {
    for (const hiddenName of payload.hidden) {
      names.add(hiddenName);
    }
  }

  if (includeHidden && payload.aliases) {
    for (const aliasName of Object.keys(payload.aliases)) {
      names.add(aliasName);
    }
  }

  return Array.from(names).map((name) => `${prefix}:${name}`);
};
