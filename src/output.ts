import { SCHEMA_VERSION } from "./config.js";
import type { CommandError, CommandResult, OutputFormat } from "./types.js";

const pickPlainOutput = (data: unknown): string => {
  if (typeof data === "string") {
    return data;
  }

  if (Array.isArray(data)) {
    return data.map((item) => String(item)).join("\n");
  }

  if (data && typeof data === "object") {
    const dict = data as Record<string, unknown>;

    if (Array.isArray(dict.items)) {
      return dict.items.map((item) => String(item)).join("\n");
    }

    if (typeof dict.icon === "string") {
      return dict.icon;
    }

    if (typeof dict.url === "string") {
      return dict.url;
    }
  }

  return JSON.stringify(data);
};

export const printResult = <T>(result: CommandResult<T>, format: OutputFormat): void => {
  if (format === "plain") {
    if (result.ok && result.data !== undefined) {
      process.stdout.write(`${pickPlainOutput(result.data)}\n`);
      return;
    }

    const message = result.error?.message ?? "Unknown error";
    process.stderr.write(`${message}\n`);
    return;
  }

  process.stdout.write(`${JSON.stringify(result)}\n`);
};

export const fail = (error: CommandError): CommandResult => ({
  schemaVersion: SCHEMA_VERSION,
  ok: false,
  error
});

export const failWith = (code: string, message: string, details?: unknown): CommandResult =>
  fail({ code, message, details });

export const ok = <T>(data: T): CommandResult<T> => ({
  schemaVersion: SCHEMA_VERSION,
  ok: true,
  data
});
