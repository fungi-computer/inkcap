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

// Only a file-name-looking title keeps its extension: no whitespace, letters only.
const knownExtension = /^([^\s]+?)(\.[a-z]{1,8})$/iu;

/** Collapse repeated slashes so no join can produce `//`. */
function collapseSlashes(path: string): string {
  return path.replaceAll(/\/{2,}/gu, "/");
}

/** `.md` is added only when the name has no extension of its own. */
function withExtension(source: string): string {
  const slug = (value: string) =>
    value
      .toLowerCase()
      .replaceAll(/[^a-z0-9]+/gu, "-")
      .replaceAll(/^-+|-+$/gu, "")
      .slice(0, 40)
      .replaceAll(/-+$/gu, "");
  const match = knownExtension.exec(source);
  const base = slug(match?.[1] ?? source);
  return `${base === "" ? "untitled" : base}${match?.[2]?.toLowerCase() ?? ".md"}`;
}

/**
 * Where Save As starts for a draft: the explorer directory plus a file name
 * from the draft's first line, or `untitled-N` for an empty draft. A title that
 * already is an absolute path (a file saved a moment ago) is used as it is,
 * never joined to the directory as if it were a bare name.
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
  if (heading === undefined && draftTitle.startsWith("/"))
    return collapseSlashes(draftTitle);
  const name = withExtension(heading ?? draftTitle);
  if (directory === null || directory === "/" || directory === "")
    return directory === "/" ? `/${name}` : name;
  return collapseSlashes(`${directory.replace(/\/+$/u, "")}/${name}`);
}
