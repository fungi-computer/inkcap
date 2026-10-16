/** Presentation only: saved baselines and writes must keep their original bytes. */
export function comparisonText(contents: string): string {
  return contents.replace(/^\uFEFF/u, "").replace(/\r\n?/gu, "\n");
}
