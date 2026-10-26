import type { Screening } from "../types/types";
import { buildHook } from "../utils/caption";
import { formatDuration, splitScreeningDate } from "../utils/format";
import { DISPLAY_LINE_HEIGHT, EYEBROW_GAP, LAYOUTS } from "./template";

// Reel v2 overlays. Each scene of the montage gets its own transparent PNG
// (scrim + one message), so the video can animate them in one at a time;
// the intro and end cards are opaque. Text keeps clear of the reel UI:
// top bar, caption block at the bottom, action column on the right.
const { width: W, height: H, pad: PAD, safeBottom: SAFE_BOTTOM, safeRight: SAFE_RIGHT } =
  LAYOUTS.reel;
const SAFE_TOP = 170;

const WEEKDAYS_SHORT = ["NDZ", "PON", "WT", "ŚR", "CZW", "PT", "SOB"];

const Logo = ({ size }: { size: number }) => (
  <div style={{ display: "flex", alignItems: "center", gap: Math.round(size * 0.4) }}>
    <svg width={Math.round(size * 0.94)} height={Math.round(size * 0.67)} viewBox="0 0 28 20" fill="none">
      <polygon points="0,8 28,0 28,20 0,12" fill="#ffffff" />
    </svg>
    <span style={{ fontSize: size, fontWeight: 700, letterSpacing: "-0.02em" }}>klaps</span>
  </div>
);

const Eyebrow = ({ children, size = 26 }: { children: React.ReactNode; size?: number }) => (
  <span
    style={{
      fontSize: size,
      textTransform: "uppercase",
      letterSpacing: "0.3em",
      color: "rgba(255,255,255,0.75)",
    }}
  >
    {children}
  </span>
);

const Display = ({ children, size }: { children: React.ReactNode; size: number }) => (
  <span
    style={{
      marginTop: EYEBROW_GAP,
      fontFamily: "Anton",
      fontSize: size,
      lineHeight: DISPLAY_LINE_HEIGHT,
      textTransform: "uppercase",
      letterSpacing: "0.01em",
    }}
  >
    {children}
  </span>
);

// Bottom-anchored text block over a bottom scrim, used by the three scenes.
const SceneOverlay = ({ children }: { children: React.ReactNode }) => (
  <div
    style={{
      width: W,
      height: H,
      display: "flex",
      flexDirection: "column",
      justifyContent: "flex-end",
      color: "#ffffff",
      fontFamily: "Inter",
      padding: `0 ${PAD + SAFE_RIGHT}px ${SAFE_BOTTOM + PAD}px ${PAD}px`,
      backgroundImage:
        "linear-gradient(180deg, rgba(0,0,0,0.35) 0%, rgba(0,0,0,0) 18%, rgba(0,0,0,0) 45%, rgba(0,0,0,0.88) 82%, rgba(0,0,0,0.95) 100%)",
    }}
  >
    {children}
  </div>
);

const titleSize = (title: string): number => {
  if (title.length > 28) return 92;
  if (title.length > 18) return 116;
  if (title.length > 10) return 140;
  return 170;
};

export const ReelIntro = ({ screening }: { screening: Screening }) => (
  <div
    style={{
      width: W,
      height: H,
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: "#000000",
      color: "#ffffff",
      fontFamily: "Inter",
      padding: `0 ${PAD}px`,
    }}
  >
    <Logo size={64} />
    <span
      style={{
        marginTop: 56,
        fontSize: 44,
        textAlign: "center",
        textTransform: "uppercase",
        letterSpacing: "0.24em",
        color: "rgba(255,255,255,0.8)",
        lineHeight: 1.5,
      }}
    >
      {buildHook(screening)}
    </span>
  </div>
);

export const ReelTitleScene = ({ screening }: { screening: Screening }) => {
  const { movie } = screening;
  const eyebrow = [movie.productionYear, formatDuration(movie.duration)]
    .filter(Boolean)
    .join(" · ");
  return (
    <SceneOverlay>
      <Eyebrow>{eyebrow}</Eyebrow>
      <Display size={titleSize(movie.title)}>{movie.title}</Display>
    </SceneOverlay>
  );
};

export const ReelDateScene = ({ screening }: { screening: Screening }) => {
  const { date, time } = splitScreeningDate(screening.date);
  const [y, m, d] = date.split("-").map(Number);
  const weekday = WEEKDAYS_SHORT[new Date(Date.UTC(y!, m! - 1, d!)).getUTCDay()];
  return (
    <SceneOverlay>
      <Eyebrow>Seans na dużym ekranie</Eyebrow>
      <Display size={200}>
        {weekday} {d}.{String(m).padStart(2, "0")}
      </Display>
      {time && (
        <span style={{ fontFamily: "Anton", fontSize: 96, lineHeight: DISPLAY_LINE_HEIGHT, color: "rgba(255,255,255,0.85)" }}>
          godz. {time}
        </span>
      )}
    </SceneOverlay>
  );
};

export const ReelPlaceScene = ({ screening }: { screening: Screening }) => {
  const { cinema } = screening;
  return (
    <SceneOverlay>
      <Eyebrow>{cinema.city.name}</Eyebrow>
      <Display size={cinema.name.length > 22 ? 88 : 120}>{cinema.name}</Display>
      <span
        style={{
          marginTop: 18,
          fontSize: 28,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          color: "rgba(255,255,255,0.7)",
        }}
      >
        {cinema.instagramUsername ? `@${cinema.instagramUsername} · ` : ""}
        {cinema.street}
      </span>
    </SceneOverlay>
  );
};

export const ReelEndCard = ({ screening }: { screening: Screening }) => (
  <div
    style={{
      width: W,
      height: H,
      display: "flex",
      flexDirection: "column",
      justifyContent: "center",
      backgroundColor: "#000000",
      color: "#ffffff",
      fontFamily: "Inter",
      padding: `${SAFE_TOP}px ${PAD + SAFE_RIGHT}px ${SAFE_BOTTOM}px ${PAD}px`,
    }}
  >
    <Eyebrow>{screening.movie.title}</Eyebrow>
    <Display size={132}>Bilety i cały repertuar</Display>
    <div style={{ width: 72, borderTop: "5px solid #ffffff", marginTop: 40 }} />
    <span
      style={{
        marginTop: 40,
        fontFamily: "Anton",
        fontSize: 96,
        lineHeight: DISPLAY_LINE_HEIGHT,
        textTransform: "uppercase",
      }}
    >
      klaps.space
    </span>
    <span
      style={{
        marginTop: 24,
        fontSize: 28,
        letterSpacing: "0.2em",
        textTransform: "uppercase",
        color: "rgba(255,255,255,0.7)",
      }}
    >
      Link w bio
    </span>
    <div style={{ display: "flex", marginTop: 90 }}>
      <Logo size={48} />
    </div>
  </div>
);

export const REEL_SIZE = { width: W, height: H };
