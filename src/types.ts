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

export interface ResolveOptions {
  match: MatchMode;
  autoSelect?: AutoSelectMode;
  minScore: number;
  format: OutputFormat;
}

export interface RenderOptions extends ResolveOptions {
  output: string;
  size: number;
  bg: string;
  force: boolean;
  dryRun: boolean;
}

export interface SearchOptions {
  limit: number;
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
