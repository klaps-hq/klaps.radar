<p align="center">
  <img src="klaps-radar-og.png" alt="Klaps Radar" width="800" />
</p>

<h1 align="center">Klaps Radar</h1>

<p align="center">
  <em>Social media automation for Klaps, rendering branded screening artwork and publishing it to Instagram, Facebook, and Threads.</em>
</p>

<p align="center">
  <a href="#getting-started">Getting Started</a> ·
  <a href="#how-it-works">How It Works</a> ·
  <a href="#project-structure">Project Structure</a> ·
  <a href="#scheduling">Scheduling</a> ·
  <a href="#deployment">Deployment</a>
</p>

---

Klaps Radar picks the best upcoming screening from the [Klaps](https://klaps.space) API, renders a branded image for it, and publishes posts and stories across social platforms. Images are rendered without a browser: [satori](https://github.com/vercel/satori) (JSX to SVG) and [sharp](https://sharp.pixelplumbing.com/) (SVG to JPEG), following the klaps.space design language.

## Tech Stack

| Layer           | Technology                                                                          |
| --------------- | ----------------------------------------------------------------------------------- |
| Runtime         | [Bun](https://bun.sh) (executes TypeScript directly, no build step)                 |
| Language        | [TypeScript 5](https://www.typescriptlang.org)                                      |
| Templates       | [React 19](https://react.dev) (JSX only, no DOM)                                    |
| Rendering       | [satori](https://github.com/vercel/satori) + [sharp](https://sharp.pixelplumbing.com) |
| Scheduling      | [croner](https://github.com/hexagon/croner) (Europe/Warsaw)                         |
| Publishing      | Meta Graph API (Instagram, Facebook) + Threads API                                  |
| Deployment      | Docker (Alpine) via GitHub Actions to GHCR                                          |

## How It Works

```
Klaps API ──► candidate ──► satori (SVG) ──► sharp (JPEG) ──► hosted image ──► Graph / Threads API
```

1. `src/utils/candidate.ts` fetches the best screening candidate from the API (the backend enforces deduplication and a 30-day per-movie cooldown).
2. `src/render/template.tsx` is a single JSX template in two variants (post 1080×1350, story 1080×1920); the movie still comes from TMDB at full resolution.
3. `src/render/render.tsx` renders the JPEG with satori and sharp (the image is embedded as a data URL).
4. `src/publish.ts` reserves the candidate, parks the image in our own API (`POST /socials/image`, public `GET /socials/image/:id`), refreshes the platform token, publishes via the Graph API (container, then `media_publish`), and marks the candidate as published.

## Platforms

**Instagram** requires `INSTAGRAM_ACCESS_TOKEN` and `INSTAGRAM_USER_ID`. The long-lived token is refreshed automatically on publish and kept on the `INSTAGRAM_TOKEN_FILE` volume.

**Facebook** requires `FACEBOOK_PAGE_ID` and `FACEBOOK_PAGE_ACCESS_TOKEN` (a system user Page token from Business Manager, it does not expire). A post is a single `POST /{page-id}/photos`; a story is an upload with `published=false` followed by `POST /{page-id}/photo_stories`.

**Threads** requires `THREADS_USER_ID` and `THREADS_ACCESS_TOKEN` (long-lived, 60 days, refreshed automatically on publish like the Instagram token and kept on the `THREADS_TOKEN_FILE` volume). Flow: media container, then `threads_publish`; text is truncated to 490 characters (Threads caps posts at 500) and published without hashtags.

Without the relevant variables the scheduler skips those jobs with a clear log line.

## Project Structure

```
src/
├── constants/           # Environment variable access
├── render/              # JSX template (post & story variants) + satori/sharp pipeline
├── scripts/
│   ├── create/          # CLI entrypoints per platform (post/story)
│   ├── cron.ts          # Long-running scheduler (container entrypoint)
│   └── preview.ts       # Renders preview JPEGs without publishing
├── types/               # Shared TypeScript types
├── utils/               # Candidate fetching, date formatting, token refresh
├── facebook.ts          # Facebook Graph API client
├── instagram.ts         # Instagram Graph API client
├── threads.ts           # Threads API client
└── publish.ts           # Orchestrates render, reserve, upload, publish
assets/                  # Fonts used by satori
```

## Scheduling

The container is a long-running scheduler (`src/scripts/cron.ts`, [croner](https://github.com/hexagon/croner), Europe/Warsaw). Posts are staggered across platforms so followers do not see the same artwork everywhere at once; stories run two slots a day within a single cron expression.

| Job             | Variable            | Default          | Fires at    |
| --------------- | ------------------- | ---------------- | ----------- |
| Instagram story | `IG_STORY_CRON`     | `30 8,17 * * *`  | 8:30, 17:30 |
| Facebook story  | `FB_STORY_CRON`     | `45 8,17 * * *`  | 8:45, 17:45 |
| Instagram post  | `IG_POST_CRON`      | `30 11 * * *`    | 11:30       |
| Facebook post   | `FB_POST_CRON`      | `0 13 * * *`     | 13:00       |
| Threads post    | `THREADS_POST_CRON` | `30 18 * * *`    | 18:30       |

`STORIES_PER_DAY` (default 2) is sent to the candidate API as `maxPosts` and must match the number of firing times in the story cron expressions. `PUBLISH_JITTER_MINUTES` (default 0) delays every job by a random 0..N minutes so publications do not land at the exact same minute every day.

## Getting Started

### Prerequisites

- [Bun](https://bun.sh)
- A running [api.klaps.space](https://github.com/klaps-hq/api.klaps.space) instance

### Environment Variables

Copy `.env.example` to `.env` and fill it in:

```env
API_URL=http://localhost:5000/api/v2
INTERNAL_API_KEY=your-secret-api-key

INSTAGRAM_ACCESS_TOKEN=your-instagram-token
INSTAGRAM_USER_ID=your-instagram-user-id

FACEBOOK_PAGE_ID=your-facebook-page-id
FACEBOOK_PAGE_ACCESS_TOKEN=your-facebook-page-token

THREADS_USER_ID=your-threads-user-id
THREADS_ACCESS_TOKEN=your-threads-token
```

| Variable                     | Required | Description                                                          |
| ---------------------------- | -------- | -------------------------------------------------------------------- |
| `API_URL`                    | Yes      | Klaps API base URL                                                   |
| `INTERNAL_API_KEY`           | Yes      | API key for the internal Klaps API endpoints                         |
| `INSTAGRAM_ACCESS_TOKEN`     | Yes      | Long-lived Instagram token (seeds the first run only)                |
| `INSTAGRAM_USER_ID`          | Yes      | Instagram business account ID                                        |
| `FACEBOOK_PAGE_ID`           | No       | Facebook Page ID (jobs are skipped when unset)                       |
| `FACEBOOK_PAGE_ACCESS_TOKEN` | No       | System user Page token (does not expire)                             |
| `THREADS_USER_ID`            | No       | Threads user ID (job is skipped when unset)                          |
| `THREADS_ACCESS_TOKEN`       | No       | Long-lived Threads token (seeds the first run only)                  |
| `*_CRON`                     | No       | Cron overrides, see [Scheduling](#scheduling)                        |
| `STORIES_PER_DAY`            | No       | Story slots per day (default: `2`)                                   |
| `PUBLISH_JITTER_MINUTES`     | No       | Random publish delay in minutes (default: `0`)                       |
| `INSTAGRAM_TOKEN_FILE`       | No       | Path where the refreshed Instagram token is persisted                |
| `THREADS_TOKEN_FILE`         | No       | Path where the refreshed Threads token is persisted                  |

### Install & Run

```bash
# Install dependencies
bun install

# Preview the templates (writes previews/instagram-post.jpg and previews/instagram-story.jpg)
bun run preview

# Publish manually
bun run create:instagram-post <dateFrom> <dateTo> [numberOfCandidates] [minScore]
bun run create:instagram-story <dateFrom> <dateTo> [numberOfCandidates] [minScore]
bun run create:facebook-post <dateFrom> <dateTo> [numberOfCandidates] [minScore]
bun run create:facebook-story <dateFrom> <dateTo> [numberOfCandidates] [minScore]
bun run create:threads-post <dateFrom> <dateTo> [numberOfCandidates] [minScore]
```

Scripts invoked without arguments compute the date range themselves (Warsaw time): posts cover the next 7 days, stories cover today and tomorrow, so a bare `bun run create:instagram-post` is cron-ready.

## Docker

### Build

```bash
docker build -t klaps-radar .
```

### Run

```bash
docker run \
  -e API_URL=https://api.klaps.space/api/v2 \
  -e INTERNAL_API_KEY=your-key \
  -e INSTAGRAM_ACCESS_TOKEN=your-token \
  -e INSTAGRAM_USER_ID=your-user-id \
  -v radar_data:/data \
  klaps-radar
```

### Docker Compose

The included `docker-compose.yml` runs the scheduler with a named volume for refreshed tokens:

```bash
docker compose up -d
```

The compose file expects a `.env` file. Refreshed platform tokens live in files on the volume (`INSTAGRAM_TOKEN_FILE=/data/instagram-token`, `THREADS_TOKEN_FILE=/data/threads-token`) and survive redeploys; the `*_ACCESS_TOKEN` secrets only seed the very first run.

## Deployment

The project uses **GitHub Actions** for CI/CD (`.github/workflows/deploy.yml`). A push to `main` builds the Docker image and deploys it to the VPS.

**Pipeline steps:**

1. **Typecheck** (`tsc --noEmit`, gates the build)
2. **Build & Push** (Docker image to GitHub Container Registry)
3. **Deploy** (SCP compose file, pull image, recreate container)

**Required GitHub Secrets:**

| Secret                       | Description                                  |
| ---------------------------- | -------------------------------------------- |
| `IMAGE_NAME`                 | GHCR image (e.g. `ghcr.io/klaps-hq/klaps.radar`) |
| `SERVER_IP`                  | Deployment server IP                         |
| `SERVER_USER`                | SSH user                                     |
| `SERVER_SSH_KEY`             | SSH private key                              |
| `PROJECT_DIR`                | Remote project root path                     |
| `GHCR_PAT`                   | GitHub Container Registry token              |
| `API_URL`                    | Klaps API base URL                           |
| `INTERNAL_API_KEY`           | API authentication key                       |
| `INSTAGRAM_ACCESS_TOKEN`     | Instagram token (first run only)             |
| `INSTAGRAM_USER_ID`          | Instagram business account ID                |
| `FACEBOOK_PAGE_ID`           | Facebook Page ID                             |
| `FACEBOOK_PAGE_ACCESS_TOKEN` | Facebook Page token                          |
| `THREADS_USER_ID`            | Threads user ID                              |
| `THREADS_ACCESS_TOKEN`       | Threads token (first run only)               |

Plus the optional cron and tuning overrides listed in [Scheduling](#scheduling).

## Open Source

Klaps is an open-source project. The source code is publicly available on GitHub:

| Component                   | Repository                                                                         |
| --------------------------- | ----------------------------------------------------------------------------------- |
| **Frontend** (Next.js)      | [github.com/klaps-hq/klaps.space](https://github.com/klaps-hq/klaps.space)         |
| **Backend** (NestJS)        | [github.com/klaps-hq/api.klaps.space](https://github.com/klaps-hq/api.klaps.space) |
| **Social automation** (Bun) | [github.com/klaps-hq/klaps.radar](https://github.com/klaps-hq/klaps.radar)         |

> The scrapper responsible for collecting screening data is not publicly available for legal reasons.
