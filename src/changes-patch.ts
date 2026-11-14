import { GIT_DIFF_FILE_BREAK_REGEX, parsePatchFiles } from "@pierre/diffs";
import type { GitChangedFile } from "@fungi.computer/computer-contract";

export const statusMark = {
  added: "A",
  modified: "M",
  deleted: "D",
  renamed: "R",
  untracked: "U",
  conflicted: "C",
} satisfies Record<GitChangedFile["status"], string>;
export const statusLabel = {
  added: "Added",
  modified: "Modified",
  deleted: "Deleted",
  renamed: "Renamed",
  untracked: "New, not yet staged",
  conflicted: "Conflicted",
} satisfies Record<GitChangedFile["status"], string>;

export type FilePatch = { patch: string; additions: number; deletions: number };

/** One unified diff per file from `git diff`, split, named and counted by the diff library's own parser. */
export function patchesByPath(patch: string): Map<string, FilePatch> {
  const patches = new Map<string, FilePatch>();
  for (const section of patch.split(GIT_DIFF_FILE_BREAK_REGEX)) {
    const file = parsePatchFiles(section).at(0)?.files.at(0);
    if (file === undefined) continue;
    patches.set(file.name, {
      patch: section,
      additions: file.hunks.reduce((sum, hunk) => sum + hunk.additionLines, 0),
      deletions: file.hunks.reduce((sum, hunk) => sum + hunk.deletionLines, 0),
    });
  }
  return patches;
}
