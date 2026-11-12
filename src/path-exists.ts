/** What a Save As target check found; "unchecked" means it could not tell. */
export type TargetCheck = "exists" | "absent" | "unchecked";

/** Whether `directory` lists `name`; rejects when the listing itself fails. */
export type ListsName = (directory: string, name: string) => Promise<boolean>;

const leafOf = (path: string): string => path.slice(path.lastIndexOf("/") + 1);
const parentOf = (path: string): string => {
  const separator = path.lastIndexOf("/");
  return separator <= 0 ? "/" : path.slice(0, separator);
};

/**
 * Whether a file exists, from folder listings alone. A folder that does not
 * exist cannot be listed, so when the parent's listing fails, walk up: a
 * folder that lists cleanly without the next name down proves everything
 * below it is absent. A listing that fails all the way up, or a parent that is
 * listed but cannot be read, rejects with the first failure; never guess.
 */
export async function pathExists(
  path: string,
  listsName: ListsName,
): Promise<boolean> {
  const first = await attempt(listsName, parentOf(path), leafOf(path));
  if (first.kind === "listed") return first.found;
  let missing = parentOf(path);
  while (missing !== "/") {
    const above = parentOf(missing);
    const step = await attempt(listsName, above, leafOf(missing));
    // Listed with the folder there: it exists but could not be read.
    if (step.kind === "listed") {
      if (step.found) throw first.error;
      return false;
    }
    missing = above;
  }
  throw first.error;
}

type Attempt =
  { kind: "listed"; found: boolean } | { kind: "failed"; error: unknown };

/** One listing, with its failure kept as a value for the walk to weigh. */
function attempt(
  listsName: ListsName,
  directory: string,
  name: string,
): Promise<Attempt> {
  return listsName(directory, name).then(
    (found): Attempt => ({ kind: "listed", found }),
    (error: unknown): Attempt => ({ kind: "failed", error }),
  );
}
