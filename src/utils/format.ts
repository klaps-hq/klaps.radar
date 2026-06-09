import { POLISH_MONTHS } from "../constants";

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

export const formatDuration = (minutes: number | null): string | null => {
  if (!minutes) {
    return null;
  }

  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return hours > 0 ? `${hours}h ${rest}m` : `${rest}m`;
};
