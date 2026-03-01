import type { TemplateRenderPayload } from "./core";
import type { TemplateId } from "./templates";
import { renderTemplate, saveTemplateImage } from "./templates";

export type PostImageOptions = {
  templateId: TemplateId;
  payload: TemplateRenderPayload;
  renderStudioUrl?: string;
  timeoutMs?: number;
};

export const generatePostImage = async (
  options: PostImageOptions
): Promise<Buffer> =>
  renderTemplate(options.templateId, options.payload, {
    renderStudioUrl: options.renderStudioUrl,
    timeoutMs: options.timeoutMs,
  });

export const generateAndSavePostImage = async (
  options: PostImageOptions,
  outputPath: string
): Promise<void> =>
  saveTemplateImage(options.templateId, options.payload, outputPath, {
    renderStudioUrl: options.renderStudioUrl,
    timeoutMs: options.timeoutMs,
  });

export const uploadPostImage = async (imageBuffer: Buffer): Promise<string> => {
  const formData = new FormData();
  formData.append("reqtype", "fileupload");
  formData.append("time", "24h");
  formData.append(
    "fileToUpload",
    new Blob([new Uint8Array(imageBuffer)], { type: "image/jpeg" }),
    "post.jpg"
  );

  const response = await fetch(
    "https://litterbox.catbox.moe/resources/internals/api.php",
    {
      method: "POST",
      headers: { "User-Agent": "klaps-radar/1.0" },
      body: formData,
    }
  );

  if (!response.ok) {
    const errorText = await response.text().catch(() => "Unknown error");
    throw new Error(
      `Image upload failed (status ${response.status}): ${errorText}`
    );
  }

  const url = await response.text();
  return url.trim();
};

export const createPublicPostImageUrl = async (
  options: PostImageOptions
): Promise<string> => {
  const imageBuffer = await generatePostImage(options);
  const publicUrl = await uploadPostImage(imageBuffer);

  return publicUrl;
};
