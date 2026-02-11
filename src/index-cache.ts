import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { CACHE_DIR, INDEX_PATH } from "./config.js";

interface IndexPayload {
  updatedAt: string;
  total: number;
  icons: string[];
}

export const getIndexPath = (): string => INDEX_PATH;

export const writeIndex = async (icons: string[]): Promise<void> => {
  await mkdir(CACHE_DIR, { recursive: true });
  const payload: IndexPayload = {
    updatedAt: new Date().toISOString(),
    total: icons.length,
    icons
  };
  await writeFile(INDEX_PATH, `${JSON.stringify(payload)}\n`, "utf8");
};

export const clearIndex = async (): Promise<boolean> => {
  try {
    await rm(INDEX_PATH, { force: false });
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return false;
    }
    throw error;
  }
};

export const readIndex = async (): Promise<IndexPayload | null> => {
  try {
    const content = await readFile(INDEX_PATH, "utf8");
    return JSON.parse(content) as IndexPayload;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }
    throw error;
  }
};
