import { createAppHistory, type AppHistory } from "@fungi.computer/agar";

/**
 * Back and Forward walk the tabs the person actually switched between. A place
 * is the active tab, or null before the first file opens.
 */
export function createTabHistory(): AppHistory<number | null> {
  return createAppHistory<number | null>(null);
}

/** Open or switch to a tab: a step Back can return from. */
export function visitTab(
  history: AppHistory<number | null>,
  key: number,
): void {
  const { current } = history.get();
  if (current === key) return;
  if (current === null) history.replace(key);
  else history.push(key);
}

/**
 * A history without the closed tab. Visits to it are dropped, neighbours that
 * become duplicates collapse, and the live selection stays where it was or
 * falls back to the nearest earlier visit. `AppHistory` cannot remove entries,
 * so the surviving visits are replayed into a fresh one.
 */
export function withoutTab(
  history: AppHistory<number | null>,
  key: number,
): AppHistory<number | null> {
  const steps = visitsOf(history);
  const entries: number[] = [];
  let index = -1;
  steps.entries.forEach((entry, position) => {
    if (entry === key) return;
    if (entries.at(-1) !== entry) entries.push(entry);
    if (position <= steps.index) index = entries.length - 1;
  });
  const next = createTabHistory();
  entries.forEach((entry) => {
    visitTab(next, entry);
  });
  for (let back = entries.length - 1 - Math.max(0, index); back > 0; back--)
    next.back();
  return next;
}

/** Read every visit by walking `history`, then step it back to where it was. */
function visitsOf(history: AppHistory<number | null>) {
  let index = 0;
  while (history.back()) index++;
  const entries: number[] = [];
  do {
    const { current } = history.get();
    if (current !== null) entries.push(current);
  } while (history.forward());
  for (let back = entries.length - 1 - index; back > 0; back--) history.back();
  return { entries, index };
}
