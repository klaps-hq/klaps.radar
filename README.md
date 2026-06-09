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
```

## Jak to działa

1. `src/utils/candidate.ts` — pobiera najlepszy seans-kandydata z API.
2. `src/render/template.tsx` — jeden szablon JSX w dwóch wariantach (post 1080×1350, story 1080×1920).
3. `src/render/render.tsx` — satori + sharp renderują JPEG (plakat wstawiany jako data URL).
4. `src/publish.ts` — wrzuca obraz na tymczasowy hosting (24h), publikuje przez Instagram Graph API (kontener → `media_publish`) i oznacza kandydata jako opublikowanego.
