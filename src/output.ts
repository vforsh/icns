import type { CommandResult, OutputFormat } from "./types.js";

export const printResult = <T>(result: CommandResult<T>, format: OutputFormat): void => {
  if (format === "plain") {
    if (result.ok && result.data !== undefined) {
      process.stdout.write(`${String(result.data)}\n`);
      return;
    }
    const message = result.error?.message ?? "Unknown error";
    process.stderr.write(`${message}\n`);
    return;
  }

  process.stdout.write(`${JSON.stringify(result)}\n`);
};

export const fail = (code: string, message: string, details?: unknown): CommandResult => ({
  schemaVersion: 1,
  ok: false,
  error: { code, message, details }
});

export const ok = <T>(data: T): CommandResult<T> => ({
  schemaVersion: 1,
  ok: true,
  data
});
