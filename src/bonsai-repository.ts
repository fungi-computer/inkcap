import {
  commitPage,
  fileList,
  treeListing,
} from "@fungi.computer/agar/roles/files";
import type { BonsaiTransport } from "./bonsai-file-source.js";

export async function bonsaiSnapshot(
  request: BonsaiTransport,
  repository: string,
  branch: string,
) {
  const selection = { repo: repository, ref: branch };
  const root = treeListing.parse(
    await request("files.tree", { ...selection, path: "" }),
  );
  const files = fileList.parse(await request("files.list", selection));
  const history = commitPage.parse(
    await request("commits.list", { ...selection, limit: 20 }),
  );
  if (root.commit.hash !== files.commit.hash)
    throw new Error("The repository changed while loading. Refresh to retry.");
  return {
    head: root.commit.hash,
    branch,
    files: files.paths.map((path) => ({ path })),
    history: history.commits.map((entry) => entry.commit),
    truncated: files.truncated,
  };
}

export type BonsaiSnapshot = Awaited<ReturnType<typeof bonsaiSnapshot>>;
