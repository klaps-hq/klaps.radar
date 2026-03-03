import { INSTAGRAM_USER_ID } from "./env";

export const INSTAGRAM_POST = {
  TEMPLATE_KEY: "instagram.feed.post",
  CANVAS_SIZE: { width: 1080, height: 1350 } as const,
} as const;

export const INSTAGRAM_STORY = {
  TEMPLATE_KEY: "instagram.story",
  CANVAS_SIZE: { width: 1080, height: 1920 } as const,
} as const;

export const INSTAGRAM_API_VERSION = "v25.0";
export const INSTAGRAM_API_URL = `https://graph.instagram.com/${INSTAGRAM_USER_ID}/${INSTAGRAM_API_VERSION}`;
