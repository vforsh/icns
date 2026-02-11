export interface CommandResult<T = unknown> {
  schemaVersion: 1;
  ok: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export type OutputFormat = "json" | "plain";
