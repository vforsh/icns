import { fail, ok } from "./output.js";
import type { OutputFormat } from "./types.js";

interface ResolveOptions {
  match: "exact" | "fuzzy";
  autoSelect?: "top1";
  minScore: number;
  format: OutputFormat;
}

interface RenderOptions extends ResolveOptions {
  output: string;
  size: number;
  bg: string;
  force: boolean;
  dryRun: boolean;
}

interface SearchOptions {
  limit: number;
  format: OutputFormat;
}

export const resolveIcon = (queryOrIcon: string, opts: ResolveOptions) => {
  if (!queryOrIcon.trim()) {
    return fail("INVALID_USAGE", "query-or-icon is required");
  }

  const inferred = queryOrIcon.includes(":") ? queryOrIcon : null;

  if (!inferred && opts.match === "exact") {
    return fail("NOT_FOUND", "Exact icon id not found. Provide prefix:name or use --match fuzzy.");
  }

  if (!inferred && opts.match === "fuzzy" && !opts.autoSelect) {
    return fail("AMBIGUOUS", "Fuzzy query requires --auto-select top1 in agent mode.", {
      candidates: ["mdi:home", "material-symbols:home", "lucide:house"]
    });
  }

  const icon = inferred ?? "mdi:home";
  return ok({ icon, match: opts.match, minScore: opts.minScore });
};

export const renderIcon = (queryOrIcon: string, opts: RenderOptions) => {
  const resolved = resolveIcon(queryOrIcon, opts);
  if (!resolved.ok) {
    return resolved;
  }

  return ok({
    icon: (resolved.data as { icon: string }).icon,
    output: opts.output,
    size: opts.size,
    bg: opts.bg,
    force: opts.force,
    dryRun: opts.dryRun,
    status: "planned"
  });
};

export const searchIcons = (query: string, opts: SearchOptions) => {
  if (!query.trim()) {
    return fail("INVALID_USAGE", "query is required");
  }

  const sample = ["mdi:home", "material-symbols:home", "lucide:house", "simple-icons:github"];
  return ok({ query, total: sample.length, limit: opts.limit, items: sample.slice(0, opts.limit) });
};

export const indexSync = () => ok({ status: "planned", note: "Will call Iconify API and rebuild local index." });
export const indexClear = () => ok({ status: "planned", note: "Will remove local cache/index files." });
