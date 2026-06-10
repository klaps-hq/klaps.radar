# klaps-radar

Automatyczne publikowanie postów i stories na Instagramie z seansami z [klaps.space](https://klaps.space).

Obrazy renderowane są bez przeglądarki: [satori](https://github.com/vercel/satori) (JSX → SVG) + [sharp](https://sharp.pixelplumbing.com/) (SVG → JPEG), w designie klaps.space.

## Instalacja

```bash
bun install
```

## Użycie

Podgląd szablonów (zapisuje `previews/instagram-post.jpg` i `previews/instagram-story.jpg`):

```bash
bun run preview
```

Publikacja (wymaga `.env` z `API_URL`, `INTERNAL_API_KEY`, `INSTAGRAM_ACCESS_TOKEN`, `INSTAGRAM_USER_ID`):

```bash
bun run create:instagram-post <dateFrom> <dateTo> [numberOfCandidates] [minScore]
bun run create:instagram-story <dateFrom> <dateTo> [numberOfCandidates] [minScore]
bun run create:facebook-post <dateFrom> <dateTo> [numberOfCandidates] [minScore]
```

Facebook wymaga `FACEBOOK_PAGE_ID` i `FACEBOOK_PAGE_ACCESS_TOKEN` (long-lived Page token — pozyskany z long-lived user tokena nie wygasa; publikacja to pojedynczy `POST /{page-id}/photos`). Bez tych zmiennych scheduler pomija joba FB. Harmonogram: `FB_POST_CRON` (domyślnie 12:00).

## Jak to działa

1. `src/utils/candidate.ts` — pobiera najlepszy seans-kandydata z API (backend pilnuje deduplikacji i 30-dniowego cooldownu filmu).
2. `src/render/template.tsx` — jeden szablon JSX w dwóch wariantach (post 1080×1350, story 1080×1920); kadr filmu z TMDB w pełnej rozdzielczości.
3. `src/render/render.tsx` — satori + sharp renderują JPEG (obraz wstawiany jako data URL).
4. `src/publish.ts` — rezerwuje kandydata, wrzuca obraz do własnego API (`POST /socials/image`, publiczny `GET /socials/image/:id`), odświeża token Instagrama (zapisując nowy do `.env`), publikuje przez Graph API (kontener → `media_publish`) i oznacza kandydata jako opublikowanego.

Skrypty wywołane bez argumentów same liczą zakres dat (czas warszawski): post = najbliższe 7 dni, story = dziś–jutro — wystarczy cron z `bun run create:instagram-post` / `create:instagram-story`.

## Deploy

Push do `main` automatycznie buduje obraz Dockera (GHCR) i wdraża go na VPS (`.github/workflows/deploy.yml`). Kontener to długo żyjący scheduler (`src/scripts/cron.ts`, croner): publikuje post wg `IG_POST_CRON` (domyślnie 11:30) i story wg `IG_STORY_CRON` (domyślnie 8:30), czas Europe/Warsaw.

Odświeżony token Instagrama trzymany jest w pliku na wolumenie (`INSTAGRAM_TOKEN_FILE=/data/instagram-token`) i przeżywa redeploye — sekret `INSTAGRAM_ACCESS_TOKEN` zasiewa tylko pierwszy start.

Wymagane sekrety repo: `SERVER_IP`, `SERVER_USER`, `SERVER_SSH_KEY`, `PROJECT_DIR`, `GHCR_PAT`, `IMAGE_NAME` (np. `ghcr.io/klaps-hq/klaps.radar`), `API_URL`, `INTERNAL_API_KEY`, `INSTAGRAM_ACCESS_TOKEN`, `INSTAGRAM_USER_ID`, `IG_POST_CRON`, `IG_STORY_CRON`.
