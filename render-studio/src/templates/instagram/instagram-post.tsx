import { INSTAGRAM_POST } from "../../../../src/constants";
import type { IScreeningDetail } from "../../types/IScreenings";
import type { ComponentType } from "react";
import Watermark from "../../components/watermark";
import { POLISH_MONTHS } from "../../utils";

const formatPolishDate = (dateStr: string): string => {
  const [year, month, day] = dateStr.split("-").map(Number);
  return `${day} ${POLISH_MONTHS[month - 1]} ${year}`;
};

const InstagramPostTemplate: ComponentType<IScreeningDetail> = ({
  movie,
  screening,
}) => {
  const posterUrl = movie.posterUrl ?? "";
  const backdropUrl = movie.backdropUrl ?? "";
  const genresLabel = movie.genres.map((g) => g.name).join(" \u00B7 ");
  const dateLabel = formatPolishDate(screening.date);

  return (
    <article
      className="relative isolate overflow-hidden bg-black text-white flex flex-col items-center justify-center min-h-full w-full"
      style={{
        width: INSTAGRAM_POST.CANVAS_SIZE.width,
        height: INSTAGRAM_POST.CANVAS_SIZE.height,
      }}
    >
      <img
        src={backdropUrl}
        aria-hidden="true"
        className="absolute inset-0 h-full w-full object-cover blur-2xl opacity-50"
      />

      <div className="absolute inset-0 bg-linear-to-b from-black/50 via-black/30 to-black/85" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(255,255,255,0.06),transparent_70%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_40%,rgba(0,0,0,0.65))]" />

      <div className="relative z-10 flex flex-col items-center w-full">
        <div className="relative aspect-3/4 w-[60%] flex items-center justify-center">
          <div className="absolute -inset-4 bg-[radial-gradient(ellipse_at_center,rgba(255,255,255,0.05),transparent_70%)] pointer-events-none" />

          <div className="absolute -top-5 -left-5 w-12 h-12 border-t-4 border-l-4 border-[#90030c] pointer-events-none" />
          <div className="absolute -bottom-5 -right-5 w-12 h-12 border-b-4 border-r-4 border-[#90030c] pointer-events-none" />

          <img
            src={posterUrl}
            alt={movie.title}
            className="h-full w-full object-cover rounded-sm border border-white/15 ring-1 ring-white/5 shadow-[0_4px_12px_rgba(0,0,0,0.4),0_16px_48px_rgba(0,0,0,0.5),0_32px_80px_rgba(0,0,0,0.3)]"
          />
        </div>

        <div className="mt-10 flex flex-col items-center text-center gap-5">
          <h2 className="text-6xl font-bold tracking-tight leading-none">
            {movie.title}
          </h2>

          {genresLabel && (
            <p className="text-4xl tracking-widest uppercase text-white/50">
              {movie.productionYear} &middot; {genresLabel}
            </p>
          )}

          <div className="h-1 bg-[#90030c] w-20" aria-hidden="true" />

          <p className="text-4xl tracking-wide text-white/80">
            {dateLabel}, godz. {screening.time}
          </p>
          <p className="text-3xl text-white/45">{screening.cinema.name}</p>
          <p className="text-3xl text-white/45">
            {screening.cinema.street}, {screening.cinema.city.name}
          </p>
        </div>
      </div>

      <svg
        className="absolute inset-0 w-full h-full z-20 pointer-events-none"
        style={{ opacity: 0.04, mixBlendMode: "overlay" }}
        aria-hidden="true"
      >
        <filter id="grain">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.65"
            numOctaves="3"
            stitchTiles="stitch"
          />
        </filter>
        <rect width="100%" height="100%" filter="url(#grain)" />
      </svg>

      <Watermark className="z-30" />
    </article>
  );
};

export default InstagramPostTemplate;
