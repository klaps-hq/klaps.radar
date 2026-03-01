import InstagramPostTemplate from "./instagram/instagram-post";
import InstagramStoryTemplate from "./instagram/instagram-story";
import type { TemplateDefinition } from "../types";
import { INSTAGRAM_POST, INSTAGRAM_STORY } from "../../../src/constants";

export const TEMPLATE_REGISTRY: TemplateDefinition[] = [
  {
    key: INSTAGRAM_POST.TEMPLATE_KEY,
    component: InstagramPostTemplate,
  },
  {
    key: INSTAGRAM_STORY.TEMPLATE_KEY,
    component: InstagramStoryTemplate,
  },
];

export const resolveTemplate = (templateKey: string): TemplateDefinition => {
  if (!templateKey) throw new Error("Missing template key");

  const template = TEMPLATE_REGISTRY.find(
    (template) => template.key === templateKey
  );

  if (!template) throw new Error(`Unknown template key: ${templateKey}`);

  return template;
};
