export interface CommandError {
  code: string;
  message: string;
  details?: unknown;
}

export interface CommandResult<T = unknown> {
  schemaVersion: 1;
  ok: boolean;
  data?: T;
  error?: CommandError;
}

export type OutputFormat = "json" | "plain";

export type MatchMode = "exact" | "fuzzy";
export type AutoSelectMode = "top1";
export type SourceMode = "auto" | "index" | "api";

export interface ResolveOptions {
  match: MatchMode;
  autoSelect?: AutoSelectMode;
  minScore: number;
  source: SourceMode;
  offline: boolean;
  collections?: string[];
  preferPrefixes?: string[];
  format: OutputFormat;
}

export interface RenderOptions extends ResolveOptions {
  output: string;
  size: number;
  bg: string;
  fg?: string;
  strokeWidth?: number;
  force: boolean;
  dryRun: boolean;
}

export interface SearchOptions {
  limit: number;
  source: SourceMode;
  offline: boolean;
  collections?: string[];
  format: OutputFormat;
}

export interface IndexSyncOptions {
  concurrency: number;
  includeHidden: boolean;
}

export interface PreviewOptions {
  collection: string;
  open: boolean;
  format: OutputFormat;
}

export interface FetchOptions extends ResolveOptions {
  output: string;
  force: boolean;
}

export interface RenderManyItem {
  queryOrIcon: string;
  output: string;
  size?: number;
  bg?: string;
  fg?: string;
  strokeWidth?: number;
  match?: MatchMode;
  source?: SourceMode;
  offline?: boolean;
  collections?: string[];
  preferPrefixes?: string[];
  autoSelect?: AutoSelectMode;
  minScore?: number;
  force?: boolean;
  dryRun?: boolean;
}

export interface RenderManyOptions extends Omit<RenderOptions, "output"> {
  manifestPath: string;
  concurrency: number;
  failFast: boolean;
}

export interface CollectionsListOptions {
  source: SourceMode;
  offline: boolean;
  limit: number;
  format: OutputFormat;
}

export interface CollectionsInfoOptions {
  source: SourceMode;
  offline: boolean;
  iconsLimit: number;
  format: OutputFormat;
}

export interface DoctorOptions {
  offline: boolean;
  format: OutputFormat;
}
