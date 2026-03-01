import { InstagramFeedPostTemplate } from "./instagram/InstagramFeedPostTemplate";
import type { TemplateDefinition } from "./types";

const INSTAGRAM_FEED_POST_TEMPLATE_KEY = "instagram.feed.post";

export const TEMPLATE_REGISTRY: Record<string, TemplateDefinition> = {
  [INSTAGRAM_FEED_POST_TEMPLATE_KEY]: {
    key: INSTAGRAM_FEED_POST_TEMPLATE_KEY,
    component: InstagramFeedPostTemplate as TemplateDefinition["component"],
  },
};

export const resolveTemplate = (templateKey: string): TemplateDefinition => {
  if (!templateKey) throw new Error("Missing template key");

  const template = TEMPLATE_REGISTRY[templateKey];

  if (!template) throw new Error(`Unknown template key: ${templateKey}`);

  return template;
};
