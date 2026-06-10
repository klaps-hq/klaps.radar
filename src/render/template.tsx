import type { Screening } from "../types/types";
import {
  formatDuration,
  formatPolishDate,
  splitScreeningDate,
} from "../utils/format";

export type Variant = "post" | "story";

// Teaser look inspired by zine film posters: a duotone movie still fills a
// framed card, an oversized condensed title hooks the eye, and the graphic
// carries only date + city - full details live in the caption.
// Pure black: anything else shows as a second shade against Instagram's
// black app background.
const FRAME_COLOR = "#000000";

export const LAYOUTS = {
  post: {
    width: 1080,
    height: 1350,
    frame: { top: 32, right: 64, bottom: 32, left: 64 },
    radius: 16,
    pad: 56,
    headerTop: 42,
    titleBase: 112,
    eyebrowSize: 22,
    dateSize: 44,
    hookSize: 23,
  },
  story: {
    width: 1080,
    height: 1920,
    // The card starts below Instagram's story UI (avatar, name, close
    // button) and keeps wider margins so tray thumbnails read cleanly.
    frame: { top: 160, right: 44, bottom: 56, left: 44 },
    radius: 18,
    pad: 64,
    headerTop: 150,
    titleBase: 160,
    eyebrowSize: 25,
    dateSize: 60,
    hookSize: 26,
  },
} as const;

type Layout = (typeof LAYOUTS)[Variant];

const getCardRect = (layout: Layout) => ({
  x: layout.frame.left,
  y: layout.frame.top,
  width: layout.width - layout.frame.left - layout.frame.right,
  height: layout.height - layout.frame.top - layout.frame.bottom,
  radius: layout.radius,
});

// Long titles shrink so they keep to one or two lines at most.
const getTitleSize = (title: string, base: number): number => {
  if (title.length > 24) return Math.round(base * 0.54);
  if (title.length > 16) return Math.round(base * 0.66);
  if (title.length > 10) return Math.round(base * 0.82);
  return base;
};

export const ScreeningImage = ({
  screening,
  imageUrl,
  variant,
}: {
  screening: Screening;
  imageUrl: string | null;
  variant: Variant;
}) => {
  const layout = LAYOUTS[variant];
  const { movie, cinema } = screening;
  const { date, time } = splitScreeningDate(screening.date);

  const card = getCardRect(layout);
  const cardWidth = card.width;
  const cardHeight = card.height;

  const eyebrow = [movie.productionYear, formatDuration(movie.duration)]
    .filter(Boolean)
    .join(" · ");

  return (
    <div
      style={{
        width: layout.width,
        height: layout.height,
        display: "flex",
        position: "relative",
        color: "#ffffff",
        fontFamily: "Inter",
        padding: `${layout.frame.top}px ${layout.frame.right}px ${layout.frame.bottom}px ${layout.frame.left}px`,
        backgroundColor: FRAME_COLOR,
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          position: "relative",
          width: cardWidth,
          height: cardHeight,
          borderRadius: layout.radius,
          overflow: "hidden",
          // Transparent on purpose: the video pipeline renders this template
          // without an image and lays the PNG over the animated backdrop -
          // the card area must stay a see-through window.
          backgroundColor: "rgba(0,0,0,0)",
        }}
      >
        {imageUrl && (
          <img
            src={imageUrl}
            width={cardWidth}
            height={cardHeight}
            style={{
              position: "absolute",
              width: cardWidth,
              height: cardHeight,
              objectFit: "cover",
              borderRadius: layout.radius,
            }}
          />
        )}

        {/* Legibility scrims: light at the top for the logo, heavy at the
            bottom for the title block. Layers carry the radius themselves -
            satori does not clip absolute children via overflow:hidden. */}
        <div
          style={{
            position: "absolute",
            width: cardWidth,
            height: cardHeight,
            backgroundImage:
              "linear-gradient(180deg, rgba(0,0,0,0.5) 0%, rgba(0,0,0,0.05) 26%, rgba(0,0,0,0.12) 52%, rgba(0,0,0,0.94) 86%)",
            borderRadius: layout.radius,
          }}
        />

        {/* Story skips the brand bar: Instagram already shows the profile
            name at the top, so the logo would only duplicate the UI. */}
        {variant === "post" && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: `${layout.headerTop}px ${layout.pad}px 0 ${layout.pad}px`,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <svg width={34} height={24} viewBox="0 0 28 20" fill="none">
                <polygon points="0,8 28,0 28,20 0,12" fill="#ffffff" />
              </svg>
              <span
                style={{ fontSize: 36, fontWeight: 700, letterSpacing: "-0.02em" }}
              >
                klaps
              </span>
            </div>
            <span
              style={{
                fontSize: 22,
                textTransform: "uppercase",
                letterSpacing: "0.28em",
                color: "rgba(255,255,255,0.85)",
              }}
            >
              {cinema.city.name}
            </span>
          </div>
        )}

        <div style={{ display: "flex", flex: 1 }} />

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            padding: `0 ${layout.pad}px ${Math.round(layout.pad * 0.9)}px ${layout.pad}px`,
          }}
        >
          {eyebrow && (
            <span
              style={{
                fontSize: layout.eyebrowSize,
                textTransform: "uppercase",
                letterSpacing: "0.3em",
                color: "rgba(255,255,255,0.7)",
              }}
            >
              {eyebrow}
            </span>
          )}

          <span
            style={{
              marginTop: 10,
              fontFamily: "Anton",
              fontSize: getTitleSize(movie.title, layout.titleBase),
              textTransform: "uppercase",
              letterSpacing: "0.01em",
              lineHeight: 1.05,
            }}
          >
            {movie.title}
          </span>

          <div
            style={{
              width: 64,
              borderTop: "4px solid #ffffff",
              marginTop: 26,
            }}
          />

          <span
            style={{
              marginTop: 24,
              fontFamily: "Anton",
              fontSize: layout.dateSize,
              textTransform: "uppercase",
              letterSpacing: "0.02em",
              color: "#ffffff",
            }}
          >
            {formatPolishDate(date)}
            {time ? ` · ${time}` : ""}
          </span>

          <span
            style={{
              marginTop: 14,
              fontSize: layout.eyebrowSize + 1,
              textTransform: "uppercase",
              letterSpacing: "0.2em",
              color: "rgba(255,255,255,0.6)",
            }}
          >
            {cinema.name}
            {variant === "story" ? ` · ${cinema.city.name}` : ""}
          </span>

          <div
            style={{
              width: "100%",
              borderTop: "1px solid rgba(255,255,255,0.25)",
              marginTop: 28,
            }}
          />

          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginTop: 22,
            }}
          >
            <span
              style={{
                fontSize: layout.hookSize,
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.18em",
                color: "rgba(255,255,255,0.92)",
              }}
            >
              {variant === "post"
                ? "Szczegóły w opisie"
                : "Sprawdź na klaps.space"}
            </span>
            {/* Lucide arrow-right - the same mark the klaps.space frontend
                uses in its OG footer. */}
            <svg
              width="38"
              height="38"
              viewBox="0 0 24 24"
              fill="none"
              stroke="rgba(255,255,255,0.92)"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M5 12h14" />
              <path d="m12 5 7 7-7 7" />
            </svg>
          </div>
        </div>
      </div>
    </div>
  );
};
