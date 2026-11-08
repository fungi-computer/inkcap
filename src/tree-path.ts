/** Resolve a user-entered path against the selected Computer directory. */
export function resolveComputerPath(input: string, directory: string): string {
  const path = input.trim();
  if (path.startsWith("/")) return path;
  return `${directory.endsWith("/") ? directory : `${directory}/`}${path}`;
}

/** A directory selection targets itself; a file selection targets its parent. */
export function directoryForTreePath(path: string): string {
  if (path.endsWith("/")) return path.replace(/\/+$/, "") || "/";
  const separator = path.lastIndexOf("/");
  return separator <= 0 ? "/" : path.slice(0, separator);
}

/**
 * Where Save As starts for a draft: the explorer directory plus a file name
 * from the draft's first line, or `untitled-N` for an empty draft.
 */
export function draftSavePath(
  directory: string | null,
  draftTitle: string,
  contents: string,
): string {
  const heading = contents
    .split("\n")
    .map((line) => line.replace(/^#+\s*/u, "").trim())
    .find((line) => line !== "");
  const source = heading ?? draftTitle;
  const slug = source
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/gu, "-")
    .replaceAll(/^-+|-+$/gu, "")
    .slice(0, 40)
    .replaceAll(/-+$/gu, "");
  const name = `${slug === "" ? "untitled" : slug}.md`;
  if (directory === null || directory === "/" || directory === "")
    return directory === "/" ? `/${name}` : name;
  return `${directory.replace(/\/+$/u, "")}/${name}`;
}
