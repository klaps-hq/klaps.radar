import { POLISH_MONTHS } from "../constants";

/** Today's date as YYYY-MM-DD in the Europe/Warsaw timezone. */
export const todayInPoland = (): string =>
  new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Warsaw" });

export const addDays = (dateStr: string, days: number): string => {
  const [y, m, d] = dateStr.split("-").map(Number);
  const ms = Date.UTC(y!, m! - 1, d!) + days * 86400000;
  return new Date(ms).toISOString().slice(0, 10);
};

// The DB stores screening datetimes as naive local timestamps, so the
// wall-clock digits in the ISO string are already correct - parse them
// straight from the string instead of going through Date and timezones.
export const splitScreeningDate = (
  isoTimestamp: string
): { date: string; time: string } => {
  const match = isoTimestamp.match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})/);

  if (!match) {
    return { date: isoTimestamp.slice(0, 10), time: "" };
  }

  return { date: match[1]!, time: match[2]! };
};

export const formatPolishDate = (dateStr: string): string => {
  const [year, month, day] = dateStr.split("-").map(Number);
  return `${day} ${POLISH_MONTHS[(month ?? 1) - 1]} ${year}`;
};

// Cuts at a word boundary so the ellipsis never splits a word.
export const truncateText = (text: string, maxChars: number): string => {
  const trimmed = text.trim();
  if (trimmed.length <= maxChars) {
    return trimmed;
  }

  const cut = trimmed.slice(0, maxChars);
  const lastSpace = cut.lastIndexOf(" ");
  return `${cut.slice(0, lastSpace > 0 ? lastSpace : maxChars).trimEnd()}…`;
};

// Abbreviations whose dot does not end a sentence ("m.in. Kraków", "r.").
const ABBREVIATIONS = new Set(["r", "m.in", "np", "tzw", "dr", "św", "ok", "wg", "im", "ul", "godz", "tj", "prof", "inż", "gen", "ks", "pt"]);

// Keeps as many whole sentences as fit, so a synopsis never stops
// mid-thought; only a first sentence longer than the limit is cut at a word
// boundary with an ellipsis. A text that already ends in an ellipsis (a
// synopsis cut at the source) loses its unfinished last sentence.
export const truncateSentences = (text: string, maxChars: number): string => {
  const trimmed = text.trim();
  const unfinished = trimmed.match(/(\.\.\.|…)$/)?.[0];
  if (!unfinished && trimmed.length <= maxChars) {
    return trimmed;
  }
  const limit = unfinished ? Math.min(maxChars, trimmed.length - unfinished.length - 1) : maxChars;

  let end = 0;
  // A sentence ends on . ! ? or … (optionally closed by a quote or bracket)
  // followed by whitespace and a capital letter or the end of the text.
  for (const match of trimmed.matchAll(/[.!?…]["”»)]?(?=\s+["„«(]?\p{Lu}|\s*$)/gu)) {
    const stop = match.index + match[0].length;
    if (stop > limit) break;
    // "Johna G. Avildsena", "w 1976 r. Rocky": initials and abbreviations.
    const word = trimmed.slice(0, match.index).split(/\s/).pop() ?? "";
    if (match[0][0] === "." && (/^\p{Lu}$/u.test(word) || ABBREVIATIONS.has(word.toLowerCase()))) continue;
    end = stop;
  }
  if (end > 0) return trimmed.slice(0, end);
  return trimmed.length <= maxChars ? trimmed : truncateText(trimmed, maxChars);
};

export const formatDuration = (minutes: number | null): string | null => {
  if (!minutes) {
    return null;
  }

  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest}m`;
  return rest > 0 ? `${hours}h ${rest}m` : `${hours}h`;
};
