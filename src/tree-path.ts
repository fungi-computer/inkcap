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
