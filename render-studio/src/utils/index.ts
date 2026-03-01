export const decodeBase64UrlToUtf8 = (value: string): string => {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padding =
    base64.length % 4 === 0 ? "" : "=".repeat(4 - (base64.length % 4));
  const binary = atob(base64 + padding);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
};

export const isObjectRecord = (
  value: unknown
): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
