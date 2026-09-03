import { createHash } from "node:crypto";
import { constants, createReadStream } from "node:fs";
import { copyFile, stat } from "node:fs/promises";
import { canonicalizeDocumentPath } from "../mutation/context.js";

export type WorkCopyFilesystemErrorCode =
  | "MASTER_FILE_NOT_FOUND"
  | "WORK_COPY_ALREADY_EXISTS"
  | "WORK_COPY_COPY_FAILED"
  | "WORK_COPY_COPY_VERIFICATION_FAILED"
  | "WORK_COPY_IDENTITY_INVALID";

export interface WorkCopyVerification {
  masterPath: string;
  workPath: string;
  masterSha256Before: string;
  workCopySha256: string;
  masterSha256After: string;
  copyDurationMs: number;
}

export type VerifiedFilesystemCopyResult =
  | { ok: true; value: WorkCopyVerification }
  | { ok: false; error: { code: WorkCopyFilesystemErrorCode; message: string } };

export interface WorkCopyFilesystemOperations {
  stat(path: string): Promise<{ isFile(): boolean }>;
  copyFile(source: string, destination: string, mode: number): Promise<void>;
  sha256(path: string): Promise<string>;
}

async function sha256(path: string): Promise<string> {
  const hash = createHash("sha256");
  const stream = createReadStream(path);
  for await (const chunk of stream) hash.update(chunk);
  return hash.digest("hex");
}

const nodeOperations: WorkCopyFilesystemOperations = { stat, copyFile, sha256 };

/**
 * Copies the persisted on-disk MASTER only. It intentionally never captures
 * Illustrator's unsaved in-memory state, never overwrites a destination, and
 * issues no Illustrator command.
 */
export async function createVerifiedFilesystemWorkCopy(
  masterPath: string,
  workPath: string,
  operations: WorkCopyFilesystemOperations = nodeOperations,
): Promise<VerifiedFilesystemCopyResult> {
  let masterCanonical: string;
  let workCanonical: string;
  try {
    masterCanonical = canonicalizeDocumentPath(masterPath);
    workCanonical = canonicalizeDocumentPath(workPath);
  } catch (error) {
    return { ok: false, error: { code: "WORK_COPY_IDENTITY_INVALID", message: error instanceof Error ? error.message : String(error) } };
  }
  if (masterCanonical === workCanonical) {
    return { ok: false, error: { code: "WORK_COPY_IDENTITY_INVALID", message: "MASTER and WORK COPY paths must differ." } };
  }

  try {
    const source = await operations.stat(masterPath);
    if (!source.isFile()) return { ok: false, error: { code: "MASTER_FILE_NOT_FOUND", message: "MASTER path is not a regular file." } };
  } catch (error) {
    return { ok: false, error: { code: "MASTER_FILE_NOT_FOUND", message: error instanceof Error ? error.message : String(error) } };
  }
  try {
    await operations.stat(workPath);
    return { ok: false, error: { code: "WORK_COPY_ALREADY_EXISTS", message: "WORK COPY destination already exists; use a fresh path." } };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      return { ok: false, error: { code: "WORK_COPY_COPY_FAILED", message: error instanceof Error ? error.message : String(error) } };
    }
    // A missing destination is required. copyFile(COPYFILE_EXCL) also closes
    // the race between this check and the copy.
  }

  try {
    const masterSha256Before = await operations.sha256(masterPath);
    const started = Date.now();
    await operations.copyFile(masterPath, workPath, constants.COPYFILE_EXCL);
    const copyDurationMs = Date.now() - started;
    const workCopySha256 = await operations.sha256(workPath);
    const masterSha256After = await operations.sha256(masterPath);
    if (masterSha256Before !== workCopySha256 || masterSha256Before !== masterSha256After) {
      return { ok: false, error: { code: "WORK_COPY_COPY_VERIFICATION_FAILED", message: "MASTER and copied WORK COPY SHA-256 values did not match." } };
    }
    return { ok: true, value: { masterPath, workPath, masterSha256Before, workCopySha256, masterSha256After, copyDurationMs } };
  } catch (error) {
    return { ok: false, error: { code: "WORK_COPY_COPY_FAILED", message: error instanceof Error ? error.message : String(error) } };
  }
}
