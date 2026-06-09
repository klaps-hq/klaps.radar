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
const CANVAS = "#0b0b0b";

export const LAYOUTS = {
  post: {
    width: 1080,
    height: 1350,
    framePad: 26,
    radius: 16,
    pad: 56,
    titleBase: 148,
    eyebrowSize: 23,
    dateSize: 52,
    hookSize: 24,
  },
  story: {
    width: 1080,
    height: 1920,
    framePad: 30,
    radius: 18,
    pad: 64,
    titleBase: 160,
    eyebrowSize: 25,
    dateSize: 60,
    hookSize: 26,
  },
} as const;

// Long titles shrink so they keep to one or two lines at most.
const getTitleSize = (title: string, base: number): number => {
  if (title.length > 24) return Math.round(base * 0.5);
  if (title.length > 16) return Math.round(base * 0.62);
  if (title.length > 10) return Math.round(base * 0.78);
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

  const cardWidth = layout.width - layout.framePad * 2;
  const cardHeight = layout.height - layout.framePad * 2;

  const eyebrow = [movie.productionYear, formatDuration(movie.duration)]
    .filter(Boolean)
    .join(" · ");

  return (
    <div
      style={{
        width: layout.width,
        height: layout.height,
        display: "flex",
        backgroundColor: CANVAS,
        color: "#ffffff",
        fontFamily: "Inter",
        padding: layout.framePad,
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
          backgroundColor: "#1a1a1a",
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

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: `${Math.round(layout.pad * 0.75)}px ${layout.pad}px 0 ${layout.pad}px`,
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
