import { access, mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { Resvg } from "@resvg/resvg-js";
import { openUrl } from "./browser.js";
import { clearIndex, getIndexPath, readIndex, writeIndex } from "./index-cache.js";
import { downloadIconSvg, getCollectionIconNames, getCollectionPrefixes, iconExists, searchIconIds } from "./iconify.js";
import { HttpError } from "./http.js";
import { failWith, ok } from "./output.js";
import { scoreCandidate } from "./fuzzy.js";
import type { IndexSyncOptions, PreviewOptions, RenderOptions, ResolveOptions, SearchOptions, SourceMode } from "./types.js";

interface RankedCandidate {
  icon: string;
  score: number;
  preferred: boolean;
}

interface SourceCandidates {
  source: "index" | "api";
  ids: string[];
}

const toErrorDetails = (error: unknown): Record<string, unknown> => {
  if (error instanceof HttpError) {
    return { status: error.status, url: error.url, body: error.body };
  }
  if (error instanceof Error) {
    return { message: error.message, stack: error.stack };
  }
  return { error: String(error) };
};

const parsePrefix = (iconId: string): string => {
  const separator = iconId.indexOf(":");
  if (separator <= 0) {
    return "";
  }
  return iconId.slice(0, separator);
};

const toPrefixSet = (prefixes?: string[]): Set<string> => new Set((prefixes ?? []).map((prefix) => prefix.toLowerCase()));

const filterByCollection = (ids: string[], collections: Set<string>): string[] => {
  if (collections.size === 0) {
    return ids;
  }

  return ids.filter((iconId) => collections.has(parsePrefix(iconId).toLowerCase()));
};

const rankCandidates = (query: string, ids: string[], preferredPrefixes: Set<string>): RankedCandidate[] => {
  return ids
    .map((icon) => {
      const preferred = preferredPrefixes.has(parsePrefix(icon).toLowerCase());
      const base = scoreCandidate(query, icon);
      const score = preferred && base < 1 ? Math.min(1, base + 0.03) : base;
      return { icon, score, preferred };
    })
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }

      if (left.preferred !== right.preferred) {
        return left.preferred ? -1 : 1;
      }

      return left.icon.localeCompare(right.icon);
    });
};

const escapeAttribute = (value: string): string =>
  value.replaceAll("&", "&amp;").replaceAll("\"", "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

const applyForegroundColor = (svg: string, color?: string): string => {
  const sanitized = color?.trim() ?? "";
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

const applyStrokeWidth = (svg: string, width?: number): string => {
  if (width === undefined) {
    return svg;
  }

  const value = String(width);
  const escaped = escapeAttribute(value);

  const withAttributes = svg.replace(/\sstroke-width=(["']).*?\1/gi, ` stroke-width="${escaped}"`);
  const withStyles = withAttributes.replace(/stroke-width\s*:\s*[^;"']+/gi, `stroke-width:${value}`);

  if (/\bstroke-width\s*=|stroke-width\s*:/i.test(withStyles)) {
    return withStyles;
  }

  return withStyles.replace(/<svg\b([^>]*)>/i, (_match, attrs: string) => {
    if (/\sstyle=(["']).*?\1/i.test(attrs)) {
      return `<svg${attrs.replace(
        /\sstyle=(["'])(.*?)\1/i,
        (_styleMatch, quote: string, styleValue: string) => ` style=${quote}${styleValue};stroke-width:${escaped}${quote}`
      )}>`;
    }

    return `<svg${attrs} style="stroke-width:${escaped}">`;
  });
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

const localIndexMissingError = (reason: string) =>
  failWith("NOT_FOUND", `${reason}. Run \`icns index sync\` to create local cache.`);

const loadIndexIcons = async (): Promise<string[] | null> => {
  const payload = await readIndex();
  return payload?.icons ?? null;
};

const pickExactSource = async (
  iconId: string,
  source: SourceMode,
  offline: boolean
): Promise<{ source: "index" | "api"; exists: boolean } | "MISSING_INDEX"> => {
  const useIndexOnly = source === "index" || offline;

  if (useIndexOnly || source === "auto") {
    const icons = await loadIndexIcons();
    if (icons) {
      return { source: "index", exists: icons.includes(iconId) };
    }

    if (useIndexOnly) {
      return "MISSING_INDEX";
    }
  }

  if (!offline) {
    return { source: "api", exists: await iconExists(iconId) };
  }

  return "MISSING_INDEX";
};

const resolveCandidateIds = async (
  query: string,
  source: SourceMode,
  offline: boolean,
  collections: Set<string>
): Promise<SourceCandidates | "MISSING_INDEX"> => {
  const useIndexOnly = source === "index" || offline;

  if (useIndexOnly || source === "auto") {
    const icons = await loadIndexIcons();
    if (icons) {
      return {
        source: "index",
        ids: filterByCollection(icons, collections)
      };
    }

    if (useIndexOnly) {
      return "MISSING_INDEX";
    }
  }

  if (!offline) {
    const apiIcons = await searchIconIds(query, 200);
    return {
      source: "api",
      ids: filterByCollection(apiIcons, collections)
    };
  }

  return "MISSING_INDEX";
};

export const resolveIcon = async (queryOrIcon: string, opts: ResolveOptions) => {
  const query = queryOrIcon.trim();
  if (!query) {
    return failWith("INVALID_USAGE", "query-or-icon is required");
  }

  const collections = toPrefixSet(opts.collections);
  const preferredPrefixes = toPrefixSet(opts.preferPrefixes);

  try {
    if (opts.match === "exact") {
      if (!query.includes(":")) {
        return failWith("NOT_FOUND", "Exact mode requires a full icon id: prefix:name.");
      }

      const prefix = parsePrefix(query).toLowerCase();
      if (collections.size > 0 && !collections.has(prefix)) {
        return failWith("NOT_FOUND", `Icon \`${query}\` not in allowed --collection prefixes.`);
      }

      const exact = await pickExactSource(query, opts.source, opts.offline);
      if (exact === "MISSING_INDEX") {
        return localIndexMissingError("Local index is required for this request");
      }

      if (!exact.exists) {
        return failWith("NOT_FOUND", `Icon not found: ${query}`);
      }

      return ok({ icon: query, match: "exact" as const, score: 1, source: exact.source });
    }

    const candidates = await resolveCandidateIds(query, opts.source, opts.offline, collections);
    if (candidates === "MISSING_INDEX") {
      return localIndexMissingError("Local index is required for this request");
    }

    const ranked = rankCandidates(query, candidates.ids, preferredPrefixes).filter((item) => item.score >= opts.minScore);

    if (ranked.length === 0) {
      if (opts.source === "auto" && candidates.source === "index" && !opts.offline) {
        const apiCandidates = await resolveCandidateIds(query, "api", false, collections);
        if (apiCandidates !== "MISSING_INDEX") {
          const apiRanked = rankCandidates(query, apiCandidates.ids, preferredPrefixes).filter(
            (item) => item.score >= opts.minScore
          );

          if (apiRanked.length > 0) {
            if (apiRanked.length > 1 && opts.autoSelect !== "top1") {
              return failWith("AMBIGUOUS", "Multiple icons matched query. Pass --auto-select top1.", {
                candidates: apiRanked.slice(0, 10)
              });
            }

            const best = apiRanked[0];
            return ok({
              icon: best.icon,
              match: "fuzzy" as const,
              score: Number(best.score.toFixed(4)),
              candidatesConsidered: apiRanked.length,
              source: "api" as const
            });
          }
        }
      }

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
      candidatesConsidered: ranked.length,
      source: candidates.source
    });
  } catch (error) {
    if (error instanceof HttpError) {
      return failWith("API_ERROR", "Failed to resolve icon using Iconify API", toErrorDetails(error));
    }

    return failWith("FS_ERROR", "Failed to resolve icon using local index", toErrorDetails(error));
  }
};

export const renderIcon = async (queryOrIcon: string, opts: RenderOptions) => {
  if (!Number.isInteger(opts.size) || opts.size <= 0) {
    return failWith("INVALID_USAGE", "--size must be a positive integer");
  }

  if (opts.strokeWidth !== undefined && (!Number.isFinite(opts.strokeWidth) || opts.strokeWidth <= 0)) {
    return failWith("INVALID_USAGE", "--stroke-width must be a positive number");
  }

  if (opts.offline && !opts.dryRun) {
    return failWith(
      "INVALID_USAGE",
      "--offline is only supported with --dry-run for render (SVG download requires network)."
    );
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
      const strokedSvg = applyStrokeWidth(coloredSvg, opts.strokeWidth);
      const rendered = new Resvg(strokedSvg, {
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
        fg: opts.fg ?? "preserve",
        strokeWidth: opts.strokeWidth ?? "preserve",
        bytes: png.byteLength,
        dryRun: false
      });
    }

    return ok({
      icon,
      output: opts.output,
      size: opts.size,
      bg: opts.bg,
      fg: opts.fg ?? "preserve",
      strokeWidth: opts.strokeWidth ?? "preserve",
      dryRun: true
    });
  } catch (error) {
    return failWith("RENDER_ERROR", "Failed to render PNG", toErrorDetails(error));
  }
};

export const searchIcons = async (query: string, opts: SearchOptions) => {
  const value = query.trim();
  if (!value) {
    return failWith("INVALID_USAGE", "query is required");
  }

  const collections = toPrefixSet(opts.collections);

  try {
    const candidates = await resolveCandidateIds(value, opts.source, opts.offline, collections);
    if (candidates === "MISSING_INDEX") {
      return localIndexMissingError("Local index is required for this request");
    }

    let ranked = rankCandidates(value, candidates.ids, new Set<string>());
    if (ranked.length === 0 && opts.source === "auto" && candidates.source === "index" && !opts.offline) {
      const apiCandidates = await resolveCandidateIds(value, "api", false, collections);
      if (apiCandidates !== "MISSING_INDEX") {
        ranked = rankCandidates(value, apiCandidates.ids, new Set<string>());
        return ok({
          query: value,
          total: Math.min(opts.limit, ranked.length),
          limit: opts.limit,
          source: "api" as const,
          items: ranked.slice(0, opts.limit).map((item) => item.icon)
        });
      }
    }

    return ok({
      query: value,
      total: Math.min(opts.limit, ranked.length),
      limit: opts.limit,
      source: candidates.source,
      items: ranked.slice(0, opts.limit).map((item) => item.icon)
    });
  } catch (error) {
    if (error instanceof HttpError) {
      return failWith("API_ERROR", "Failed to search icons", toErrorDetails(error));
    }

    return failWith("FS_ERROR", "Failed to search local index", toErrorDetails(error));
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

export const indexStatus = async () => {
  try {
    const payload = await readIndex();
    if (!payload) {
      return ok({ exists: false, indexPath: getIndexPath() });
    }

    const updatedAtMs = Date.parse(payload.updatedAt);
    const ageMs = Number.isFinite(updatedAtMs) ? Math.max(0, Date.now() - updatedAtMs) : null;

    return ok({
      exists: true,
      indexPath: getIndexPath(),
      updatedAt: payload.updatedAt,
      total: payload.total,
      ageMs
    });
  } catch (error) {
    return failWith("FS_ERROR", "Failed to read local index status", toErrorDetails(error));
  }
};
