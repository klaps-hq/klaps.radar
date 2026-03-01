import type { ComponentType } from "react";

export type TemplatePayload = Record<string, unknown>;

export type TemplateDefinition = {
  key: string;
  component: ComponentType<TemplatePayload>;
};
