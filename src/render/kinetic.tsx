import satori from "satori";
import sharp from "sharp";
import type { Screening } from "../types/types";
import { splitScreeningDate } from "../utils/format";
import { loadFonts } from "./render";
import { DISPLAY_LINE_HEIGHT } from "./template";

// Kinetic typography for the line-up reel. Every scene uses the same grid
// inside Instagram's safe zone (controlled asymmetry, not random scatter):
// meta row at the top (counter left, weekday chip right), the title on the
// left axis with a deliberate indent on its second line, date and time on
// the right axis, the venue chip at the bottom. Elements ease in on beats
// in a fixed order and direction (title from the left, numbers from the
// right, chips rise) and ease out together just before the cut.
// The text layer is rendered per frame with satori and composited over the
// poster by the video pipeline.
export const W = 1080;
export const H = 1920;
// Safe zone per Meta's Reels guidance: ~270 px top bar, ~670 px caption
// block at the bottom, ~230 px action rail on the right over the bottom
// 40%. Text stays inside x 72-1008, y 290-1240, and right-aligned text
// stays above the rail (y < 1150).
const LEFT = 72;
const RIGHT = W - 72;
const TOP = 290;
const TITLE_TOP = 470;
const RAIL_TOP = 1150;
const VENUE_TOP = 1150;
// Second title line is indented by one grid step.
const INDENT = 56;
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

// Splits a title into up to `maxLines` lines of roughly balanced length.
const splitTitle = (title: string, maxLines = 3): string[] => {
  const words = title.split(/\s+/);
  if (words.length === 1) return words;
  const lines: string[] = [];
  const target = Math.max(8, Math.ceil(title.length / Math.min(maxLines, words.length)));
  let line = "";
  for (const word of words) {
    if (line && (line + " " + word).length > target && lines.length < maxLines - 1) {
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
  if (longest > 16) return 96;
  if (longest > 11) return 116;
  return 140;
};

type Draft = Omit<TextElement, "enter" | "exit"> & { group: number };

// Groups enter in order, one beat apart at most, compressed so the last
// group is in by half of the scene and everything can be read.
const schedule = (drafts: Draft[], start: number, end: number, beat: number): TextElement[] => {
  const groups = Math.max(...drafts.map((d) => d.group)) + 1;
  const step = Math.min(beat, ((end - start) * 0.5) / Math.max(1, groups - 1));
  return drafts.map(({ group, ...d }) => ({ ...d, enter: start + group * step, exit: end }));
};

// Title lines from the left on consecutive half steps (same group spacing
// split into lines via small offsets in time handled by the group index).
const titleDrafts = (lines: string[], size: number, firstGroup: number): Draft[] => {
  const lineH = Math.round(size * DISPLAY_LINE_HEIGHT);
  return lines.map((line, i) => ({
    key: `t${i}`,
    x: LEFT + (i === 1 ? INDENT : 0),
    y: TITLE_TOP + i * lineH,
    align: "left",
    dx: -60,
    dy: 0,
    group: firstGroup + i,
    node: <Display text={line} size={size} />,
  }));
};

// --- Scenes ------------------------------------------------------------------

export const hookScene = (
  lines: [string, string],
  start: number,
  end: number,
  beat: number
): Scene => {
  const [headline, detail] = lines;
  const title = splitTitle(headline, 2);
  const size = 150;
  const lineH = Math.round(size * DISPLAY_LINE_HEIGHT);
  return {
    start,
    end,
    poster: 0,
    elements: schedule(
      [
        { key: "logo", x: LEFT, y: TOP, align: "left", dx: 0, dy: 20, group: 0, node: <Logo size={44} /> },
        ...titleDrafts(title, size, 1),
        {
          key: "detail",
          x: LEFT,
          y: TITLE_TOP + title.length * lineH + 40,
          align: "left",
          dx: 0,
          dy: 24,
          group: 1 + title.length,
          node: <Box text={detail} size={44} />,
        },
      ],
      start,
      end,
      beat
    ),
  };
};

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
  const venue = `${screening.cinema.name} · ${screening.cinema.city.name}`;
  const pad = (n: number) => String(n).padStart(2, "0");
  // Date sits under the title on the right axis, kept above the action rail.
  const whenTop = Math.min(TITLE_TOP + title.length * lineH + 40, RAIL_TOP - 150);

  const drafts: Draft[] = [
    { key: "n", x: LEFT, y: TOP + 8, align: "left", dx: 0, dy: 20, group: 0, node: <Label text={`${pad(index + 1)} / ${pad(total)}`} size={34} /> },
    { key: "day", x: RIGHT, y: TOP, align: "right", dx: 0, dy: 20, group: 0, node: <Box text={weekday} size={40} /> },
    ...titleDrafts(title, size, 1),
    {
      key: "when",
      x: RIGHT,
      y: whenTop,
      align: "right",
      dx: 60,
      dy: 0,
      group: 1 + title.length,
      node: <Display text={time ? `${dayMonth} · ${time}` : dayMonth} size={104} />,
    },
    {
      key: "venue",
      x: LEFT,
      y: VENUE_TOP,
      align: "left",
      dx: 0,
      dy: 24,
      group: 2 + title.length,
      node: <Box text={venue} size={venue.length > 26 ? 34 : 40} />,
    },
  ];

  return { start, end, poster, elements: schedule(drafts, start, end, beat), flash };
};

function Logo({ size }: { size: number }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: Math.round(size * 0.4) }}>
      <svg width={Math.round(size * 0.94)} height={Math.round(size * 0.67)} viewBox="0 0 28 20" fill="none">
        <polygon points="0,8 28,0 28,20 0,12" fill="#ffffff" />
      </svg>
      <span style={{ fontFamily: "Inter", fontSize: size, fontWeight: 700, letterSpacing: "-0.02em", color: "#ffffff" }}>
        klaps
      </span>
    </div>
  );
}

// End card on black, landing on the music's final hit. Nothing fades out:
// it is the last thing on screen.
export const endScene = (start: number, end: number, beat: number): Scene => {
  const title = ["Wszystkie", "seanse"];
  const size = 150;
  const lineH = Math.round(size * DISPLAY_LINE_HEIGHT);
  return {
    start,
    end,
    poster: null,
    elements: schedule(
      [
        { key: "logo", x: LEFT, y: TOP, align: "left", dx: 0, dy: 20, group: 0, node: <Logo size={44} /> },
        ...titleDrafts(title, size, 0),
        { key: "url", x: RIGHT, y: TITLE_TOP + 2 * lineH + 40, align: "right", dx: 60, dy: 0, group: 1, node: <Box text="klaps.space" size={56} /> },
        { key: "save", x: LEFT, y: VENUE_TOP - 60, align: "left", dx: 0, dy: 24, group: 2, node: <Plain text="Zapisz, żeby nie przegapić · link w bio" size={34} /> },
      ],
      start,
      end + EXIT_S,
      beat
    ),
  };
};

// --- Rendering ---------------------------------------------------------------

type ElementState = { opacity: number; dx: number; dy: number };

const stateAt = (el: TextElement, t: number): ElementState => {
  const p = (t - el.enter) / ENTER_S;
  const fadeIn = easeOutCubic(p);
  // Plain ease-out, no overshoot or scale: text glides in and stays still.
  const move = easeOutCubic(p);
  const fadeOut = 1 - easeOutCubic((t - (el.exit - EXIT_S)) / EXIT_S);
  return {
    opacity: Math.max(0, Math.min(fadeIn, fadeOut)),
    // Whole pixels, so glyphs do not shimmer between frames.
    dx: Math.round(el.dx * (1 - move)),
    dy: Math.round(el.dy * (1 - move)),
  };
};

// Signature of the text layer at time t; frames with the same signature
// share one render (text is static most of the time).
export const textSignature = (scene: Scene, t: number): string =>
  scene.elements
    .map((el) => {
      const s = stateAt(el, t);
      return `${el.key}:${s.opacity.toFixed(3)}:${s.dx}:${s.dy}`;
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
              transform: `translate(${s.dx}px, ${s.dy}px)`,
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
