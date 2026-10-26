import satori from "satori";
import sharp from "sharp";
import type { Screening } from "../types/types";
import { formatDuration, formatPolishDate, splitScreeningDate } from "../utils/format";
import { loadFonts } from "./render";
import { DISPLAY_LINE_HEIGHT, EYEBROW_GAP } from "./template";

// Line-up reel frames in klaps' own visual language, the same as the post
// and story templates: black frame, a rounded card with the poster held
// still, logo and city in the card header, and one text block (eyebrow,
// title, rule, date, venue, hairline, footer). Every card puts that block
// in the same place, inside Instagram's Reels safe zone. Motion is calm:
// cards dissolve into each other and the block's lines fade up in turn.
export const W = 1080;
export const H = 1920;

// Card geometry, as the story template (frame margins, radius).
const CARD = { x: 44, y: 150, width: W - 88, height: H - 150 - 56, radius: 18 };
const PAD = 56;
// Safe zone per Meta's Reels guidance: ~270 px top bar, ~670 px caption
// block, ~230 px action rail on the right over the bottom 40%. The header
// sits below the top bar and the text block ends above the rail.
const HEADER_TOP = 300;
const BLOCK_BOTTOM = 1140;

const MUTED = "rgba(255,255,255,0.7)";
const FAINT = "rgba(255,255,255,0.6)";
const HAIRLINE = "1px solid rgba(255,255,255,0.25)";

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
  <span style={{ fontSize: 25, textTransform: "uppercase", letterSpacing: "0.3em", color: MUTED }}>
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
      fontSize: 60,
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
    }}
  >
    {text}
  </span>
);

const Footer = ({ left, right }: { left: string; right?: string }) => (
  <div style={{ display: "flex", flexDirection: "column", width: "100%" }}>
    <div style={{ width: "100%", borderTop: HAIRLINE, marginTop: 28 }} />
    <div style={{ display: "flex", justifyContent: "space-between", marginTop: 22 }}>
      <span style={{ fontSize: 25, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.18em" }}>
        {left}
      </span>
      {right && (
        <span style={{ fontSize: 25, textTransform: "uppercase", letterSpacing: "0.18em", color: FAINT }}>
          {right}
        </span>
      )}
    </div>
  </div>
);

// Long titles shrink so they keep to two lines at most (as the templates).
const titleSize = (title: string): number => {
  if (title.length > 24) return 84;
  if (title.length > 16) return 104;
  if (title.length > 10) return 128;
  return 156;
};

// The card behind the text: poster (or plain black) with the templates'
// scrim, and the header row. `dim` darkens the poster further (hook).
const CardBase = ({
  imageUrl,
  city,
  dim = 0,
}: {
  imageUrl: string | null;
  city?: string;
  dim?: number;
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
            // The text block sits mid-card (the reel caption covers the
            // bottom), so the scrim darkens from there rather than at the
            // bottom as in the post template.
            backgroundImage: `linear-gradient(180deg, rgba(0,0,0,${0.45 + dim}) 0%, rgba(0,0,0,${0.05 + dim}) 14%, rgba(0,0,0,${0.2 + dim}) 24%, rgba(0,0,0,0.78) 42%, rgba(0,0,0,0.92) 58%, rgba(0,0,0,0.96) 100%)`,
          }}
        />
      )}
    </div>
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
      {city && (
        <span style={{ fontSize: 22, textTransform: "uppercase", letterSpacing: "0.28em", color: "rgba(255,255,255,0.85)" }}>
          {city}
        </span>
      )}
    </div>
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
  base: <CardBase imageUrl={imageUrl} dim={0.25} />,
  lines: [
    <Eyebrow key="e" text="Repertuar kin studyjnych" />,
    <Title key="t" text={lines[0]} size={128} />,
    <Rule key="r" />,
    <Big key="b" text={lines[1]} />,
    <Footer key="f" left="Przesuń dalej" right="klaps.space" />,
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
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    start,
    end,
    textAt: start + TEXT_DELAY_S,
    base: <CardBase imageUrl={imageUrl} city={cinema.city.name} />,
    lines: [
      <Eyebrow key="e" text={eyebrow} />,
      <Title key="t" text={movie.title} size={titleSize(movie.title)} />,
      <Rule key="r" />,
      <Big key="b" text={`${formatPolishDate(date)}${time ? ` · ${time}` : ""}`} />,
      <Small key="s" text={cinema.name} />,
      <Footer key="f" left={`${pad(index + 1)} / ${pad(total)}`} right="Najbliższe dni" />,
    ],
  };
};

export const endScene = (start: number, end: number): Scene => ({
  start,
  end,
  textAt: start + TEXT_DELAY_S,
  base: <CardBase imageUrl={null} />,
  lines: [
    <Eyebrow key="e" text="Wszystkie seanse" />,
    <Title key="t" text="klaps.space" size={128} />,
    <Rule key="r" />,
    <Small key="s" text="Link w bio · zapisz, żeby nie przegapić" />,
  ],
});

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
          right: CARD.x + PAD,
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
