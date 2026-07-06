import { describe, expect, test } from "bun:test";
import fs from "node:fs";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildFilesystemUntrackedDiffFile } from "./untracked";

function createFixtureDir() {
  return mkdtempSync(join(tmpdir(), "hunk-untracked-synthesis-"));
}

describe("buildFilesystemUntrackedDiffFile", () => {
  test("synthesizes a git-style new-file patch without spawning git", () => {
    const dir = createFixtureDir();
    writeFileSync(join(dir, "added.ts"), "const a = 1;\nconst b = 2;\n");

    const file = buildFilesystemUntrackedDiffFile(dir, "added.ts", 0, dir);

    expect(file.patch).toBe(
      "diff --git a/added.ts b/added.ts\nnew file mode 100644\n--- /dev/null\n+++ b/added.ts\n@@ -0,0 +1,2 @@\n+const a = 1;\n+const b = 2;\n",
    );
    expect(file.isUntracked).toBe(true);
    expect(file.metadata.type).toBe("new");
    expect(file.stats).toEqual({ additions: 2, deletions: 0 });
  });

  test("emits a header-only patch for empty files, matching git", () => {
    const dir = createFixtureDir();
    writeFileSync(join(dir, "empty.txt"), "");

    const file = buildFilesystemUntrackedDiffFile(dir, "empty.txt", 0, dir);

    expect(file.patch).toBe("diff --git a/empty.txt b/empty.txt\nnew file mode 100644\n");
    expect(file.metadata.type).toBe("new");
    expect(file.stats).toEqual({ additions: 0, deletions: 0 });
  });

  test("marks missing trailing newlines and single-line hunks like git", () => {
    const dir = createFixtureDir();
    writeFileSync(join(dir, "noeol.txt"), "no newline");

    const file = buildFilesystemUntrackedDiffFile(dir, "noeol.txt", 0, dir);

    expect(file.patch).toContain("@@ -0,0 +1 @@\n+no newline\n\\ No newline at end of file\n");
    expect(file.stats).toEqual({ additions: 1, deletions: 0 });
  });

  test("normalizes CRLF content the same way the git-backed path did", () => {
    const dir = createFixtureDir();
    writeFileSync(join(dir, "crlf.txt"), "a\r\nb\r\n");

    const file = buildFilesystemUntrackedDiffFile(dir, "crlf.txt", 0, dir);

    expect(file.patch).toContain("@@ -0,0 +1,2 @@\n+a\n+b\n");
    expect(file.patch).not.toContain("\r");
  });

  test("records executable files with git's 100755 mode", () => {
    const dir = createFixtureDir();
    writeFileSync(join(dir, "run.sh"), "#!/bin/sh\n", { mode: 0o755 });

    const file = buildFilesystemUntrackedDiffFile(dir, "run.sh", 0, dir);

    expect(file.patch).toContain("new file mode 100755");
  });

  test("diffs symlink link text with mode 120000, matching git", () => {
    const dir = createFixtureDir();
    writeFileSync(join(dir, "target.txt"), "target contents\n");
    fs.symlinkSync("target.txt", join(dir, "link.txt"));

    const file = buildFilesystemUntrackedDiffFile(dir, "link.txt", 0, dir);

    expect(file.patch).toContain("new file mode 120000");
    expect(file.patch).toContain("+target.txt\n\\ No newline at end of file");
    expect(file.isBinary).toBe(false);
  });

  test("renders binary files as git-style binary markers", () => {
    const dir = createFixtureDir();
    writeFileSync(join(dir, "bin.dat"), Buffer.from([0, 1, 2, 3, 255, 0, 7]));

    const file = buildFilesystemUntrackedDiffFile(dir, "bin.dat", 0, dir);

    expect(file.patch).toBe(
      "diff --git a/bin.dat b/bin.dat\nnew file mode 100644\nBinary files /dev/null and b/bin.dat differ\n",
    );
    expect(file.isBinary).toBe(true);
    expect(file.metadata.type).toBe("new");
  });

  test("escapes parser-breaking path characters in synthesized headers", () => {
    const dir = createFixtureDir();
    const fileName = "tab\tname.txt";
    writeFileSync(join(dir, fileName), "content\n");

    const file = buildFilesystemUntrackedDiffFile(dir, fileName, 0, dir);

    expect(file.patch).toContain("diff --git a/tab\\tname.txt b/tab\\tname.txt");
    expect(file.path).toBe(fileName);
  });

  test("passes the source fetcher builder through to non-binary files", () => {
    const dir = createFixtureDir();
    writeFileSync(join(dir, "added.ts"), "const a = 1;\n");

    const file = buildFilesystemUntrackedDiffFile(dir, "added.ts", 0, dir, {
      sourceFetcherBuilder: () => ({
        getFullText: async () => null,
      }),
    });

    expect(file.sourceFetcher).toBeDefined();
  });
});
