import { parseChord, type ShellChord } from "@fungi.computer/nacre/keys";

/** The shell's leader chord, written the way a binding names it. */
const LEADER_BINDING = "mod+k";

function onMac(): boolean {
  return /Mac|iPhone|iPad/u.test(navigator.userAgent);
}

/** One label per key of a chord: Command shows only on macOS. */
function chordKeys(chord: ShellChord, mac: boolean): readonly string[] {
  const keys: string[] = [];
  if (chord.ctrl) keys.push(mac ? "\u2303" : "Ctrl");
  if (chord.alt) keys.push(mac ? "\u2325" : "Alt");
  if (chord.shift) keys.push(mac ? "\u21E7" : "Shift");
  if (chord.meta) keys.push(mac ? "\u2318" : "Win");
  keys.push(chord.key.toUpperCase());
  return keys;
}

/** The keys of the leader chord for this platform, such as ["Ctrl", "K"]. */
export function leaderKeys(mac = onMac()): readonly string[] {
  const chord = parseChord(LEADER_BINDING, mac);
  return chord ? chordKeys(chord, mac) : [];
}

/** The leader chord as one tooltip string, such as "Ctrl+K". */
export function leaderText(mac = onMac()): string {
  return leaderKeys(mac).join(mac ? "" : "+");
}
