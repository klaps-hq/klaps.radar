import satori from "satori";
import sharp from "sharp";
import type { Screening } from "../types/types";
import { splitScreeningDate } from "../utils/format";
import { loadFonts } from "./render";
import { DISPLAY_LINE_HEIGHT } from "./template";

// Kinetic typography for the line-up reel. Each scene is a set of text
// elements scattered over the frame; every element eases in on its own
// beat (slide + fade + slight scale) and eases out just before the cut.
// The text layer is rendered per frame with satori and composited over the
// poster by the video pipeline.
export const W = 1080;
export const H = 1920;
// Reel UI: top bar, caption block at the bottom, action column on the right.
const LEFT = 72;
const RIGHT = W - 72 - 110;
const SHADOW = "0 4px 24px rgba(0,0,0,0.55), 0 2px 6px rgba(0,0,0,0.6)";

export const ENTER_S = 0.42;
export const EXIT_S = 0.2;

export type TextElement = {
  key: string;
  x: number; // left edge, or right edge when align is "right"
  y: number; // top edge
  align: "left" | "right";
  enter: number; // seconds
  exit: number; // seconds
  dx: number; // entry offset in px
  dy: number;
  node: React.ReactNode;
};

export type Scene = {
  start: number;
  end: number;
  poster: number | null; // index into the posters, null = black
  elements: TextElement[];
  flash?: boolean; // white flash easing out at the start (the drop)
};

// --- Easing ------------------------------------------------------------------

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
export const easeOutCubic = (x: number) => 1 - (1 - clamp01(x)) ** 3;
export const easeInOutSine = (x: number) => -(Math.cos(Math.PI * clamp01(x)) - 1) / 2;
// Slight overshoot, so words "land" on the beat instead of just stopping.
const easeOutBack = (x: number) => {
  const c1 = 1.4;
  const c3 = c1 + 1;
  const t = clamp01(x);
  return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2;
};

// --- Text styles -------------------------------------------------------------

const Display = ({ text, size }: { text: string; size: number }) => (
  <span
    style={{
      fontFamily: "Anton",
      fontSize: size,
      lineHeight: DISPLAY_LINE_HEIGHT,
      textTransform: "uppercase",
      color: "#ffffff",
      textShadow: SHADOW,
    }}
  >
    {text}
  </span>
);

const Label = ({ text, size = 40 }: { text: string; size?: number }) => (
  <span
    style={{
      fontFamily: "Inter",
      fontWeight: 700,
      fontSize: size,
      textTransform: "uppercase",
      letterSpacing: "0.14em",
      color: "#ffffff",
      textShadow: SHADOW,
    }}
  >
    {text}
  </span>
);

const Plain = ({ text, size = 36 }: { text: string; size?: number }) => (
  <span
    style={{
      fontFamily: "Inter",
      fontWeight: 700,
      fontSize: size,
      color: "rgba(255,255,255,0.92)",
      textShadow: SHADOW,
    }}
  >
    {text}
  </span>
);

// Instagram-editor style: black text in a white box.
const Box = ({ text, size = 48 }: { text: string; size?: number }) => (
  <span
    style={{
      fontFamily: "Inter",
      fontWeight: 700,
      fontSize: size,
      padding: "8px 20px 12px",
      borderRadius: 10,
      backgroundColor: "#ffffff",
      color: "#000000",
    }}
  >
    {text}
  </span>
);

// --- Content helpers ---------------------------------------------------------

const WEEKDAYS = ["niedziela", "poniedziałek", "wtorek", "środa", "czwartek", "piątek", "sobota"];

const describe = (screening: Screening) => {
  const { date, time } = splitScreeningDate(screening.date);
  const [y, m, d] = date.split("-").map(Number);
  return {
    weekday: WEEKDAYS[new Date(Date.UTC(y!, m! - 1, d!)).getUTCDay()]!,
    dayMonth: `${d}.${String(m).padStart(2, "0")}`,
    time,
  };
};

// Splits a title into up to three lines of roughly balanced length, so it
// can be scattered as separate words/lines.
const splitTitle = (title: string): string[] => {
  const words = title.split(/\s+/);
  if (words.length === 1) return words;
  const lines: string[] = [];
  const target = Math.max(8, Math.ceil(title.length / Math.min(3, words.length)));
  let line = "";
  for (const word of words) {
    if (line && (line + " " + word).length > target && lines.length < 2) {
      lines.push(line);
      line = word;
    } else {
      line = line ? `${line} ${word}` : word;
    }
  }
  lines.push(line);
  return lines;
};

const titleSize = (lines: string[]): number => {
  const longest = Math.max(...lines.map((l) => l.length));
  if (longest > 16) return 84;
  if (longest > 11) return 100;
  return 124;
};

// Entry times: one element per half beat from the scene start, compressed
// so the last one is in by 55% of the scene and everything can be read.
const staggered = (start: number, end: number, count: number, beat: number) => {
  const step = Math.min(beat / 2, ((end - start) * 0.55) / Math.max(1, count - 1));
  return Array.from({ length: count }, (_, i) => start + i * step);
};

type Draft = Omit<TextElement, "enter" | "exit">;

const schedule = (drafts: Draft[], start: number, end: number, beat: number): TextElement[] => {
  const times = staggered(start, end, drafts.length, beat);
  return drafts.map((d, i) => ({ ...d, enter: times[i]!, exit: end }));
};

// --- Scenes ------------------------------------------------------------------

export const hookScene = (
  lines: [string, string],
  start: number,
  end: number,
  beat: number
): Scene => {
  const [first, second] = lines;
  const words = first.split(" ");
  const split = Math.ceil(words.length / 2);
  return {
    start,
    end,
    poster: 0,
    elements: schedule(
      [
        { key: "h1", x: LEFT, y: 620, align: "left", dx: -60, dy: 0, node: <Box text={words.slice(0, split).join(" ")} size={58} /> },
        { key: "h2", x: RIGHT, y: 720, align: "right", dx: 60, dy: 0, node: <Box text={words.slice(split).join(" ")} size={58} /> },
        { key: "h3", x: LEFT + 60, y: 880, align: "left", dx: 0, dy: 50, node: <Box text={second} size={46} /> },
      ],
      start,
      end,
      beat
    ),
  };
};

// Three scatter layouts, rotated per card so consecutive cards do not
// repeat the same composition.
export const cardScene = (
  screening: Screening,
  index: number,
  total: number,
  poster: number | null,
  start: number,
  end: number,
  beat: number,
  flash: boolean
): Scene => {
  const { weekday, dayMonth, time } = describe(screening);
  const title = splitTitle(screening.movie.title);
  const size = titleSize(title);
  const lineH = Math.round(size * DISPLAY_LINE_HEIGHT);
  const when = time ? `${dayMonth} · ${time}` : dayMonth;
  const counter = `${index + 1}/${total}`;
  const city = screening.cinema.city.name;
  const cinema = screening.cinema.name;
  const layout = index % 3;

  const titleDrafts = (x: number, y: number, align: "left" | "right", shift: number): Draft[] =>
    title.map((line, i) => ({
      key: `t${i}`,
      x: align === "left" ? x + (i % 2) * shift : x - (i % 2) * shift,
      y: y + i * lineH,
      align,
      dx: align === "left" ? -50 : 50,
      dy: 0,
      node: <Display text={line} size={size} />,
    }));

  let drafts: Draft[];
  if (layout === 0) {
    drafts = [
      { key: "day", x: LEFT, y: 300, align: "left", dx: 0, dy: -40, node: <Label text={weekday} /> },
      { key: "when", x: LEFT, y: 360, align: "left", dx: 0, dy: -40, node: <Display text={when} size={92} /> },
      ...titleDrafts(LEFT, 880, "left", 90),
      { key: "city", x: RIGHT, y: 880 + title.length * lineH + 50, align: "right", dx: 60, dy: 0, node: <Box text={city} /> },
      { key: "cinema", x: LEFT, y: 1480, align: "left", dx: 0, dy: 30, node: <Plain text={cinema} /> },
      { key: "n", x: RIGHT, y: 200, align: "right", dx: 0, dy: -30, node: <Label text={counter} size={36} /> },
    ];
  } else if (layout === 1) {
    drafts = [
      ...titleDrafts(LEFT, 330, "left", 70),
      { key: "day", x: RIGHT, y: 1080, align: "right", dx: 50, dy: 0, node: <Label text={weekday} /> },
      { key: "when", x: RIGHT, y: 1140, align: "right", dx: 50, dy: 0, node: <Display text={when} size={92} /> },
      { key: "city", x: LEFT, y: 1330, align: "left", dx: -60, dy: 0, node: <Box text={city} /> },
      { key: "cinema", x: RIGHT, y: 1480, align: "right", dx: 0, dy: 30, node: <Plain text={cinema} /> },
      { key: "n", x: LEFT, y: 200, align: "left", dx: 0, dy: -30, node: <Label text={counter} size={36} /> },
    ];
  } else {
    drafts = [
      { key: "city", x: RIGHT, y: 260, align: "right", dx: 60, dy: 0, node: <Box text={city} /> },
      ...titleDrafts(RIGHT, 640, "right", 80),
      { key: "day", x: LEFT, y: 640 + title.length * lineH + 90, align: "left", dx: -50, dy: 0, node: <Label text={weekday} /> },
      { key: "when", x: LEFT, y: 640 + title.length * lineH + 150, align: "left", dx: -50, dy: 0, node: <Display text={when} size={92} /> },
      { key: "cinema", x: LEFT, y: 1480, align: "left", dx: 0, dy: 30, node: <Plain text={cinema} /> },
      { key: "n", x: LEFT, y: 200, align: "left", dx: 0, dy: -30, node: <Label text={counter} size={36} /> },
    ];
  }

  return { start, end, poster, elements: schedule(drafts, start, end, beat), flash };
};

const Logo = ({ size }: { size: number }) => (
  <div style={{ display: "flex", alignItems: "center", gap: Math.round(size * 0.4) }}>
    <svg width={Math.round(size * 0.94)} height={Math.round(size * 0.67)} viewBox="0 0 28 20" fill="none">
      <polygon points="0,8 28,0 28,20 0,12" fill="#ffffff" />
    </svg>
    <span style={{ fontFamily: "Inter", fontSize: size, fontWeight: 700, letterSpacing: "-0.02em", color: "#ffffff" }}>
      klaps
    </span>
  </div>
);

export const endScene = (start: number, end: number, beat: number): Scene => ({
  start,
  end,
  poster: null,
  elements: schedule(
    [
      { key: "logo", x: LEFT, y: 600, align: "left", dx: 0, dy: 40, node: <Logo size={64} /> },
      { key: "all", x: LEFT, y: 720, align: "left", dx: -50, dy: 0, node: <Display text="Wszystkie seanse" size={110} /> },
      { key: "url", x: RIGHT, y: 900, align: "right", dx: 50, dy: 0, node: <Box text="klaps.space" size={56} /> },
      { key: "save", x: LEFT, y: 1040, align: "left", dx: 0, dy: 30, node: <Plain text="Zapisz, żeby nie przegapić · link w bio" size={34} /> },
    ],
    start,
    // The end card has no cut after it, so nothing fades out.
    end + EXIT_S,
    beat
  ),
});

// --- Rendering ---------------------------------------------------------------

type ElementState = { opacity: number; dx: number; dy: number; scale: number };

const stateAt = (el: TextElement, t: number): ElementState => {
  const p = (t - el.enter) / ENTER_S;
  const fadeIn = easeOutCubic(p);
  const move = easeOutBack(p);
  const fadeOut = 1 - easeOutCubic((t - (el.exit - EXIT_S)) / EXIT_S);
  return {
    opacity: Math.max(0, Math.min(fadeIn, fadeOut)),
    dx: el.dx * (1 - move),
    dy: el.dy * (1 - move),
    scale: 0.92 + 0.08 * move,
  };
};

// Signature of the text layer at time t; frames with the same signature
// share one render (text is static most of the time).
export const textSignature = (scene: Scene, t: number): string =>
  scene.elements
    .map((el) => {
      const s = stateAt(el, t);
      return `${el.key}:${s.opacity.toFixed(3)}:${s.dx.toFixed(1)}:${s.dy.toFixed(1)}:${s.scale.toFixed(3)}`;
    })
    .join("|");

// The text layer of `scene` at time t, as raw RGBA at W x H.
export const renderTextLayer = async (scene: Scene, t: number): Promise<Buffer> => {
  const svg = await satori(
    <div style={{ width: W, height: H, display: "flex", position: "relative" }}>
      {scene.elements.map((el) => {
        const s = stateAt(el, t);
        if (s.opacity <= 0.001) return null;
        return (
          <div
            key={el.key}
            style={{
              position: "absolute",
              top: el.y,
              ...(el.align === "left" ? { left: el.x } : { right: W - el.x }),
              display: "flex",
              opacity: s.opacity,
              transform: `translate(${s.dx.toFixed(1)}px, ${s.dy.toFixed(1)}px) scale(${s.scale.toFixed(3)})`,
            }}
          >
            {el.node}
          </div>
        );
      })}
    </div>,
    { width: W, height: H, fonts: await loadFonts() }
  );
  return sharp(Buffer.from(svg)).ensureAlpha().raw().toBuffer();
};
