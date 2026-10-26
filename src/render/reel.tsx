import type { Screening } from "../types/types";
import { splitScreeningDate } from "../utils/format";
import { DISPLAY_LINE_HEIGHT, LAYOUTS } from "./template";

// Overlays for the line-up reel ("najbliższe dni w kinach studyjnych"),
// styled like native short-form edits: a boxed hook caption (black on
// white, as typed in the Instagram editor), one card per screening over its
// poster, and a short end card. All but the end card are transparent PNGs
// laid over the posters. Text keeps clear of the reel UI: top bar, caption
// block at the bottom, action column on the right.
const { width: W, height: H, pad: PAD, safeBottom: SAFE_BOTTOM, safeRight: SAFE_RIGHT } =
  LAYOUTS.reel;
const SAFE_TOP = 170;

export const REEL_SIZE = { width: W, height: H };

const WEEKDAYS_SHORT = ["ndz", "pon", "wt", "śr", "czw", "pt", "sob"];
const SHADOW = "0 4px 24px rgba(0,0,0,0.55), 0 2px 6px rgba(0,0,0,0.6)";

// Instagram-editor style caption: each line in its own white box.
export const ReelCaption = ({ lines }: { lines: string[] }) => (
  <div
    style={{
      width: W,
      height: H,
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      paddingTop: Math.round(H * 0.36),
      paddingLeft: PAD,
      paddingRight: PAD + SAFE_RIGHT,
      fontFamily: "Inter",
    }}
  >
    {lines.map((line, i) => (
      <span
        key={i}
        style={{
          marginTop: i === 0 ? 0 : 10,
          padding: "10px 22px 14px",
          borderRadius: 10,
          backgroundColor: "#ffffff",
          color: "#000000",
          fontSize: 58,
          fontWeight: 700,
          letterSpacing: "-0.01em",
        }}
      >
        {line}
      </span>
    ))}
  </div>
);

export const formatReelDay = (screening: Screening): string => {
  const { date, time } = splitScreeningDate(screening.date);
  const [y, m, d] = date.split("-").map(Number);
  const weekday = WEEKDAYS_SHORT[new Date(Date.UTC(y!, m! - 1, d!)).getUTCDay()]!;
  return `${weekday} ${d}.${String(m).padStart(2, "0")}${time ? ` · ${time}` : ""}`;
};

const titleSize = (title: string): number => {
  if (title.length > 28) return 92;
  if (title.length > 18) return 112;
  if (title.length > 10) return 140;
  return 176;
};

// One screening over its poster: counter top-left, then title, when and
// where in a block above the caption area, over a bottom scrim.
export const ReelLineupItem = ({
  screening,
  index,
  total,
}: {
  screening: Screening;
  index: number;
  total: number;
}) => {
  const { movie, cinema } = screening;
  return (
    <div
      style={{
        width: W,
        height: H,
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: `${SAFE_TOP}px ${PAD + SAFE_RIGHT}px ${SAFE_BOTTOM + 40}px ${PAD}px`,
        color: "#ffffff",
        fontFamily: "Inter",
        backgroundImage:
          "linear-gradient(180deg, rgba(0,0,0,0.45) 0%, rgba(0,0,0,0) 22%, rgba(0,0,0,0) 48%, rgba(0,0,0,0.85) 78%, rgba(0,0,0,0.92) 100%)",
      }}
    >
      <span
        style={{
          fontFamily: "Anton",
          fontSize: 72,
          lineHeight: DISPLAY_LINE_HEIGHT,
          textShadow: SHADOW,
        }}
      >
        {index + 1}/{total}
      </span>
      <div style={{ display: "flex", flexDirection: "column" }}>
        <span
          style={{
            fontSize: 32,
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.16em",
            textShadow: SHADOW,
          }}
        >
          {formatReelDay(screening)} · {cinema.city.name}
        </span>
        <span
          style={{
            marginTop: 14,
            fontFamily: "Anton",
            fontSize: titleSize(movie.title),
            lineHeight: DISPLAY_LINE_HEIGHT,
            textTransform: "uppercase",
            textShadow: SHADOW,
          }}
        >
          {movie.title}
        </span>
        <span
          style={{
            marginTop: 12,
            fontSize: 32,
            fontWeight: 700,
            color: "rgba(255,255,255,0.85)",
            textShadow: SHADOW,
          }}
        >
          {cinema.name}
          {cinema.instagramUsername ? ` · @${cinema.instagramUsername}` : ""}
        </span>
      </div>
    </div>
  );
};

const Logo = ({ size }: { size: number }) => (
  <div style={{ display: "flex", alignItems: "center", gap: Math.round(size * 0.4) }}>
    <svg width={Math.round(size * 0.94)} height={Math.round(size * 0.67)} viewBox="0 0 28 20" fill="none">
      <polygon points="0,8 28,0 28,20 0,12" fill="#ffffff" />
    </svg>
    <span style={{ fontSize: size, fontWeight: 700, letterSpacing: "-0.02em" }}>klaps</span>
  </div>
);

// Short end card; ends on black so the loop back to the first frame cuts.
export const ReelEnd = () => (
  <div
    style={{
      width: W,
      height: H,
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      paddingBottom: SAFE_BOTTOM,
      backgroundColor: "#000000",
      color: "#ffffff",
      fontFamily: "Inter",
    }}
  >
    <Logo size={72} />
    <span style={{ marginTop: 40, fontSize: 44, fontWeight: 700 }}>
      Wszystkie seanse: klaps.space
    </span>
    <span style={{ marginTop: 14, fontSize: 30, color: "rgba(255,255,255,0.65)" }}>
      Zapisz, żeby nie przegapić · link w bio
    </span>
  </div>
);
