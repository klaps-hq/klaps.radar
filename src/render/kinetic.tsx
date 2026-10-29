import satori from "satori";
import sharp from "sharp";
import type { Screening } from "../types/types";
import { formatDuration, formatPolishDate, splitScreeningDate } from "../utils/format";
import { loadFonts } from "./render";
import { DISPLAY_LINE_HEIGHT, EYEBROW_GAP } from "./template";

// Line-up reel frames in klaps' own visual language, the same as the post
// and story templates: black frame, a rounded card with the poster held
// still, logo and city in the card header, and one text block (eyebrow,
// title, rule, date, venue) low on the card, in the same place every time,
// clear of the reel's caption lines and action rail. Motion is calm:
// cards dissolve into each other and the block's lines fade up in turn.
export const W = 1080;
export const H = 1920;

// Card geometry: the full frame inside one even margin, so the poster runs
// the whole height under the reel UI instead of leaving a black band on top.
const MARGIN = 44;
const CARD = { x: MARGIN, y: MARGIN, width: W - MARGIN * 2, height: H - MARGIN * 2, radius: 18 };
const PAD = 56;
// Reel UI: the top bar (~270 px), the username and a short caption at the
// bottom, and the action rail on the right of the lower half. As in the
// post template the text block sits low on the card so the poster stays
// visible, but it ends ~440 px above the bottom edge (clear of the
// username/caption lines) and stops short of the action rail on the right.
const HEADER_TOP = 300;
// The Halloween reel keeps its header in the card's top corners.
const HALLOWEEN_HEADER_TOP = 96;
const BLOCK_BOTTOM = 1480;
const BLOCK_RIGHT = 250;

const MUTED = "rgba(255,255,255,0.7)";
const FAINT = "rgba(255,255,255,0.6)";
// Small muted lines can land on a bright part of the poster above the
// scrim; a soft shadow keeps them legible there.
const SMALL_SHADOW = "0 2px 12px rgba(0,0,0,0.6)";

// Seasonal look of a reel. Here: the accent of the small lines, the rule
// and the address; the cover, the warm duotone, the grain and the flicker
// are in the Halloween hook below and in src/render/video.ts.
export type Theme = "halloween";
export const ACCENT: Record<Theme, string> = { halloween: "#ff7a1a" };

export const LINE_FADE_S = 0.5;
export const LINE_STAGGER_S = 0.07;
const LINE_RISE_PX = 16;

export type Scene = {
  start: number;
  end: number;
  // Card background (poster, scrim, header), rendered once per scene.
  base: React.ReactNode;
  // Text block lines, faded up in order from `textAt`.
  lines: React.ReactNode[];
  textAt: number;
  // Moments (from the scene start) when the whole frame dims to `level`,
  // like a failing lamp.
  flicker?: { at: number; dur: number; level: number }[];
  // Moving elements over the base, drawn anew every frame from the time
  // since the scene start (the Halloween end card).
  motion?: (since: number) => React.ReactNode;
};

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
export const easeOutCubic = (x: number) => 1 - (1 - clamp01(x)) ** 3;
export const easeInOutSine = (x: number) => -(Math.cos(Math.PI * clamp01(x)) - 1) / 2;

// --- Pieces ------------------------------------------------------------------

const Logo = ({ size }: { size: number }) => (
  <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
    <svg width={Math.round(size * 0.94)} height={Math.round(size * 0.67)} viewBox="0 0 28 20" fill="none">
      <polygon points="0,8 28,0 28,20 0,12" fill="#ffffff" />
    </svg>
    <span style={{ fontSize: size, fontWeight: 700, letterSpacing: "-0.02em" }}>klaps</span>
  </div>
);

const Eyebrow = ({ text, theme }: { text: string; theme?: Theme }) => (
  <span style={{ fontSize: 25, textTransform: "uppercase", letterSpacing: "0.3em", color: theme ? ACCENT[theme] : MUTED, textShadow: SMALL_SHADOW }}>
    {text}
  </span>
);

const Title = ({ text, size }: { text: string; size: number }) => (
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
    {text}
  </span>
);

const Rule = ({ theme }: { theme?: Theme }) => (
  <div style={{ width: 64, borderTop: `4px solid ${theme ? ACCENT[theme] : "#ffffff"}`, marginTop: 26 }} />
);

const Big = ({ text }: { text: string }) => (
  <span
    style={{
      marginTop: 24,
      fontFamily: "Anton",
      fontSize: 50,
      lineHeight: DISPLAY_LINE_HEIGHT,
      textTransform: "uppercase",
      letterSpacing: "0.02em",
    }}
  >
    {text}
  </span>
);

const Small = ({ text, color = FAINT }: { text: string; color?: string }) => (
  <span
    style={{
      marginTop: 14,
      fontSize: 26,
      textTransform: "uppercase",
      letterSpacing: "0.2em",
      color,
      textShadow: SMALL_SHADOW,
    }}
  >
    {text}
  </span>
);

// Long titles shrink so they keep to two lines at most (as the templates).
const titleSize = (title: string): number => {
  if (title.length > 24) return 72;
  if (title.length > 16) return 88;
  if (title.length > 10) return 104;
  return 124;
};

// The card behind the text: poster (or plain black) with the templates'
// scrim, and the header row. `dim` darkens the poster further (hook).
const CardBase = ({
  imageUrl,
  meta,
  dim = 0,
  header = true,
  headerTop = HEADER_TOP,
}: {
  imageUrl: string | null;
  meta?: string; // header right: counter and city
  dim?: number;
  header?: boolean;
  headerTop?: number;
}) => (
  <div
    style={{
      width: W,
      height: H,
      display: "flex",
      position: "relative",
      backgroundColor: "#000000",
      color: "#ffffff",
      fontFamily: "Inter",
    }}
  >
    <div
      style={{
        position: "absolute",
        left: CARD.x,
        top: CARD.y,
        width: CARD.width,
        height: CARD.height,
        display: "flex",
        borderRadius: CARD.radius,
        overflow: "hidden",
        backgroundColor: "#0a0a0a",
        border: imageUrl ? "none" : "1px solid rgba(255,255,255,0.12)",
      }}
    >
      {imageUrl && (
        <img
          src={imageUrl}
          width={CARD.width}
          height={CARD.height}
          style={{ position: "absolute", width: CARD.width, height: CARD.height, borderRadius: CARD.radius }}
        />
      )}
      {imageUrl && (
        <div
          style={{
            position: "absolute",
            width: CARD.width,
            height: CARD.height,
            borderRadius: CARD.radius,
            // A soft band behind the header (the poster now runs to the top,
            // often with its own title art there), dark again only over the
            // lower part where the text block sits, so most of the poster stays clear.
            backgroundImage: `linear-gradient(180deg, rgba(0,0,0,${0.55 + dim}) 0%, rgba(0,0,0,${0.35 + dim}) 12%, rgba(0,0,0,${0.05 + dim}) 22%, rgba(0,0,0,${0.05 + dim}) 45%, rgba(0,0,0,${0.55 + dim / 2}) 60%, rgba(0,0,0,0.9) 73%, rgba(0,0,0,0.96) 100%)`,
          }}
        />
      )}
    </div>
    {header && (
    <div
      style={{
        position: "absolute",
        left: CARD.x + PAD,
        right: CARD.x + PAD,
        top: headerTop,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
      }}
    >
      <Logo size={36} />
      {meta && (
        <span style={{ fontSize: 22, textTransform: "uppercase", letterSpacing: "0.28em", color: "rgba(255,255,255,0.85)" }}>
          {meta}
        </span>
      )}
    </div>
    )}
  </div>
);

// --- Scenes ------------------------------------------------------------------

// Lines start fading up just after the dissolve into the card.
const TEXT_DELAY_S = 0.25;

export const hookScene = (
  lines: [string, string],
  imageUrl: string | null,
  start: number,
  end: number
): Scene => ({
  start,
  end,
  textAt: start + TEXT_DELAY_S,
  base: <CardBase imageUrl={imageUrl} dim={0.15} />,
  lines: [
    <Eyebrow key="e" text="Repertuar kin studyjnych" />,
    <Title key="t" text={lines[0]} size={104} />,
    <Rule key="r" />,
    <Big key="b" text={lines[1]} />,
  ],
});

// Halloween cover: no poster behind it, the word itself across the whole
// card in the accent, the line-up's posters fanned out below it, and the
// dates in the usual text block. The frame flickers as it opens.
const HALLOWEEN_SIZE = 206;
const STRIP_TOP = 500;
export const STRIP_POSTER = { width: 250, height: 375 };
// Posters overlap so five fit the card's width; odd ones sit lower.
const STRIP_STEP = Math.floor((CARD.width - PAD * 2 - STRIP_POSTER.width) / 4);
const STRIP_STAGGER = 40;
const STRIP_TILT = [-5, 3, -2, 4, -4];
const HOOK_FLICKER = [
  { at: 0.5, dur: 0.07, level: 0.25 },
  { at: 0.63, dur: 0.04, level: 0.6 },
  { at: 1.35, dur: 0.1, level: 0.2 },
];

const HalloweenCover = ({ posters }: { posters: (string | null)[] }) => (
  <div style={{ width: W, height: H, display: "flex", position: "relative", backgroundColor: "#000000", color: "#ffffff", fontFamily: "Inter" }}>
    <div
      style={{
        position: "absolute",
        left: CARD.x,
        top: CARD.y,
        width: CARD.width,
        height: CARD.height,
        display: "flex",
        borderRadius: CARD.radius,
        backgroundColor: "#0a0a0a",
        border: "1px solid rgba(255,255,255,0.12)",
      }}
    />
    <div style={{ position: "absolute", left: CARD.x + PAD, top: HALLOWEEN_HEADER_TOP, display: "flex" }}>
      <Logo size={36} />
    </div>
    <span
      style={{
        position: "absolute",
        left: CARD.x + PAD - 6,
        top: HALLOWEEN_HEADER_TOP + 70,
        fontFamily: "Anton",
        fontSize: HALLOWEEN_SIZE,
        lineHeight: 1,
        color: ACCENT.halloween,
      }}
    >
      HALLOWEEN
    </span>
    {posters.slice(0, 5).map((src, i) => {
      const style = {
        position: "absolute" as const,
        left: CARD.x + PAD + i * STRIP_STEP,
        top: STRIP_TOP + (i % 2 ? STRIP_STAGGER : 0),
        width: STRIP_POSTER.width,
        height: STRIP_POSTER.height,
        borderRadius: 10,
        transform: `rotate(${STRIP_TILT[i]}deg)`,
        boxShadow: "0 18px 48px rgba(0,0,0,0.85)",
        backgroundColor: "#1a1a1a",
      };
      return src ? (
        <img key={i} src={src} width={STRIP_POSTER.width} height={STRIP_POSTER.height} style={style} />
      ) : (
        <div key={i} style={{ ...style, display: "flex" }} />
      );
    })}
  </div>
);

export const halloweenHookScene = (
  lines: [string, string],
  posters: (string | null)[],
  start: number,
  end: number
): Scene => ({
  start,
  end,
  textAt: start + TEXT_DELAY_S,
  flicker: HOOK_FLICKER,
  base: <HalloweenCover posters={posters} />,
  lines: [
    <Eyebrow key="e" text="Noc grozy w kinach studyjnych" theme="halloween" />,
    <Title key="t" text={lines[0]} size={104} />,
    <Rule key="r" theme="halloween" />,
    <Big key="b" text={lines[1]} />,
  ],
});

export const cardScene = (
  screening: Screening,
  index: number,
  total: number,
  imageUrl: string | null,
  start: number,
  end: number,
  theme?: Theme
): Scene => {
  const { movie, cinema } = screening;
  const { date, time } = splitScreeningDate(screening.date);
  const eyebrow = [movie.productionYear, formatDuration(movie.duration)].filter(Boolean).join(" · ");
  return {
    start,
    end,
    textAt: start + TEXT_DELAY_S,
    base: <CardBase imageUrl={imageUrl} meta={`${index + 1}/${total} · ${cinema.city.name}`} headerTop={theme ? HALLOWEEN_HEADER_TOP : HEADER_TOP} />,
    lines: [
      <Eyebrow key="e" text={eyebrow} theme={theme} />,
      <Title key="t" text={movie.title} size={titleSize(movie.title)} />,
      <Rule key="r" theme={theme} />,
      <Big key="b" text={`${formatPolishDate(date)}${time ? ` · ${time}` : ""}`} />,
      <Small key="s" text={cinema.name} />,
    ],
  };
};

// Single-film reel ("Klasyka tygodnia", "Seans na niedzielę"): one card
// with everything, since a second card over the same poster added nothing:
// the series, the title, when, where, and year and running time.

export const spotlightHookScene = (
  screening: Screening,
  series: string,
  imageUrl: string | null,
  start: number,
  end: number
): Scene => {
  const { movie, cinema } = screening;
  const { date, time } = splitScreeningDate(screening.date);
  const facts = [movie.productionYear, formatDuration(movie.duration)].filter(Boolean).join(" · ");
  return {
    start,
    end,
    textAt: start + TEXT_DELAY_S,
    base: <CardBase imageUrl={imageUrl} meta={cinema.city.name} />,
    lines: [
      <Eyebrow key="e" text={series} />,
      <Title key="t" text={movie.title} size={titleSize(movie.title)} />,
      <Rule key="r" />,
      <Big key="b" text={`${formatPolishDate(date)}${time ? ` · ${time}` : ""}`} />,
      <Small key="s" text={cinema.name} />,
      <Small key="f" text={facts} />,
    ],
  };
};

// "rok", "lata", "lat": Polish plural of years (12-14 take "lat").
const yearsWord = (n: number): string => {
  if (n === 1) return "rok";
  const last = n % 10;
  const lastTwo = n % 100;
  return last >= 2 && last <= 4 && (lastTwo < 12 || lastTwo > 14) ? "lata" : "lat";
};

// Anniversary reel. Both scenes share the poster, so the change between
// them is the text block alone dissolving from the anniversary to the
// screening.
export const anniversaryHookScene = (
  screening: Screening,
  years: number,
  premiere: string,
  imageUrl: string | null,
  start: number,
  end: number
): Scene => ({
  start,
  end,
  textAt: start + TEXT_DELAY_S,
  base: <CardBase imageUrl={imageUrl} />,
  lines: [
    <Eyebrow key="e" text={`Premiera ${formatPolishDate(premiere)}`} />,
    <Title key="t" text={`${years} ${yearsWord(years)} temu`} size={156} />,
    <Rule key="r" />,
    <Big key="b" text={screening.movie.title} />,
  ],
});

// Where and when, for the single-film reels.
export const screeningCardScene = (
  screening: Screening,
  eyebrow: string,
  imageUrl: string | null,
  start: number,
  end: number
): Scene => {
  const { movie, cinema } = screening;
  const { date, time } = splitScreeningDate(screening.date);
  return {
    start,
    end,
    textAt: start + TEXT_DELAY_S,
    base: <CardBase imageUrl={imageUrl} meta={cinema.city.name} />,
    lines: [
      <Eyebrow key="e" text={eyebrow} />,
      <Title key="t" text={movie.title} size={titleSize(movie.title)} />,
      <Rule key="r" />,
      <Big key="b" text={`${formatPolishDate(date)}${time ? ` · ${time}` : ""}`} />,
      <Small key="s" text={cinema.name} />,
    ],
  };
};

// End card: the last poster stays behind it, darkened, so the reel does
// not end on an empty frame; the klaps mark is large, with the address
// and where to find it.
export const endScene = (start: number, end: number, imageUrl: string | null = null): Scene => ({
  start,
  end,
  textAt: start + TEXT_DELAY_S,
  base: <CardBase imageUrl={imageUrl} dim={0.55} header={false} />,
  lines: [
    <Logo key="l" size={96} />,
    <Small key="e" text="Repertuar kin studyjnych" />,
    <Rule key="r" />,
    <Url key="u" />,
    <Small key="s" text="Link w bio" />,
  ],
});

// Halloween end card: the whole card in the accent with white type, and
// in the motion layer a jack-o'-lantern that pops in, sways and flickers,
// with black bats flapping across it (black on orange, the season's look).
const NIGHT = "#140904";
const GLOW_FACE = "#ffd36e";
const TAU = Math.PI * 2;

const Bat = ({ x, y, width, rotate, flap }: { x: number; y: number; width: number; rotate: number; flap: number }) => (
  <svg
    width={width}
    height={width / 2}
    viewBox="0 0 120 60"
    style={{ position: "absolute", left: Math.round(x), top: Math.round(y), transform: `rotate(${rotate}deg) scaleY(${flap.toFixed(3)})` }}
  >
    <path
      d="M60 22 L56 12 L54 20 C46 12 30 8 14 14 C22 18 24 26 22 32 C30 28 38 30 42 38 C46 32 52 32 56 40 L60 46 L64 40 C68 32 74 32 78 38 C82 30 90 28 98 32 C96 26 98 18 106 14 C90 8 74 12 66 20 L64 12 Z"
      fill={NIGHT}
    />
  </svg>
);

// Start, size and flight of each bat: drift in px/s, a bob of `amp` px at
// `freq` Hz, and wings beating at FLAP_HZ.
const BATS = [
  { x: 120, y: 330, width: 190, rotate: -12, vx: 70, vy: -20, amp: 18, freq: 0.8, phase: 0 },
  { x: 800, y: 290, width: 150, rotate: 10, vx: -60, vy: -10, amp: 14, freq: 0.9, phase: 1.3 },
  { x: 860, y: 640, width: 90, rotate: -6, vx: -90, vy: -25, amp: 10, freq: 1.1, phase: 2.1 },
  { x: 150, y: 760, width: 76, rotate: 8, vx: 80, vy: -30, amp: 12, freq: 1, phase: 0.7 },
  { x: 610, y: 200, width: 64, rotate: 4, vx: 50, vy: 10, amp: 8, freq: 1.3, phase: 2.8 },
];
const FLAP_HZ = 3.2;

const PUMPKIN = { width: 520, top: 400 };
const PUMPKIN_POP_S = 0.5;

const Pumpkin = ({ since }: { since: number }) => {
  const scale = 0.8 + 0.2 * easeOutCubic(since / PUMPKIN_POP_S);
  const bob = 10 * Math.sin(TAU * 0.7 * since);
  const sway = 3 * Math.sin(TAU * 0.5 * since);
  // A candle inside: two uneven waves, never fully out.
  const glow = 0.78 + 0.14 * Math.sin(TAU * 2.3 * since) + 0.08 * Math.sin(TAU * 5.7 * since + 1);
  const face = { fill: GLOW_FACE, fillOpacity: glow.toFixed(3) };
  return (
    <svg
      width={PUMPKIN.width}
      height={PUMPKIN.width * 0.9}
      viewBox="0 0 200 180"
      style={{
        position: "absolute",
        left: (W - PUMPKIN.width) / 2,
        top: Math.round(PUMPKIN.top + bob),
        transform: `rotate(${sway.toFixed(2)}deg) scale(${scale.toFixed(3)})`,
      }}
    >
      <path d="M94 36 C92 20 98 8 112 4 L118 12 C108 16 104 24 106 38 Z" fill={NIGHT} />
      <ellipse cx="58" cy="108" rx="52" ry="66" fill={NIGHT} />
      <ellipse cx="142" cy="108" rx="52" ry="66" fill={NIGHT} />
      <ellipse cx="100" cy="106" rx="56" ry="72" fill={NIGHT} />
      <path d="M74 44 C60 80 60 136 74 172 M126 44 C140 80 140 136 126 172" stroke="#2c1408" strokeWidth="3" fill="none" />
      <path d="M56 92 L80 64 L90 98 Z" {...face} />
      <path d="M144 92 L120 64 L110 98 Z" {...face} />
      <path d="M100 102 L91 118 L109 118 Z" {...face} />
      <path d="M46 124 L60 132 L70 122 L84 134 L100 124 L116 134 L130 122 L140 132 L154 124 Q100 182 46 124 Z" {...face} />
    </svg>
  );
};

const HalloweenOutro = () => (
  <div style={{ width: W, height: H, display: "flex", position: "relative", backgroundColor: "#000000" }}>
    <div
      style={{
        position: "absolute",
        left: CARD.x,
        top: CARD.y,
        width: CARD.width,
        height: CARD.height,
        display: "flex",
        borderRadius: CARD.radius,
        backgroundColor: ACCENT.halloween,
        // A lighter halo behind the pumpkin, deeper orange at the edges.
        backgroundImage: "radial-gradient(circle at 50% 33%, rgba(255,214,140,0.75) 0%, rgba(255,122,26,0) 40%), linear-gradient(180deg, rgba(120,30,0,0) 55%, rgba(120,30,0,0.35) 100%)",
      }}
    />
  </div>
);

const HalloweenOutroMotion = ({ since }: { since: number }) => (
  <>
    <Pumpkin since={since} />
    {BATS.map(({ x, y, vx, vy, amp, freq, phase, ...bat }, i) => (
      <Bat
        key={i}
        {...bat}
        x={x + vx * since}
        y={y + vy * since + amp * Math.sin(TAU * freq * since + phase)}
        flap={0.45 + 0.55 * Math.abs(Math.cos(TAU * FLAP_HZ * since + phase))}
      />
    ))}
  </>
);

export const halloweenEndScene = (start: number, end: number): Scene => ({
  start,
  end,
  textAt: start + TEXT_DELAY_S,
  base: <HalloweenOutro />,
  motion: (since) => <HalloweenOutroMotion since={since} />,
  lines: [
    <Logo key="l" size={96} />,
    <Small key="e" text="Repertuar kin studyjnych" color="#ffffff" />,
    <Rule key="r" />,
    <Url key="u" />,
    <Small key="s" text="Link w bio" color="#ffffff" />,
  ],
});

const Url = () => (
  <span
    style={{
      marginTop: 24,
      fontFamily: "Anton",
      fontSize: 104,
      lineHeight: DISPLAY_LINE_HEIGHT,
      letterSpacing: "0.01em",
    }}
  >
    klaps.space
  </span>
);

// --- Rendering ---------------------------------------------------------------

const lineProgress = (scene: Scene, index: number, t: number) =>
  easeOutCubic((t - scene.textAt - index * LINE_STAGGER_S) / LINE_FADE_S);

// Signature of the text layer at time t; frames with the same signature
// share one render (the block is static once all lines are in).
export const textSignature = (scene: Scene, t: number): string =>
  scene.lines.map((_, i) => lineProgress(scene, i, t).toFixed(3)).join("|");

export const renderBase = async (scene: Scene): Promise<Buffer> => {
  const svg = await satori(<>{scene.base}</>, { width: W, height: H, fonts: await loadFonts() });
  return sharp(Buffer.from(svg)).removeAlpha().raw().toBuffer();
};

// The text block of `scene` at time t, as raw RGBA at W x H. Lines keep
// their place in the column while hidden, so nothing shifts as they fade up.
export const renderTextLayer = async (scene: Scene, t: number): Promise<Buffer> => {
  const svg = await satori(
    <div style={{ width: W, height: H, display: "flex", position: "relative", color: "#ffffff", fontFamily: "Inter" }}>
      <div
        style={{
          position: "absolute",
          left: CARD.x + PAD,
          right: BLOCK_RIGHT,
          bottom: H - BLOCK_BOTTOM,
          display: "flex",
          flexDirection: "column",
        }}
      >
        {scene.lines.map((line, i) => {
          const p = lineProgress(scene, i, t);
          return (
            <div
              key={i}
              style={{
                display: "flex",
                opacity: p,
                transform: `translateY(${Math.round(LINE_RISE_PX * (1 - p))}px)`,
              }}
            >
              {line}
            </div>
          );
        })}
      </div>
    </div>,
    { width: W, height: H, fonts: await loadFonts() }
  );
  return sharp(Buffer.from(svg)).ensureAlpha().raw().toBuffer();
};

// The motion layer of `scene` at time t, as raw RGBA at W x H.
export const renderMotionLayer = async (scene: Scene, t: number): Promise<Buffer> => {
  const svg = await satori(
    <div style={{ width: W, height: H, display: "flex", position: "relative" }}>{scene.motion!(t - scene.start)}</div>,
    { width: W, height: H, fonts: await loadFonts() }
  );
  return sharp(Buffer.from(svg)).ensureAlpha().raw().toBuffer();
};

// Card size for the poster crop.
export const CARD_SIZE = { width: CARD.width, height: CARD.height };
