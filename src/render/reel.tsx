import type { Screening } from "../types/types";
import { formatDuration, splitScreeningDate } from "../utils/format";
import { DISPLAY_LINE_HEIGHT, LAYOUTS } from "./template";

// Overlays for the reel, styled like native short-form edits rather than
// motion-graphics cards: boxed captions (black on white, as people type
// them in the Instagram editor), a big shadowed title over the footage,
// and a short end card. All are transparent PNGs laid over the stills,
// except the end card. Text keeps clear of the reel UI: top bar, caption
// block at the bottom, action column on the right.
const { width: W, height: H, pad: PAD, safeBottom: SAFE_BOTTOM, safeRight: SAFE_RIGHT } =
  LAYOUTS.reel;

export const REEL_SIZE = { width: W, height: H };

const WEEKDAYS = ["niedziela", "poniedziałek", "wtorek", "środa", "czwartek", "piątek", "sobota"];
const SHADOW = "0 4px 24px rgba(0,0,0,0.55), 0 2px 6px rgba(0,0,0,0.6)";

const Layer = ({
  children,
  align = "center",
  top,
}: {
  children: React.ReactNode;
  align?: "center" | "flex-start";
  top: number;
}) => (
  <div
    style={{
      width: W,
      height: H,
      display: "flex",
      flexDirection: "column",
      alignItems: align,
      paddingTop: top,
      paddingLeft: PAD,
      paddingRight: PAD + SAFE_RIGHT,
      color: "#ffffff",
      fontFamily: "Inter",
    }}
  >
    {children}
  </div>
);

// Instagram-editor style caption: each line in its own white box.
export const ReelCaption = ({ lines }: { lines: string[] }) => (
  <Layer top={Math.round(H * 0.36)}>
    {lines.map((line, i) => (
      <span
        key={i}
        style={{
          marginTop: i === 0 ? 0 : 10,
          padding: "10px 22px 14px",
          borderRadius: 10,
          backgroundColor: "#ffffff",
          color: "#000000",
          fontSize: 64,
          fontWeight: 700,
          letterSpacing: "-0.01em",
        }}
      >
        {line}
      </span>
    ))}
  </Layer>
);

const titleSize = (title: string): number => {
  if (title.length > 28) return 96;
  if (title.length > 18) return 120;
  if (title.length > 10) return 150;
  return 190;
};

export const ReelTitle = ({ screening }: { screening: Screening }) => {
  const { movie } = screening;
  return (
    <Layer top={Math.round(H * 0.5)} align="flex-start">
      <span
        style={{
          fontSize: 28,
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: "0.24em",
          textShadow: SHADOW,
        }}
      >
        {[movie.productionYear, formatDuration(movie.duration)].filter(Boolean).join(" · ")}
      </span>
      <span
        style={{
          marginTop: 16,
          fontFamily: "Anton",
          fontSize: titleSize(movie.title),
          lineHeight: DISPLAY_LINE_HEIGHT,
          textTransform: "uppercase",
          textShadow: SHADOW,
        }}
      >
        {movie.title}
      </span>
    </Layer>
  );
};

export const describeWhen = (screening: Screening) => {
  const { date, time } = splitScreeningDate(screening.date);
  const [y, m, d] = date.split("-").map(Number);
  const weekday = WEEKDAYS[new Date(Date.UTC(y!, m! - 1, d!)).getUTCDay()]!;
  return { weekday, dayMonth: `${d}.${String(m).padStart(2, "0")}`, time };
};

// Date/time or venue, big and shadowed over a dimmed still.
export const ReelInfo = ({ eyebrow, big, small }: { eyebrow: string; big: string; small?: string }) => (
  <Layer top={Math.round(H * 0.4)} align="flex-start">
    <span
      style={{
        fontSize: 30,
        fontWeight: 700,
        textTransform: "uppercase",
        letterSpacing: "0.22em",
        textShadow: SHADOW,
      }}
    >
      {eyebrow}
    </span>
    <span
      style={{
        marginTop: 16,
        fontFamily: "Anton",
        fontSize: big.length > 16 ? 120 : 170,
        lineHeight: DISPLAY_LINE_HEIGHT,
        textTransform: "uppercase",
        textShadow: SHADOW,
      }}
    >
      {big}
    </span>
    {small && (
      <span style={{ marginTop: 18, fontSize: 36, fontWeight: 700, textShadow: SHADOW }}>
        {small}
      </span>
    )}
  </Layer>
);

const Logo = ({ size }: { size: number }) => (
  <div style={{ display: "flex", alignItems: "center", gap: Math.round(size * 0.4) }}>
    <svg width={Math.round(size * 0.94)} height={Math.round(size * 0.67)} viewBox="0 0 28 20" fill="none">
      <polygon points="0,8 28,0 28,20 0,12" fill="#ffffff" />
    </svg>
    <span style={{ fontSize: size, fontWeight: 700, letterSpacing: "-0.02em" }}>klaps</span>
  </div>
);

// Short end card; ends on black so the loop back to the first frame cuts.
export const ReelEnd = ({ screening }: { screening: Screening }) => (
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
    <span style={{ marginTop: 40, fontSize: 40, fontWeight: 700 }}>
      Bilety i repertuar: klaps.space
    </span>
    <span style={{ marginTop: 14, fontSize: 30, color: "rgba(255,255,255,0.65)" }}>
      {screening.movie.title} · link w bio
    </span>
  </div>
);
