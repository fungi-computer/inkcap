/**
 * The folder every Computer mounts as its guest workspace. It is where the
 * person's files live, so Explorer opens here and new files land here; the
 * Computer's own root holds nothing the person owns.
 */
export const computerHomePath = "/workspace";

/** The folder a window opens on: its own `project`, else the Computer's home. */
export function projectPathFor(project: string | null): string {
  const path = project?.trim() ?? "";
  if (path === "") return computerHomePath;
  return path.startsWith("/") ? path : `/${path}`;
}
