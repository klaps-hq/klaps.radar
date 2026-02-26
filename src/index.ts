import { fetchInstagramMedia } from "./instagram";

const instagramAccessToken = process.env.INSTAGRAM_ACCESS_TOKEN;
const instagramUserId = process.env.INSTAGRAM_USER_ID;

const run = async (): Promise<void> => {
  if (!instagramAccessToken || !instagramUserId) {
    console.log(
      "Set INSTAGRAM_ACCESS_TOKEN and INSTAGRAM_USER_ID to fetch Instagram data."
    );
    return;
  }

  const mediaItems = await fetchInstagramMedia({
    accessToken: instagramAccessToken,
    instagramUserId,
  });

  console.log(`Fetched ${mediaItems.length} Instagram post(s).`);
};

run().catch((error: unknown) => {
  console.error("Instagram integration error:", error);
});
