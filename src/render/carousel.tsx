import type { Screening } from "../types/types";
import { splitScreeningDate } from "../utils/format";
import { DISPLAY_LINE_HEIGHT, EYEBROW_GAP, LAYOUTS } from "./template";

// Weekly carousel bookends. The screening slides in between reuse the post
// template, so the cover and outro only add the "table of contents" and the
// save/visit call to action, in the same black + Anton/Inter language.
const layout = LAYOUTS.post;
const CARD = {
  width: layout.width - layout.frame.left - layout.frame.right,
  height: layout.height - layout.frame.top - layout.frame.bottom,
};
const STRIP_HEIGHT = 138;
export const STRIP_SIZE = {
  width: CARD.width - layout.pad * 2,
  height: STRIP_HEIGHT,
};
const STRIP_GAP = 14;
const HAIRLINE = "1px solid rgba(255,255,255,0.12)";

const formatDayMonth = (isoDate: string): string => {
  const [, m, d] = isoDate.split("-");
  return `${Number(d)}.${m}`;
};

const Logo = ({ size = 36 }: { size?: number }) => (
  <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
    <svg
      width={Math.round(size * 0.94)}
      height={Math.round(size * 0.67)}
      viewBox="0 0 28 20"
      fill="none"
    >
      <polygon points="0,8 28,0 28,20 0,12" fill="#ffffff" />
    </svg>
    <span style={{ fontSize: size, fontWeight: 700, letterSpacing: "-0.02em" }}>
      klaps
    </span>
  </div>
);

const Frame = ({ children }: { children: React.ReactNode }) => (
  <div
    style={{
      width: layout.width,
      height: layout.height,
      display: "flex",
      color: "#ffffff",
      fontFamily: "Inter",
      backgroundColor: "#000000",
      padding: `${layout.frame.top}px ${layout.frame.right}px ${layout.frame.bottom}px ${layout.frame.left}px`,
    }}
  >
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width: CARD.width,
        height: CARD.height,
        borderRadius: layout.radius,
        border: HAIRLINE,
        backgroundColor: "#0a0a0a",
        padding: `${layout.headerTop}px ${layout.pad}px ${layout.pad}px ${layout.pad}px`,
      }}
    >
      {children}
    </div>
  </div>
);

export type CarouselEntry = { screening: Screening; imageUrl: string | null };

export const CarouselCover = ({
  entries,
  dateFrom,
  dateTo,
}: {
  entries: CarouselEntry[];
  dateFrom: string;
  dateTo: string;
}) => {
  const stripWidth = STRIP_SIZE.width;

  return (
    <Frame>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <Logo />
        <span
          style={{
            fontSize: 22,
            textTransform: "uppercase",
            letterSpacing: "0.28em",
            color: "rgba(255,255,255,0.85)",
          }}
        >
          {formatDayMonth(dateFrom)} – {formatDayMonth(dateTo)}
        </span>
      </div>

      <span
        style={{
          marginTop: 48,
          fontSize: 22,
          textTransform: "uppercase",
          letterSpacing: "0.3em",
          color: "rgba(255,255,255,0.7)",
        }}
      >
        Tydzień w kinach studyjnych
      </span>
      <span
        style={{
          marginTop: EYEBROW_GAP,
          fontFamily: "Anton",
          fontSize: 92,
          lineHeight: DISPLAY_LINE_HEIGHT,
          textTransform: "uppercase",
        }}
      >
        {entries.length} seansów na dużym ekranie
      </span>

      <div style={{ display: "flex", flex: 1 }} />

      <div style={{ display: "flex", flexDirection: "column", gap: STRIP_GAP }}>
        {entries.map(({ screening, imageUrl }, index) => {
          const { date, time } = splitScreeningDate(screening.date);
          return (
            <div
              key={screening.id}
              style={{
                display: "flex",
                position: "relative",
                width: stripWidth,
                height: STRIP_HEIGHT,
                borderRadius: 12,
                overflow: "hidden",
                backgroundColor: "#1a1a1a",
              }}
            >
              {imageUrl && (
                <img
                  src={imageUrl}
                  width={stripWidth}
                  height={STRIP_HEIGHT}
                  style={{
                    position: "absolute",
                    width: stripWidth,
                    height: STRIP_HEIGHT,
                    objectFit: "cover",
                    borderRadius: 12,
                  }}
                />
              )}
              <div
                style={{
                  position: "absolute",
                  width: stripWidth,
                  height: STRIP_HEIGHT,
                  borderRadius: 12,
                  backgroundImage:
                    "linear-gradient(90deg, rgba(0,0,0,0.92) 0%, rgba(0,0,0,0.75) 55%, rgba(0,0,0,0.25) 100%)",
                }}
              />
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 26,
                  padding: "0 28px",
                  width: stripWidth,
                }}
              >
                <span
                  style={{
                    fontFamily: "Anton",
                    fontSize: 54,
                    color: "rgba(255,255,255,0.35)",
                    width: 40,
                  }}
                >
                  {index + 1}
                </span>
                <div style={{ display: "flex", flexDirection: "column" }}>
                  <span
                    style={{
                      fontFamily: "Anton",
                      fontSize: screening.movie.title.length > 26 ? 32 : 40,
                      textTransform: "uppercase",
                      lineHeight: DISPLAY_LINE_HEIGHT,
                    }}
                  >
                    {screening.movie.title}
                  </span>
                  <span
                    style={{
                      marginTop: 6,
                      fontSize: 19,
                      textTransform: "uppercase",
                      letterSpacing: "0.18em",
                      color: "rgba(255,255,255,0.7)",
                    }}
                  >
                    {formatDayMonth(date)}
                    {time ? ` · ${time}` : ""} · {screening.cinema.city.name}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginTop: 30,
        }}
      >
        <span
          style={{
            fontSize: 23,
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.18em",
          }}
        >
          Przesuń
        </span>
        <svg
          width="38"
          height="38"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#ffffff"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M5 12h14" />
          <path d="m12 5 7 7-7 7" />
        </svg>
      </div>
    </Frame>
  );
};

export const CarouselOutro = () => (
  <Frame>
    <Logo />
    <div style={{ display: "flex", flex: 1 }} />
    <span
      style={{
        fontSize: 22,
        textTransform: "uppercase",
        letterSpacing: "0.3em",
        color: "rgba(255,255,255,0.7)",
      }}
    >
      Nie przegap żadnego
    </span>
    <span
      style={{
        marginTop: EYEBROW_GAP,
        fontFamily: "Anton",
        fontSize: 120,
        lineHeight: DISPLAY_LINE_HEIGHT,
        textTransform: "uppercase",
      }}
    >
      Zapisz ten post
    </span>
    <div
      style={{ width: 64, borderTop: "4px solid #ffffff", marginTop: 34 }}
    />
    <span
      style={{
        marginTop: 34,
        fontSize: 30,
        lineHeight: 1.45,
        color: "rgba(255,255,255,0.8)",
        maxWidth: 760,
      }}
    >
      Pełny repertuar seansów specjalnych, klasyki i kina studyjnego w całej
      Polsce znajdziesz na
    </span>
    <span
      style={{
        marginTop: 18,
        fontFamily: "Anton",
        fontSize: 64,
        textTransform: "uppercase",
        letterSpacing: "0.02em",
      }}
    >
      klaps.space
    </span>
    <div
      style={{
        width: "100%",
        borderTop: "1px solid rgba(255,255,255,0.25)",
        marginTop: 56,
      }}
    />
    <span
      style={{
        marginTop: 22,
        fontSize: 23,
        fontWeight: 700,
        textTransform: "uppercase",
        letterSpacing: "0.18em",
        color: "rgba(255,255,255,0.92)",
      }}
    >
      Link w bio · @klaps.space
    </span>
  </Frame>
);
