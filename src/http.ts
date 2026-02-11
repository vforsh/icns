import { API_BASE, REQUEST_TIMEOUT_MS } from "./config.js";

export class HttpError extends Error {
  readonly status: number;
  readonly url: string;
  readonly body?: string;

  constructor(url: string, status: number, body?: string) {
    super(`HTTP ${status} for ${url}`);
    this.name = "HttpError";
    this.status = status;
    this.url = url;
    this.body = body;
  }
}

const withBase = (path: string): string => {
  if (path.startsWith("http://") || path.startsWith("https://")) {
    return path;
  }

  if (path.startsWith("/")) {
    return `${API_BASE}${path}`;
  }

  return `${API_BASE}/${path}`;
};

const withTimeout = async (url: string, init?: RequestInit): Promise<Response> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: {
        "user-agent": "icns/0.1.0",
        ...(init?.headers ?? {})
      }
    });
  } finally {
    clearTimeout(timeout);
  }
};

export const fetchJson = async <T>(path: string, init?: RequestInit): Promise<T> => {
  const url = withBase(path);
  const response = await withTimeout(url, init);

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new HttpError(url, response.status, body);
  }

  return (await response.json()) as T;
};

export const fetchText = async (path: string, init?: RequestInit): Promise<string> => {
  const url = withBase(path);
  const response = await withTimeout(url, init);

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new HttpError(url, response.status, body);
  }

  return response.text();
};

export const resourceExists = async (path: string): Promise<boolean> => {
  const url = withBase(path);
  const response = await withTimeout(url, { method: "HEAD" });

  if (response.status === 404) {
    return false;
  }

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new HttpError(url, response.status, body);
  }

  return true;
};
