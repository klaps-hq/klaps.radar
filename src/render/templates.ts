import type {
  CanvasSize,
  RenderImageOptions,
  TemplateRenderPayload,
} from "./core";
import { renderImage, saveImage } from "./core";
import { INSTAGRAM_POST } from "../constants";

export type TemplateDefinition = {
  key: string;
  canvasSize: CanvasSize;
  captureMode: boolean;
};

type RenderTemplateOptions = Pick<
  RenderImageOptions,
  "renderStudioUrl" | "timeoutMs"
> &
  Partial<Pick<TemplateDefinition, "canvasSize" | "captureMode">>;

export const TEMPLATE_DEFINITIONS = {
  [INSTAGRAM_POST.TEMPLATE_KEY]: {
    key: INSTAGRAM_POST.TEMPLATE_KEY,
    canvasSize: INSTAGRAM_POST.CANVAS_SIZE,
    captureMode: true,
  },
} as const satisfies Record<string, TemplateDefinition>;

export type TemplateId = keyof typeof TEMPLATE_DEFINITIONS;

const resolveTemplateDefinition = (
  templateId: TemplateId
): TemplateDefinition => TEMPLATE_DEFINITIONS[templateId];

export const renderTemplate = async (
  templateId: TemplateId,
  payload: TemplateRenderPayload,
  options?: RenderTemplateOptions
): Promise<Buffer> => {
  const definition = resolveTemplateDefinition(templateId);

  return renderImage(
    {
      templateKey: definition.key,
      payload,
    },
    {
      renderStudioUrl: options?.renderStudioUrl,
      timeoutMs: options?.timeoutMs,
      captureMode: options?.captureMode ?? definition.captureMode,
      canvasSize: options?.canvasSize ?? definition.canvasSize,
    }
  );
};

export const saveTemplateImage = async (
  templateId: TemplateId,
  payload: TemplateRenderPayload,
  outputPath: string,
  options?: RenderTemplateOptions
): Promise<void> => {
  const definition = resolveTemplateDefinition(templateId);

  await saveImage(
    {
      templateKey: definition.key,
      payload,
    },
    outputPath,
    {
      renderStudioUrl: options?.renderStudioUrl,
      timeoutMs: options?.timeoutMs,
      captureMode: options?.captureMode ?? definition.captureMode,
      canvasSize: options?.canvasSize ?? definition.canvasSize,
    }
  );
};

export const renderRegisteredTemplateImage = renderTemplate;
export const generateAndSaveRegisteredTemplateImage = saveTemplateImage;
