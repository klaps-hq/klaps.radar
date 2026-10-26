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

// Card geometry, as the story template (frame margins, radius).
const CARD = { x: 44, y: 150, width: W - 88, height: H - 150 - 56, radius: 18 };
const PAD = 56;
// Reel UI: the top bar (~270 px), the username and a short caption at the
// bottom, and the action rail on the right of the lower half. As in the
// post template the text block sits low on the card so the poster stays
// visible, but it ends ~440 px above the bottom edge (clear of the
// username/caption lines) and stops short of the action rail on the right.
const HEADER_TOP = 300;
const BLOCK_BOTTOM = 1480;
const BLOCK_RIGHT = 250;

const MUTED = "rgba(255,255,255,0.7)";
const FAINT = "rgba(255,255,255,0.6)";
// Small muted lines can land on a bright part of the poster above the
// scrim; a soft shadow keeps them legible there.
const SMALL_SHADOW = "0 2px 12px rgba(0,0,0,0.6)";

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

const Eyebrow = ({ text }: { text: string }) => (
  <span style={{ fontSize: 25, textTransform: "uppercase", letterSpacing: "0.3em", color: MUTED, textShadow: SMALL_SHADOW }}>
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

const Rule = () => <div style={{ width: 64, borderTop: "4px solid #ffffff", marginTop: 26 }} />;

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

const Small = ({ text }: { text: string }) => (
  <span
    style={{
      marginTop: 14,
      fontSize: 26,
      textTransform: "uppercase",
      letterSpacing: "0.2em",
      color: FAINT,
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
}: {
  imageUrl: string | null;
  meta?: string; // header right: counter and city
  dim?: number;
  header?: boolean;
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
            // Light at the top for the header, dark only over the lower part
            // where the text block sits, so most of the poster stays clear.
            backgroundImage: `linear-gradient(180deg, rgba(0,0,0,${0.45 + dim}) 0%, rgba(0,0,0,${0.05 + dim}) 14%, rgba(0,0,0,${0.05 + dim}) 42%, rgba(0,0,0,${0.55 + dim / 2}) 58%, rgba(0,0,0,0.9) 72%, rgba(0,0,0,0.96) 100%)`,
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
        top: HEADER_TOP,
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

export const cardScene = (
  screening: Screening,
  index: number,
  total: number,
  imageUrl: string | null,
  start: number,
  end: number
): Scene => {
  const { movie, cinema } = screening;
  const { date, time } = splitScreeningDate(screening.date);
  const eyebrow = [movie.productionYear, formatDuration(movie.duration)].filter(Boolean).join(" · ");
  return {
    start,
    end,
    textAt: start + TEXT_DELAY_S,
    base: <CardBase imageUrl={imageUrl} meta={`${index + 1}/${total} · ${cinema.city.name}`} />,
    lines: [
      <Eyebrow key="e" text={eyebrow} />,
      <Title key="t" text={movie.title} size={titleSize(movie.title)} />,
      <Rule key="r" />,
      <Big key="b" text={`${formatPolishDate(date)}${time ? ` · ${time}` : ""}`} />,
      <Small key="s" text={cinema.name} />,
    ],
  };
};

// Single-film reel hook ("Klasyka tygodnia", "Seans na niedzielę"): the
// series, the title, year and running time, and the Filmweb rating when
// it is worth showing.
const RATING_SHOWN_FROM = 7;

export const spotlightHookScene = (
  screening: Screening,
  series: string,
  imageUrl: string | null,
  start: number,
  end: number
): Scene => {
  const { movie } = screening;
  const facts = [movie.productionYear, formatDuration(movie.duration)].filter(Boolean).join(" · ");
  const rating =
    movie.usersRating && movie.usersRating >= RATING_SHOWN_FROM
      ? `Filmweb ${movie.usersRating.toFixed(1).replace(".", ",")} / 10`
      : null;
  return {
    start,
    end,
    textAt: start + TEXT_DELAY_S,
    base: <CardBase imageUrl={imageUrl} />,
    lines: [
      <Eyebrow key="e" text={series} />,
      <Title key="t" text={movie.title} size={titleSize(movie.title)} />,
      <Rule key="r" />,
      <Big key="b" text={facts} />,
      ...(rating ? [<Small key="s" text={rating} />] : []),
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

// Card size for the poster crop.
export const CARD_SIZE = { width: CARD.width, height: CARD.height };
