import { access, mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { Resvg } from "@resvg/resvg-js";
import { openUrl } from "./browser.js";
import { clearIndex, getIndexPath, writeIndex } from "./index-cache.js";
import { downloadIconSvg, getCollectionIconNames, getCollectionPrefixes, iconExists, searchIconIds } from "./iconify.js";
import { HttpError } from "./http.js";
import { failWith, ok } from "./output.js";
import { scoreCandidate } from "./fuzzy.js";
import type { IndexSyncOptions, PreviewOptions, RenderOptions, ResolveOptions, SearchOptions } from "./types.js";

const toErrorDetails = (error: unknown): Record<string, unknown> => {
  if (error instanceof HttpError) {
    return { status: error.status, url: error.url, body: error.body };
  }
  if (error instanceof Error) {
    return { message: error.message, stack: error.stack };
  }
  return { error: String(error) };
};

const rankCandidates = (query: string, ids: string[]): Array<{ icon: string; score: number }> => {
  return ids
    .map((icon) => ({ icon, score: scoreCandidate(query, icon) }))
    .sort((left, right) => right.score - left.score);
};

const escapeAttribute = (value: string): string =>
  value.replaceAll("&", "&amp;").replaceAll("\"", "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

const applyForegroundColor = (svg: string, color: string): string => {
  const sanitized = color.trim();
  if (!sanitized) {
    return svg;
  }

  const withStyle = svg.replace(/<svg\b([^>]*)>/i, (_match, attrs: string) => {
    if (/\sstyle=(["']).*?\1/i.test(attrs)) {
      return `<svg${attrs.replace(
        /\sstyle=(["'])(.*?)\1/i,
        (_styleMatch, quote: string, styleValue: string) =>
          ` style=${quote}${styleValue};color:${escapeAttribute(sanitized)}${quote}`
      )}>`;
    }

    return `<svg${attrs} style="color:${escapeAttribute(sanitized)}">`;
  });

  return withStyle.replace(/currentColor/gi, sanitized);
};

const withConcurrency = async <T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<R>
): Promise<R[]> => {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  const limit = Math.max(1, Math.floor(concurrency));

  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await worker(items[index]);
    }
  });

  await Promise.all(runners);
  return results;
};

export const resolveIcon = async (queryOrIcon: string, opts: ResolveOptions) => {
  const query = queryOrIcon.trim();
  if (!query) {
    return failWith("INVALID_USAGE", "query-or-icon is required");
  }

  try {
    if (opts.match === "exact") {
      if (!query.includes(":")) {
        return failWith("NOT_FOUND", "Exact mode requires a full icon id: prefix:name.");
      }

      const exists = await iconExists(query);
      if (!exists) {
        return failWith("NOT_FOUND", `Icon not found: ${query}`);
      }

      return ok({ icon: query, match: "exact" as const, score: 1 });
    }

    const apiMatches = await searchIconIds(query, 50);
    const ranked = rankCandidates(query, apiMatches).filter((item) => item.score >= opts.minScore);

    if (ranked.length === 0) {
      return failWith("NOT_FOUND", `No icons found for query: ${query}`);
    }

    if (ranked.length > 1 && opts.autoSelect !== "top1") {
      return failWith("AMBIGUOUS", "Multiple icons matched query. Pass --auto-select top1.", {
        candidates: ranked.slice(0, 10)
      });
    }

    const best = ranked[0];
    return ok({
      icon: best.icon,
      match: "fuzzy" as const,
      score: Number(best.score.toFixed(4)),
      candidatesConsidered: ranked.length
    });
  } catch (error) {
    return failWith("API_ERROR", "Failed to resolve icon using Iconify API", toErrorDetails(error));
  }
};

export const renderIcon = async (queryOrIcon: string, opts: RenderOptions) => {
  if (!Number.isInteger(opts.size) || opts.size <= 0) {
    return failWith("INVALID_USAGE", "--size must be a positive integer");
  }

  const resolved = await resolveIcon(queryOrIcon, opts);
  if (!resolved.ok) {
    return resolved;
  }

  const icon = (resolved.data as { icon: string }).icon;

  try {
    if (!opts.dryRun) {
      if (!opts.force) {
        try {
          await access(opts.output);
          return failWith("OUTPUT_EXISTS", `Refusing to overwrite existing file: ${opts.output}`);
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
            throw error;
          }
        }
      }

      const svg = await downloadIconSvg(icon);
      const coloredSvg = applyForegroundColor(svg, opts.fg);
      const rendered = new Resvg(coloredSvg, {
        fitTo: { mode: "width", value: opts.size },
        background: opts.bg === "transparent" ? undefined : opts.bg
      }).render();

      await mkdir(dirname(opts.output), { recursive: true });
      const png = rendered.asPng();
      await writeFile(opts.output, png);

      return ok({
        icon,
        output: opts.output,
        size: opts.size,
        bg: opts.bg,
        fg: opts.fg,
        bytes: png.byteLength,
        dryRun: false
      });
    }

    return ok({ icon, output: opts.output, size: opts.size, bg: opts.bg, fg: opts.fg, dryRun: true });
  } catch (error) {
    return failWith("RENDER_ERROR", "Failed to render PNG", toErrorDetails(error));
  }
};

export const searchIcons = async (query: string, opts: SearchOptions) => {
  const value = query.trim();
  if (!value) {
    return failWith("INVALID_USAGE", "query is required");
  }

  try {
    const items = await searchIconIds(value, opts.limit);
    return ok({ query: value, total: items.length, limit: opts.limit, items });
  } catch (error) {
    return failWith("API_ERROR", "Failed to search icons", toErrorDetails(error));
  }
};

const collectionPattern = /^[a-z0-9-]+$/i;

export const previewIcons = async (query: string, opts: PreviewOptions) => {
  const trimmedQuery = query.trim();
  if (!trimmedQuery) {
    return failWith("INVALID_USAGE", "query is required");
  }

  const collection = opts.collection.trim();
  if (!collection || !collectionPattern.test(collection)) {
    return failWith("INVALID_USAGE", "--collection must match [a-z0-9-]+");
  }

  const url = `https://icones.js.org/collection/${encodeURIComponent(collection)}?s=${encodeURIComponent(trimmedQuery)}`;

  try {
    if (opts.open) {
      await openUrl(url);
    }
    return ok({ query: trimmedQuery, collection, url, opened: opts.open });
  } catch (error) {
    return failWith("BROWSER_ERROR", "Failed to open browser preview", toErrorDetails(error));
  }
};

export const indexSync = async (opts: IndexSyncOptions) => {
  const startedAt = Date.now();

  try {
    const prefixes = await getCollectionPrefixes();
    const perCollection = await withConcurrency(prefixes, opts.concurrency, async (prefix) => {
      const icons = await getCollectionIconNames(prefix, opts.includeHidden);
      return { prefix, icons };
    });

    const allIcons = new Set<string>();
    for (const entry of perCollection) {
      for (const icon of entry.icons) {
        allIcons.add(icon);
      }
    }

    const sorted = Array.from(allIcons).sort();
    await writeIndex(sorted);

    return ok({
      collections: prefixes.length,
      icons: sorted.length,
      includeHidden: opts.includeHidden,
      indexPath: getIndexPath(),
      durationMs: Date.now() - startedAt
    });
  } catch (error) {
    return failWith("API_ERROR", "Failed to sync index from Iconify API", toErrorDetails(error));
  }
};

export const indexClear = async () => {
  try {
    const removed = await clearIndex();
    return ok({ removed, indexPath: getIndexPath() });
  } catch (error) {
    return failWith("FS_ERROR", "Failed to clear local index", toErrorDetails(error));
  }
};
