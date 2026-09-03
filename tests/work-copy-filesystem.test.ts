import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { createVerifiedFilesystemWorkCopy, type WorkCopyFilesystemOperations } from "../src/production/session/work-copy-filesystem.js";

async function fixture() {
  const directory = await mkdtemp(path.join(tmpdir(), "dpm-work-copy-"));
  const master = path.join(directory, "master.ai");
  const work = path.join(directory, "work.ai");
  await writeFile(master, "saved-master-bytes");
  return { directory, master, work };
}

test("filesystem work copy preserves MASTER bytes and proves all three hashes", async () => {
  const source = await fixture();
  try {
    const copied = await createVerifiedFilesystemWorkCopy(source.master, source.work);
    assert.equal(copied.ok, true);
    if (!copied.ok) return;
    assert.equal(copied.value.masterSha256Before, copied.value.workCopySha256);
    assert.equal(copied.value.masterSha256Before, copied.value.masterSha256After);
    assert.deepEqual(await readFile(source.master), await readFile(source.work));
  } finally { await rm(source.directory, { recursive: true, force: true }); }
});

test("filesystem work copy rejects MASTER destinations and unexpected existing output", async () => {
  const source = await fixture();
  try {
    const same = await createVerifiedFilesystemWorkCopy(source.master, source.master);
    assert.equal(same.ok, false); if (!same.ok) assert.equal(same.error.code, "WORK_COPY_IDENTITY_INVALID");
    await writeFile(source.work, "do-not-overwrite");
    const existing = await createVerifiedFilesystemWorkCopy(source.master, source.work);
    assert.equal(existing.ok, false); if (!existing.ok) assert.equal(existing.error.code, "WORK_COPY_ALREADY_EXISTS");
    assert.equal((await readFile(source.work)).toString(), "do-not-overwrite");
  } finally { await rm(source.directory, { recursive: true, force: true }); }
});

test("copy verification failure does not produce an authorization result", async () => {
  const source = await fixture();
  try {
    const operations: WorkCopyFilesystemOperations = {
      stat: async (file) => {
        if (file === source.work) {
          const missing = Object.assign(new Error("missing"), { code: "ENOENT" });
          throw missing;
        }
        return { isFile: () => true };
      },
      copyFile: async () => { await mkdir(path.dirname(source.work), { recursive: true }); await writeFile(source.work, "different-bytes"); },
      sha256: async (file) => file === source.work ? "work" : "master",
    };
    const result = await createVerifiedFilesystemWorkCopy(source.master, source.work, operations);
    assert.equal(result.ok, false); if (!result.ok) assert.equal(result.error.code, "WORK_COPY_COPY_VERIFICATION_FAILED");
  } finally { await rm(source.directory, { recursive: true, force: true }); }
});
