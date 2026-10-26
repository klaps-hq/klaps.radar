import type { Screening } from "../types/types";
import { formatDuration, splitScreeningDate } from "../utils/format";
import { DISPLAY_LINE_HEIGHT, EYEBROW_GAP, LAYOUTS } from "./template";

// Reel frames for the "klaps" concept: a clapperboard slate that snaps
// shut, a cinema "screen" (a widescreen still framed in black, under the
// title) cut on the beat, the date and venue landing line by line, and an
// end card. Every frame is a full, static composition: motion comes only
// from hard cuts and sound, never from fake camera moves on stills.
// Text keeps clear of the reel UI (top bar, caption block, action column).
const { width: W, height: H, pad: PAD, safeBottom: SAFE_BOTTOM, safeRight: SAFE_RIGHT } =
  LAYOUTS.reel;
const SAFE_TOP = 170;
const HAIRLINE = "rgba(255,255,255,0.22)";

export const REEL_SIZE = { width: W, height: H };
// The "screen": a 16:9 still across the full width.
export const SCREEN_SIZE = { width: W, height: Math.round((W * 9) / 16) };
const SCREEN_TOP = 700;

const WEEKDAYS_SHORT = ["NDZ", "PON", "WT", "ŚR", "CZW", "PT", "SOB"];

const describeDate = (screening: Screening) => {
  const { date, time } = splitScreeningDate(screening.date);
  const [y, m, d] = date.split("-").map(Number);
  const weekday = WEEKDAYS_SHORT[new Date(Date.UTC(y!, m! - 1, d!)).getUTCDay()]!;
  return { day: `${weekday} ${d}.${String(m).padStart(2, "0")}`, time };
};

const Logo = ({ size }: { size: number }) => (
  <div style={{ display: "flex", alignItems: "center", gap: Math.round(size * 0.4) }}>
    <svg width={Math.round(size * 0.94)} height={Math.round(size * 0.67)} viewBox="0 0 28 20" fill="none">
      <polygon points="0,8 28,0 28,20 0,12" fill="#ffffff" />
    </svg>
    <span style={{ fontSize: size, fontWeight: 700, letterSpacing: "-0.02em" }}>klaps</span>
  </div>
);

const Label = ({ children }: { children: React.ReactNode }) => (
  <span
    style={{
      fontSize: 22,
      textTransform: "uppercase",
      letterSpacing: "0.3em",
      color: "rgba(255,255,255,0.6)",
    }}
  >
    {children}
  </span>
);

const Value = ({ children, size }: { children: React.ReactNode; size: number }) => (
  <span
    style={{
      marginTop: 10,
      fontFamily: "Anton",
      fontSize: size,
      lineHeight: DISPLAY_LINE_HEIGHT,
      textTransform: "uppercase",
    }}
  >
    {children}
  </span>
);

const Frame = ({ children, justify = "flex-start" }: { children: React.ReactNode; justify?: string }) => (
  <div
    style={{
      width: W,
      height: H,
      display: "flex",
      flexDirection: "column",
      justifyContent: justify,
      position: "relative",
      backgroundColor: "#000000",
      color: "#ffffff",
      fontFamily: "Inter",
    }}
  >
    {children}
  </div>
);

// --- Slate -----------------------------------------------------------------

const SLATE_X = PAD;
const SLATE_W = W - PAD * 2;
const STICK_H = 92;
const STRIPES = 7;

// Diagonal black/white stripes of a clapper stick, as SVG polygons.
const stripes = (width: number, height: number, slant: number) =>
  Array.from({ length: STRIPES + 1 }, (_, i) => {
    const step = width / STRIPES;
    const x = i * step - step / 2;
    return `${x},${height} ${x + step / 2},${height} ${x + step / 2 + slant},0 ${x + slant},0`;
  });

// The hinged top stick is drawn rotated about its left end while open.
const ClapperSticks = ({ open }: { open: boolean }) => {
  const angle = open ? -17 : 0;
  const height = STICK_H * 2 + 230;
  const base = height - STICK_H;
  return (
    <svg width={SLATE_W} height={height} viewBox={`0 0 ${SLATE_W} ${height}`}>
      <g transform={`translate(0 ${base - STICK_H - 6}) rotate(${angle} 0 ${STICK_H})`}>
        <rect x="0" y="0" width={SLATE_W} height={STICK_H} fill="#ffffff" rx="6" />
        {stripes(SLATE_W, STICK_H, 46).map((points, i) => (
          <polygon key={i} points={points} fill="#000000" />
        ))}
        <rect x="1.5" y="1.5" width={SLATE_W - 3} height={STICK_H - 3} fill="none" stroke="#ffffff" strokeWidth="3" rx="6" />
      </g>
      <g transform={`translate(0 ${base})`}>
        <rect x="0" y="0" width={SLATE_W} height={STICK_H} fill="#ffffff" rx="6" />
        {stripes(SLATE_W, STICK_H, -46).map((points, i) => (
          <polygon key={i} points={points} fill="#000000" />
        ))}
        <rect x="1.5" y="1.5" width={SLATE_W - 3} height={STICK_H - 3} fill="none" stroke="#ffffff" strokeWidth="3" rx="6" />
      </g>
    </svg>
  );
};

const SlateCell = ({
  label,
  value,
  size,
  border = true,
  grow = 1,
}: {
  label: string;
  value: string;
  size: number;
  border?: boolean;
  grow?: number;
}) => (
  <div
    style={{
      display: "flex",
      flexDirection: "column",
      flexGrow: grow,
      flexBasis: 0,
      padding: "26px 30px",
      borderLeft: border ? `2px solid ${HAIRLINE}` : "none",
    }}
  >
    <Label>{label}</Label>
    <Value size={size}>{value}</Value>
  </div>
);

const slateTitleSize = (title: string): number => {
  if (title.length > 30) return 64;
  if (title.length > 20) return 80;
  if (title.length > 12) return 100;
  return 128;
};

export const ReelSlate = ({ screening, open }: { screening: Screening; open: boolean }) => {
  const { movie, cinema } = screening;
  const { day, time } = describeDate(screening);
  const row = { display: "flex", borderTop: `2px solid ${HAIRLINE}` } as const;
  return (
    <Frame>
      <div style={{ display: "flex", flexDirection: "column", padding: `${SAFE_TOP + 40}px ${SLATE_X}px 0` }}>
        <ClapperSticks open={open} />
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            marginTop: 8,
            border: "3px solid #ffffff",
            borderRadius: 8,
          }}
        >
          <div style={{ display: "flex" }}>
            <SlateCell label="Produkcja" value={movie.title} size={slateTitleSize(movie.title)} border={false} />
          </div>
          <div style={row}>
            <SlateCell label="Scena" value={day} size={76} border={false} />
            <SlateCell label="Ujęcie" value={time || "—"} size={76} />
          </div>
          <div style={row}>
            <SlateCell label="Rok" value={String(movie.productionYear)} size={76} border={false} />
            <SlateCell label="Czas" value={formatDuration(movie.duration) ?? "—"} size={76} />
          </div>
          <div style={row}>
            <SlateCell
              label="Kino"
              value={`${cinema.name}, ${cinema.city.name}`}
              size={cinema.name.length + cinema.city.name.length > 26 ? 52 : 68}
              border={false}
            />
          </div>
          <div
            style={{
              ...row,
              alignItems: "center",
              justifyContent: "space-between",
              padding: "24px 30px",
            }}
          >
            <Logo size={40} />
            <Label>klaps.space</Label>
          </div>
        </div>
      </div>
    </Frame>
  );
};

// --- Screen ----------------------------------------------------------------

const screenTitleSize = (title: string): number => {
  if (title.length > 28) return 84;
  if (title.length > 18) return 108;
  if (title.length > 10) return 136;
  return 170;
};

export const ReelScreen = ({
  screening,
  imageUrl,
  index,
  total,
}: {
  screening: Screening;
  imageUrl: string | null;
  index: number;
  total: number;
}) => {
  const { movie, cinema } = screening;
  return (
    <Frame>
      {/* Title block, bottom-aligned to sit right on top of the screen. */}
      <div
        style={{
          position: "absolute",
          left: PAD,
          right: PAD + SAFE_RIGHT,
          top: SAFE_TOP,
          height: SCREEN_TOP - SAFE_TOP - 36,
          display: "flex",
          flexDirection: "column",
          justifyContent: "flex-end",
        }}
      >
        <Label>Na dużym ekranie · {cinema.city.name}</Label>
        <span
          style={{
            marginTop: EYEBROW_GAP,
            fontFamily: "Anton",
            fontSize: screenTitleSize(movie.title),
            lineHeight: DISPLAY_LINE_HEIGHT,
            textTransform: "uppercase",
          }}
        >
          {movie.title}
        </span>
      </div>

      {imageUrl && (
        <img
          src={imageUrl}
          width={SCREEN_SIZE.width}
          height={SCREEN_SIZE.height}
          style={{ position: "absolute", left: 0, top: SCREEN_TOP }}
        />
      )}

      <div
        style={{
          position: "absolute",
          left: PAD,
          right: PAD + SAFE_RIGHT,
          top: SCREEN_TOP + SCREEN_SIZE.height + 36,
          display: "flex",
          justifyContent: "space-between",
        }}
      >
        <Label>
          {String(index + 1).padStart(2, "0")} / {String(total).padStart(2, "0")}
        </Label>
        <Label>
          {[movie.productionYear, formatDuration(movie.duration)].filter(Boolean).join(" · ")}
        </Label>
      </div>
    </Frame>
  );
};

// --- Info lines ------------------------------------------------------------

// Lines land one per beat; the frame for step N shows lines 0..N, and the
// rest are laid out but hidden so nothing shifts between steps.
export const ReelInfo = ({ screening, step }: { screening: Screening; step: number }) => {
  const { cinema } = screening;
  const { day, time } = describeDate(screening);
  const shown = (i: number) => ({ opacity: i <= step ? 1 : 0 });
  return (
    <Frame justify="center">
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          padding: `${SAFE_TOP}px ${PAD + SAFE_RIGHT}px ${SAFE_BOTTOM}px ${PAD}px`,
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", ...shown(0) }}>
          <Label>Seans</Label>
          <Value size={210}>{day}</Value>
        </div>
        <div style={{ display: "flex", flexDirection: "column", marginTop: 36, ...shown(1) }}>
          <Label>Godzina</Label>
          <Value size={150}>{time || "—"}</Value>
        </div>
        <div style={{ display: "flex", flexDirection: "column", marginTop: 36, ...shown(2) }}>
          <Label>{cinema.city.name}</Label>
          <Value size={cinema.name.length > 18 ? 84 : 110}>{cinema.name}</Value>
          <span style={{ marginTop: 14, fontSize: 28, color: "rgba(255,255,255,0.7)" }}>
            {cinema.instagramUsername ? `@${cinema.instagramUsername} · ` : ""}
            {cinema.street}
          </span>
        </div>
      </div>
    </Frame>
  );
};
export const INFO_STEPS = 3;

// --- End card --------------------------------------------------------------

export const ReelEndCard = ({ screening }: { screening: Screening }) => (
  <Frame justify="center">
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        padding: `${SAFE_TOP}px ${PAD + SAFE_RIGHT}px ${SAFE_BOTTOM}px ${PAD}px`,
      }}
    >
      <Label>{screening.movie.title}</Label>
      <Value size={132}>Bilety i cały repertuar</Value>
      <div style={{ width: 72, borderTop: "5px solid #ffffff", marginTop: 40 }} />
      <Value size={96}>klaps.space</Value>
      <span
        style={{
          marginTop: 20,
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
  </Frame>
);
