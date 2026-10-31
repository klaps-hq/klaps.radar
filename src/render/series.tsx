import sharp from "sharp";
import { fetchPickedArt } from "../media/pick";
import { getPersonPhotos } from "../media/tmdb";
import type { Screening } from "../types/types";
import {
  cropToBox,
  fetchImageBuffer,
  renderElement,
  resolveImageUrl,
} from "./render";
import { HALFTONE, MAP_VIEW, project } from "./poland";
import { LAYOUTS } from "./template";

// Generic carousel engine for the editorial series ("Klaps w liczbach",
// director retrospectives, "Bez dystrybutora"). A series builder turns its
// data into a list of slide specs; this file owns the look and renders any
// list of specs. New series reuse the same slide kinds instead of new
// templates.
const layout = LAYOUTS.post;
const CARD = {
  width: layout.width - layout.frame.left - layout.frame.right,
  height: layout.height - layout.frame.top - layout.frame.bottom,
};
const PAD = 80;
const ACCENT = "#FFD43B";
const HAIRLINE = "1px solid rgba(255,255,255,0.12)";

type Movie = Screening["movie"];
// "still" = a TMDB backdrop, "poster" = poster art; the image and its focal
// point come from the picker (src/media/pick.ts).
// "person" = a portrait photo of a person, shown in black and white.
export type Art =
  | { movie: Movie; kind: "still" | "poster" }
  | { kind: "person"; name: string };

export type MapPoint = { city: string; lon: number; lat: number; count: number };
export type RankItem = { name: string; detail: string; count: number };

export type SlideSpec =
  // Opening slide: a strip of art on top, one big number below.
  | { kind: "cover"; date: string; eyebrow: string; value: string; label: string; note?: string; strip: Art[] }
  // One number over a full-bleed image.
  | { kind: "stat"; eyebrow?: string; value: string; title: string; art: Art }
  | { kind: "map"; eyebrow: string; title: string; points: MapPoint[] }
  // A ranking: the leader as the headline, the runners-up as a list.
  | { kind: "ranking"; eyebrow: string; unit: string; items: RankItem[] }
  // Opening slide on one full-bleed portrait image (a poster or a person's
  // photo, both 2:3, so the 4:5 card only trims the sides).
  | { kind: "hero"; eyebrow: string; title: string; lines: string[]; art: Art }
  // A film in a series: big index, title, one meta line.
  | { kind: "film"; index: number; title: string; meta: string; art: Art }
  // Accent slide with a numbered list and a question for the comments.
  | { kind: "question"; eyebrow: string; items: string[]; footer: string }
  // Yellow closing card that sends people to klaps.space.
  | { kind: "outro"; text: string };

type Box = { width: number; height: number };

const loadArt = async (art: Art, box: Box): Promise<string | null> => {
  if (art.kind === "person") {
    for (const path of await getPersonPhotos(art.name)) {
      const image = await fetchImageBuffer(resolveImageUrl(path));
      if (image) return cropToBox(await sharp(image).grayscale().toBuffer(), box);
    }
    return null;
  }
  // Series slides are full cards, so a strong still may stand in for poster
  // art (some movies only have posters with text or on a white ground).
  return fetchPickedArt(art.movie, art.kind === "poster" ? "any" : "still", box);
};

const Logo = ({ color = "#ffffff" }: { color?: string }) => (
  <div style={{ display: "flex", alignItems: "center", gap: 14, color }}>
    <svg width={34} height={24} viewBox="0 0 28 20" fill="none">
      <polygon points="0,8 28,0 28,20 0,12" fill={color} />
    </svg>
    <span style={{ fontSize: 36, fontWeight: 700, letterSpacing: "-0.02em" }}>klaps</span>
  </div>
);

// Spacing rhythm shared by every slide: label above a display line,
// between two display lines, and before a meta line.
const GAP = { label: 28, line: 16, meta: 32 };
const TILE_GAP = 6;

// Section label above the headline.
const Eyebrow = ({ children, color = "#ffffff" }: { children: string; color?: string }) => (
  <span style={{ fontSize: 30, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.2em", color }}>
    {children}
  </span>
);

// Small supporting line: dates, counts, links.
const Meta = ({ children, color = "rgba(255,255,255,0.8)" }: { children: string; color?: string }) => (
  <span style={{ fontSize: 26, textTransform: "uppercase", letterSpacing: "0.18em", color }}>
    {children}
  </span>
);

const Display = ({ children, size, color = "#ffffff" }: { children: string; size: number; color?: string }) => (
  <span
    style={{
      fontFamily: "Anton",
      fontSize: size,
      lineHeight: 1.02,
      textTransform: "uppercase",
      color,
    }}
  >
    {children}
  </span>
);

// The framed card every series slide sits in (same frame as posts).
const Card = ({
  children,
  background = "#0a0a0a",
  image,
  shade,
}: {
  children: React.ReactNode;
  background?: string;
  image?: string | null;
  shade?: string;
}) => (
  <div
    style={{
      width: layout.width,
      height: layout.height,
      display: "flex",
      backgroundColor: "#000000",
      fontFamily: "Inter",
      color: "#ffffff",
      padding: `${layout.frame.top}px ${layout.frame.right}px ${layout.frame.bottom}px ${layout.frame.left}px`,
    }}
  >
    <div
      style={{
        display: "flex",
        position: "relative",
        width: CARD.width,
        height: CARD.height,
        borderRadius: layout.radius,
        border: HAIRLINE,
        backgroundColor: background,
        overflow: "hidden",
      }}
    >
      {image && (
        <img
          src={image}
          width={CARD.width}
          height={CARD.height}
          style={{ position: "absolute", top: 0, left: 0, borderRadius: layout.radius }}
        />
      )}
      {shade && (
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: CARD.width,
            height: CARD.height,
            backgroundImage: shade,
          }}
        />
      )}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          position: "absolute",
          top: 0,
          left: 0,
          width: CARD.width,
          height: CARD.height,
          padding: PAD,
        }}
      >
        {children}
      </div>
    </div>
  </div>
);

const BOTTOM_SHADE =
  "linear-gradient(180deg, rgba(0,0,0,0.25) 0%, rgba(0,0,0,0) 30%, rgba(0,0,0,0.55) 60%, rgba(0,0,0,0.95) 100%)";

// Films put the index on top, so the poster is darkened at both ends.
const COVER_STRIP_HEIGHT = 460;
// Dark from the middle down, where the name and the film list sit.
const HERO_SHADE =
  "linear-gradient(180deg, rgba(0,0,0,0.2) 0%, rgba(0,0,0,0) 30%, rgba(0,0,0,0.7) 58%, rgba(0,0,0,0.97) 100%)";

const FILM_SHADE =
  "linear-gradient(180deg, rgba(0,0,0,0.6) 0%, rgba(0,0,0,0) 28%, rgba(0,0,0,0) 50%, rgba(0,0,0,0.95) 100%)";

const Spacer = () => <div style={{ display: "flex", flex: 1 }} />;

// The country as a halftone of small dots, cities as dots sized by
// screenings; the leading city is the headline and gets rings around it.
const MapSlide = ({ spec }: { spec: Extract<SlideSpec, { kind: "map" }> }) => {
  const mapWidth = CARD.width - PAD * 2;
  const scale = mapWidth / MAP_VIEW.width;
  const mapHeight = Math.round(MAP_VIEW.height * scale);
  const sorted = [...spec.points].sort((a, b) => b.count - a.count);
  const leader = sorted[0]!;
  const max = leader.count;
  const radius = (count: number) => 0.045 + 0.17 * Math.sqrt(count / max);
  const [lx, ly] = project(leader.lon, leader.lat);

  return (
    <Card>
      <Eyebrow>{spec.eyebrow}</Eyebrow>
      <div style={{ display: "flex", marginTop: GAP.label }}>
        <Display size={150} color={ACCENT}>{leader.city}</Display>
      </div>
      <div style={{ display: "flex", marginTop: GAP.line }}>
        <Display size={56}>{`${leader.count} seansów`}</Display>
      </div>
      <Spacer />
      <div style={{ display: "flex", position: "relative", width: mapWidth, height: mapHeight }}>
        <svg width={mapWidth} height={mapHeight} viewBox={`0 0 ${MAP_VIEW.width} ${MAP_VIEW.height}`}>
          {HALFTONE.map(([x, y], i) => (
            <circle key={i} cx={x} cy={y} r={0.024} fill="rgba(255,255,255,0.22)" />
          ))}
          {[2.6, 1.9].map((k) => (
            <circle key={k} cx={lx} cy={ly} r={radius(max) * k} fill="none" stroke={ACCENT} strokeOpacity={k > 2 ? 0.25 : 0.5} strokeWidth={0.014} />
          ))}
          {sorted.map((p) => {
            const [x, y] = project(p.lon, p.lat);
            return <circle key={p.city} cx={x} cy={y} r={radius(p.count)} fill={p === leader ? ACCENT : "#ffffff"} fillOpacity={p === leader ? 1 : 0.85} />;
          })}
        </svg>
        {sorted.slice(1, 4).map((p) => {
          const [x, y] = project(p.lon, p.lat);
          const r = radius(p.count) * scale;
          const left = x * scale + r + 16;
          const flip = left > mapWidth - 240;
          return (
            <div
              key={p.city}
              style={{
                display: "flex",
                flexDirection: "column",
                position: "absolute",
                top: y * scale - 26,
                left: flip ? x * scale - r - 236 : left,
                width: 220,
                alignItems: flip ? "flex-end" : "flex-start",
              }}
            >
              <span style={{ fontFamily: "Anton", fontSize: 48, lineHeight: 1 }}>{String(p.count)}</span>
              <span style={{ fontSize: 28, color: "rgba(255,255,255,0.85)", marginTop: 6 }}>{p.city}</span>
            </div>
          );
        })}
      </div>
    </Card>
  );
};

const Slide = ({ spec, images }: { spec: SlideSpec; images: (string | null)[] }) => {
  switch (spec.kind) {
    case "cover": {
      const stripWidth = Math.floor((CARD.width - TILE_GAP * (images.length - 1)) / images.length);
      return (
        <Card>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <Logo />
            <Meta>{spec.date}</Meta>
          </div>
          <div
            style={{
              display: "flex",
              gap: TILE_GAP,
              marginTop: 56,
              marginLeft: -PAD,
              width: CARD.width,
              height: COVER_STRIP_HEIGHT,
            }}
          >
            {images.map((src, i) =>
              src ? (
                <img key={i} src={src} width={stripWidth} height={COVER_STRIP_HEIGHT} />
              ) : (
                <div key={i} style={{ display: "flex", width: stripWidth, height: COVER_STRIP_HEIGHT, backgroundColor: "#1a1a1a" }} />
              )
            )}
          </div>
          <Spacer />
          <Eyebrow color={ACCENT}>{spec.eyebrow}</Eyebrow>
          <div style={{ display: "flex", marginTop: GAP.label }}>
            <Display size={230}>{spec.value}</Display>
          </div>
          <div style={{ display: "flex", marginTop: GAP.line }}>
            <Display size={84}>{spec.label}</Display>
          </div>
          {spec.note && (
            <div style={{ display: "flex", marginTop: GAP.meta }}>
              <Meta>{spec.note}</Meta>
            </div>
          )}
        </Card>
      );
    }
    case "stat":
      return (
        <Card image={images[0]} shade={BOTTOM_SHADE}>
          {spec.eyebrow && <Eyebrow>{spec.eyebrow}</Eyebrow>}
          <Spacer />
          <Display size={230} color={ACCENT}>{spec.value}</Display>
          <div style={{ display: "flex", marginTop: GAP.line }}>
            <Display size={92}>{spec.title}</Display>
          </div>
        </Card>
      );
    case "map":
      return <MapSlide spec={spec} />;
    case "ranking": {
      const [leader, ...rest] = spec.items;
      if (!leader) return <Card>{null}</Card>;
      return (
        <Card>
          <Eyebrow>{spec.eyebrow}</Eyebrow>
          <div style={{ display: "flex", marginTop: GAP.label }}>
            <Display size={leader.name.length > 14 ? 110 : 140} color={ACCENT}>{leader.name}</Display>
          </div>
          <div style={{ display: "flex", marginTop: GAP.meta }}>
            <Meta>{`${leader.detail} · ${leader.count} ${spec.unit}`}</Meta>
          </div>
          <Spacer />
          <div style={{ display: "flex", flexDirection: "column" }}>
            {rest.map((item, i) => (
              <div
                key={item.name}
                style={{
                  display: "flex",
                  alignItems: "center",
                  padding: "30px 0",
                  borderTop: i === 0 ? "none" : HAIRLINE,
                }}
              >
                <span style={{ fontFamily: "Anton", fontSize: 44, width: 90, color: "rgba(255,255,255,0.4)" }}>
                  {String(i + 2).padStart(2, "0")}
                </span>
                <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
                  <Display size={44}>{item.name}</Display>
                  <div style={{ display: "flex", marginTop: 10 }}>
                    <Meta color="rgba(255,255,255,0.6)">{item.detail}</Meta>
                  </div>
                </div>
                <span style={{ fontFamily: "Anton", fontSize: 56 }}>{String(item.count)}</span>
              </div>
            ))}
          </div>
        </Card>
      );
    }
    case "hero":
      return (
        <Card image={images[0]} shade={HERO_SHADE}>
          <Spacer />
          <Eyebrow color={ACCENT}>{spec.eyebrow}</Eyebrow>
          <div style={{ display: "flex", marginTop: GAP.label }}>
            <Display size={spec.title.length > 9 ? 190 : 240}>{spec.title}</Display>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: GAP.meta }}>
            {spec.lines.map((line) => (
              <Meta key={line} color="rgba(255,255,255,0.9)">{line}</Meta>
            ))}
          </div>
        </Card>
      );
    case "film":
      return (
        <Card image={images[0]} shade={FILM_SHADE}>
          <Display size={150} color={ACCENT}>{String(spec.index).padStart(2, "0")}</Display>
          <Spacer />
          <Display size={spec.title.length > 22 ? 88 : 110}>{spec.title}</Display>
          <div style={{ display: "flex", marginTop: GAP.meta }}>
            <Meta>{spec.meta}</Meta>
          </div>
        </Card>
      );
    case "question":
      return (
        <Card background={ACCENT}>
          <Eyebrow color="#000000">{spec.eyebrow}</Eyebrow>
          <div style={{ display: "flex", flexDirection: "column", marginTop: 72 }}>
            {spec.items.map((item, i) => (
              <div
                key={item}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 40,
                  padding: "40px 0",
                  borderTop: i === 0 ? "none" : "3px solid #000000",
                }}
              >
                <Display size={96} color="#000000">{String(i + 1).padStart(2, "0")}</Display>
                <Display size={52} color="#000000">{item}</Display>
              </div>
            ))}
          </div>
          <Spacer />
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <Meta color="#000000">{spec.footer}</Meta>
            <Display size={48} color="#000000">klaps.space</Display>
          </div>
        </Card>
      );
    case "outro":
      return (
        <Card background={ACCENT}>
          <Logo color="#000000" />
          <Spacer />
          <span style={{ fontSize: 40, lineHeight: 1.3, color: "#000000", maxWidth: 700 }}>{spec.text}</span>
          <div style={{ display: "flex", marginTop: GAP.meta }}>
            <Display size={150} color="#000000">klaps.space</Display>
          </div>
          <Spacer />
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
              <svg width={34} height={44} viewBox="0 0 24 30">
                <path d="M2 0h20v30l-10-8-10 8z" fill="#000000" />
              </svg>
              <Meta color="#000000">Zapisz na później</Meta>
            </div>
            <Meta color="#000000">Link w bio</Meta>
          </div>
        </Card>
      );
  }
};

const slideArt = (spec: SlideSpec): { art: Art; box: Box }[] => {
  const full = { width: CARD.width, height: CARD.height };
  switch (spec.kind) {
    case "cover":
      return spec.strip.map((art) => ({
        art,
        box: {
          width: Math.floor((CARD.width - TILE_GAP * (spec.strip.length - 1)) / spec.strip.length),
          height: COVER_STRIP_HEIGHT,
        },
      }));
    case "stat":
    case "film":
    case "hero":
      return [{ art: spec.art, box: full }];
    default:
      return [];
  }
};

// Renders a whole series carousel: art is fetched per slide, then every
// slide goes through the same satori pipeline as the other formats.
// A cover without its image is not worth posting, so a missing hero image
// fails the whole series instead of rendering an empty card.
export const renderSeries = async (specs: SlideSpec[]): Promise<Buffer[]> =>
  Promise.all(
    specs.map(async (spec) => {
      const images = await Promise.all(slideArt(spec).map(({ art, box }) => loadArt(art, box)));
      if (spec.kind === "hero" && !images[0]) {
        throw new Error(`No image for the "${spec.title}" cover`);
      }
      return renderElement(<Slide spec={spec} images={images} />, layout);
    })
  );
