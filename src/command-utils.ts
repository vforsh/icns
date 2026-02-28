import { HttpError } from "./http.js";
import { failWith } from "./output.js";

export const toErrorDetails = (error: unknown): Record<string, unknown> => {
  if (error instanceof HttpError) {
    return { status: error.status, url: error.url, body: error.body };
  }
  if (error instanceof Error) {
    return { message: error.message, stack: error.stack };
  }
  return { error: String(error) };
};

export const parsePrefix = (iconId: string): string => {
  const separator = iconId.indexOf(":");
  if (separator <= 0) {
    return "";
  }
  return iconId.slice(0, separator).toLowerCase();
};

export const withConcurrency = async <T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>
): Promise<R[]> => {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  const limit = Math.max(1, Math.floor(concurrency));

  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await worker(items[index], index);
    }
  });

  await Promise.all(runners);
  return results;
};

export const localIndexMissingError = (reason: string) =>
  failWith("NOT_FOUND", `${reason}. Run \`icns index sync\` to create local cache.`);

export const buildPrefixCounts = (icons: string[]): Map<string, number> => {
  const counts = new Map<string, number>();
  for (const icon of icons) {
    const prefix = parsePrefix(icon);
    if (!prefix) {
      continue;
    }
    counts.set(prefix, (counts.get(prefix) ?? 0) + 1);
  }
  return counts;
};

