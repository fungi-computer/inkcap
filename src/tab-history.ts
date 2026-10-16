/** Tab visits own the active selection; history navigation never creates a new visit. */
export type TabHistory = { entries: number[]; index: number };
export type TabHistoryAction =
  | { type: "visit"; key: number }
  | { type: "remove"; key: number }
  | { type: "back" };

export const emptyTabHistory: TabHistory = { entries: [], index: -1 };

export function tabHistory(
  state: TabHistory,
  action: TabHistoryAction,
): TabHistory {
  if (action.type === "visit") {
    if (state.entries[state.index] === action.key) return state;
    const entries = [...state.entries.slice(0, state.index + 1), action.key];
    return { entries, index: entries.length - 1 };
  }
  if (action.type === "remove") {
    const entries: number[] = [];
    let index = -1;
    state.entries.forEach((key, position) => {
      if (key === action.key) return;
      if (entries.at(-1) !== key) entries.push(key);
      if (position <= state.index) index = entries.length - 1;
    });
    return { entries, index: entries.length ? Math.max(0, index) : -1 };
  }
  const index = state.index - 1;
  return index < 0 || index >= state.entries.length
    ? state
    : { ...state, index };
}
