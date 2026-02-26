export type InstagramMediaItem = {
  id: string;
  caption?: string;
  media_type: string;
  media_url?: string;
  permalink?: string;
  timestamp: string;
};

export type InstagramConnectionConfig = {
  accessToken: string;
  instagramUserId: string;
};
