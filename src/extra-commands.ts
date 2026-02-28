import { access, mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, resolve as resolvePath } from "node:path";
import { API_BASE, CACHE_DIR, REQUEST_TIMEOUT_MS } from "./config.js";
import { buildPrefixCounts, localIndexMissingError, parsePrefix, toErrorDetails, withConcurrency } from "./command-utils.js";
import { renderIcon, resolveIcon } from "./commands.js";
import { getIndexPath, readIndex } from "./index-cache.js";
import { downloadIconSvg, getCollectionData, getCollectionsMetadata } from "./iconify.js";
import { HttpError } from "./http.js";
import { failWith, ok } from "./output.js";
import { loadRenderManifestItems, RenderManifestError } from "./render-manifest.js";
import type {
  CollectionsInfoOptions,
  CollectionsListOptions,
  DoctorOptions,
  FetchOptions,
  RenderManyItem,
  RenderManyOptions
} from "./types.js";

interface RenderManyItemResult {
  index: number;
  queryOrIcon: string;
  output: string;
  ok: boolean;
  data?: unknown;
  error?: unknown;
}

export const fetchIcon = async (queryOrIcon: string, opts: FetchOptions) => {
  if (opts.offline) {
    return failWith("INVALID_USAGE", "--offline is not supported for fetch (SVG download requires network).");
  }

  const resolved = await resolveIcon(queryOrIcon, opts);
  if (!resolved.ok) {
    return resolved;
  }

  const icon = (resolved.data as { icon: string }).icon;

  try {
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
    await mkdir(dirname(opts.output), { recursive: true });
    await writeFile(opts.output, svg, "utf8");

    return ok({
      icon,
      output: opts.output,
      bytes: Buffer.byteLength(svg, "utf8")
    });
  } catch (error) {
    if (error instanceof HttpError) {
      return failWith("API_ERROR", "Failed to download SVG", toErrorDetails(error));
    }
    return failWith("FS_ERROR", "Failed to write SVG file", toErrorDetails(error));
  }
};

export const renderMany = async (opts: RenderManyOptions) => {
  const startedAt = Date.now();

  try {
    const items = await loadRenderManifestItems(opts.manifestPath);
    if (items.length === 0) {
      return failWith("INVALID_USAGE", "Manifest contains no items.");
    }

    const renderOne = async (item: RenderManyItem, index: number): Promise<RenderManyItemResult> => {
      const result = await renderIcon(item.queryOrIcon, {
        output: item.output,
        size: item.size ?? opts.size,
        bg: item.bg ?? opts.bg,
        fg: item.fg ?? opts.fg,
        strokeWidth: item.strokeWidth ?? opts.strokeWidth,
        match: item.match ?? opts.match,
        source: item.source ?? opts.source,
        offline: item.offline ?? opts.offline,
        collections: item.collections ?? opts.collections,
        preferPrefixes: item.preferPrefixes ?? opts.preferPrefixes,
        autoSelect: item.autoSelect ?? opts.autoSelect,
        minScore: item.minScore ?? opts.minScore,
        force: item.force ?? opts.force,
        dryRun: item.dryRun ?? opts.dryRun,
        format: opts.format
      });

      if (result.ok) {
        return {
          index,
          queryOrIcon: item.queryOrIcon,
          output: item.output,
          ok: true,
          data: result.data
        };
      }

      return {
        index,
        queryOrIcon: item.queryOrIcon,
        output: item.output,
        ok: false,
        error: result.error
      };
    };

    let results: RenderManyItemResult[];
    if (opts.failFast) {
      results = [];
      for (let index = 0; index < items.length; index += 1) {
        const result = await renderOne(items[index], index);
        results.push(result);
        if (!result.ok) {
          break;
        }
      }
    } else {
      results = await withConcurrency(items, opts.concurrency, renderOne);
    }

    const failed = results.filter((item) => !item.ok).length;
    const succeeded = results.length - failed;
    const report = {
      manifestPath: resolvePath(opts.manifestPath),
      total: items.length,
      attempted: results.length,
      succeeded,
      failed,
      skipped: items.length - results.length,
      failFast: opts.failFast,
      concurrency: opts.concurrency,
      durationMs: Date.now() - startedAt,
      items: results
    };

    if (failed > 0 || results.length !== items.length) {
      return failWith("RENDER_ERROR", "One or more render operations failed.", report);
    }

    return ok(report);
  } catch (error) {
    if (error instanceof RenderManifestError) {
      return failWith("INVALID_USAGE", error.message);
    }
    if (error instanceof HttpError) {
      return failWith("API_ERROR", "Failed to process manifest via Iconify API", toErrorDetails(error));
    }
    return failWith("FS_ERROR", "Failed to process render manifest", toErrorDetails(error));
  }
};

export const listCollections = async (opts: CollectionsListOptions) => {
  const useIndexOnly = opts.source === "index" || opts.offline;
  const limit = opts.limit <= 0 ? Number.POSITIVE_INFINITY : opts.limit;

  try {
    if (useIndexOnly || opts.source === "auto") {
      const index = await readIndex();
      if (index) {
        const counts = buildPrefixCounts(index.icons);
        const rows = Array.from(counts.entries())
          .map(([prefix, total]) => ({ prefix, total }))
          .sort((left, right) => left.prefix.localeCompare(right.prefix))
          .slice(0, limit);

        if (opts.format === "plain") {
          return ok({
            source: "index" as const,
            items: rows.map((row) => `${row.prefix}\t${row.total}`)
          });
        }

        return ok({
          source: "index" as const,
          total: rows.length,
          items: rows
        });
      }

      if (useIndexOnly) {
        return localIndexMissingError("Local index is required for this request");
      }
    }

    const metadata = await getCollectionsMetadata();
    const rows = Object.entries(metadata)
      .map(([prefix, entry]) => ({
        prefix,
        total: Number(entry.total ?? 0),
        name: entry.name ?? entry.title ?? prefix,
        category: entry.category ?? null,
        palette: Boolean(entry.palette)
      }))
      .sort((left, right) => left.prefix.localeCompare(right.prefix))
      .slice(0, limit);

    if (opts.format === "plain") {
      return ok({
        source: "api" as const,
        items: rows.map((row) => `${row.prefix}\t${row.total}`)
      });
    }

    return ok({
      source: "api" as const,
      total: rows.length,
      items: rows
    });
  } catch (error) {
    if (error instanceof HttpError) {
      return failWith("API_ERROR", "Failed to list collections", toErrorDetails(error));
    }
    return failWith("FS_ERROR", "Failed to list collections from local index", toErrorDetails(error));
  }
};

export const collectionInfo = async (prefix: string, opts: CollectionsInfoOptions) => {
  const normalizedPrefix = prefix.trim().toLowerCase();
  if (!normalizedPrefix) {
    return failWith("INVALID_USAGE", "collection prefix is required");
  }

  const useIndexOnly = opts.source === "index" || opts.offline;
  const iconsLimit = Math.max(0, Math.floor(opts.iconsLimit));

  try {
    if (useIndexOnly || opts.source === "auto") {
      const index = await readIndex();
      if (index) {
        const icons = index.icons.filter((icon) => parsePrefix(icon) === normalizedPrefix);
        if (icons.length === 0 && useIndexOnly) {
          return failWith("NOT_FOUND", `Collection not found in local index: ${normalizedPrefix}`);
        }

        if (icons.length > 0) {
          const payload = {
            source: "index" as const,
            prefix: normalizedPrefix,
            total: icons.length,
            sampleIcons: icons.slice(0, iconsLimit),
            indexPath: getIndexPath()
          };

          if (opts.format === "plain") {
            const lines = [
              `prefix\t${payload.prefix}`,
              `source\t${payload.source}`,
              `total\t${payload.total}`,
              ...payload.sampleIcons
            ];
            return ok({ items: lines });
          }

          return ok(payload);
        }
      }

      if (useIndexOnly) {
        return localIndexMissingError("Local index is required for this request");
      }
    }

    const metadata = await getCollectionsMetadata();
    const meta = metadata[normalizedPrefix];
    if (!meta) {
      return failWith("NOT_FOUND", `Collection not found: ${normalizedPrefix}`);
    }

    const details = await getCollectionData(normalizedPrefix);
    const iconNames = new Set<string>();

    if (Array.isArray(details.uncategorized)) {
      for (const icon of details.uncategorized) {
        iconNames.add(`${normalizedPrefix}:${icon}`);
      }
    }
    if (details.categories) {
      for (const icons of Object.values(details.categories)) {
        for (const icon of icons) {
          iconNames.add(`${normalizedPrefix}:${icon}`);
        }
      }
    }

    const sampleIcons = Array.from(iconNames).sort().slice(0, iconsLimit);
    const payload = {
      source: "api" as const,
      prefix: normalizedPrefix,
      name: meta.name ?? meta.title ?? normalizedPrefix,
      total: Number(meta.total ?? details.total ?? iconNames.size),
      category: meta.category ?? null,
      palette: Boolean(meta.palette),
      author: meta.author ?? null,
      license: meta.license ?? null,
      tags: meta.tags ?? [],
      sampleIcons
    };

    if (opts.format === "plain") {
      const lines = [
        `prefix\t${payload.prefix}`,
        `source\t${payload.source}`,
        `name\t${payload.name}`,
        `total\t${payload.total}`,
        ...payload.sampleIcons
      ];
      return ok({ items: lines });
    }

    return ok(payload);
  } catch (error) {
    if (error instanceof HttpError) {
      if (error.status === 404) {
        return failWith("NOT_FOUND", `Collection not found: ${normalizedPrefix}`);
      }
      return failWith("API_ERROR", "Failed to load collection info", toErrorDetails(error));
    }
    return failWith("FS_ERROR", "Failed to inspect collection info", toErrorDetails(error));
  }
};

export const doctor = async (opts: DoctorOptions) => {
  const checks = {
    api: {
      ok: false,
      skipped: opts.offline,
      base: API_BASE,
      timeoutMs: REQUEST_TIMEOUT_MS,
      latencyMs: null as number | null,
      collections: null as number | null,
      error: null as unknown
    },
    cacheDir: {
      ok: false,
      path: CACHE_DIR,
      writable: false,
      error: null as unknown
    },
    index: {
      ok: false,
      exists: false,
      path: getIndexPath(),
      total: null as number | null,
      updatedAt: null as string | null,
      ageMs: null as number | null,
      error: null as unknown
    }
  };

  if (!opts.offline) {
    const startedAt = Date.now();
    try {
      const collections = await getCollectionsMetadata();
      checks.api.ok = true;
      checks.api.collections = Object.keys(collections).length;
      checks.api.latencyMs = Date.now() - startedAt;
    } catch (error) {
      checks.api.error = toErrorDetails(error);
    }
  } else {
    checks.api.ok = true;
  }

  try {
    await mkdir(CACHE_DIR, { recursive: true });
    const probePath = `${CACHE_DIR}/.doctor-${Date.now()}-${process.pid}.tmp`;
    await writeFile(probePath, "ok\n", "utf8");
    await rm(probePath, { force: true });
    checks.cacheDir.ok = true;
    checks.cacheDir.writable = true;
  } catch (error) {
    checks.cacheDir.error = toErrorDetails(error);
  }

  try {
    const payload = await readIndex();
    checks.index.ok = true;
    checks.index.exists = payload !== null;
    if (payload) {
      checks.index.total = payload.total;
      checks.index.updatedAt = payload.updatedAt;
      const updatedAtMs = Date.parse(payload.updatedAt);
      checks.index.ageMs = Number.isFinite(updatedAtMs) ? Math.max(0, Date.now() - updatedAtMs) : null;
    }
  } catch (error) {
    checks.index.error = toErrorDetails(error);
  }

  const summary = {
    ok: checks.api.ok && checks.cacheDir.ok && checks.index.ok,
    checks
  };

  if (opts.format === "plain") {
    const lines = [
      `ok\t${summary.ok ? "true" : "false"}`,
      `api\t${checks.api.ok ? "ok" : "fail"}`,
      `cache_dir\t${checks.cacheDir.ok ? "ok" : "fail"}`,
      `index\t${checks.index.ok ? "ok" : "fail"}`
    ];

    if (summary.ok) {
      return ok({ items: lines });
    }

    const code = checks.cacheDir.ok && checks.index.ok ? "API_ERROR" : "FS_ERROR";
    return failWith(code, "Doctor checks failed", { ...summary, lines });
  }

  if (summary.ok) {
    return ok(summary);
  }

  const code = checks.cacheDir.ok && checks.index.ok ? "API_ERROR" : "FS_ERROR";
  return failWith(code, "Doctor checks failed", summary);
};
