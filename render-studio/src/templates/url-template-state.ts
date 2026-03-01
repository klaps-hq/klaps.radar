import { decodeBase64UrlToUtf8, isObjectRecord } from "../utils";

export const parseTemplatePayload = (
  rawData: string | null
): Record<string, unknown> => {
  if (!rawData) {
    return {};
  }

  try {
    const parsed = JSON.parse(decodeBase64UrlToUtf8(rawData));

    if (!isObjectRecord(parsed)) {
      return {};
    }

    return { ...parsed };
  } catch {
    return {};
  }
};

export const readTemplateStateFromSearchParams = (search: string) => {
  const searchParams = new URLSearchParams(search);

  const rawPayload = searchParams.get("data");
  const templateKey = searchParams.get("template");

  const captureMode =
    searchParams.get("capture") === "1" ||
    searchParams.get("capture") === "true";

  if (!templateKey) {
    return null;
  }

  return {
    templateKey,
    captureMode,

    rawPayload,
  };
};
