import { INSTAGRAM_POST } from "../../../../src/constants";
import type { IScreeningDetail } from "../../types/IScreenings";
import type { ComponentType } from "react";

const InstagramPostTemplate: ComponentType<IScreeningDetail> = ({ movie }) => {
  const posterUrl = movie.posterUrl ?? "";
  const backdropUrl = movie.backdropUrl ?? "";

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
        className="absolute inset-0 h-full w-full object-cover blur-2xl opacity-45"
      />

      <div className="absolute inset-0 bg-linear-to-b from-[#021a3d]/45 via-[#042657]/40 to-black/80" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(125,211,252,0.22),transparent_48%)]" />

      <div className="relative aspect-3/4 w-[72%] flex items-center justify-center z-10">
        <div className="absolute -top-8 -left-8 w-16 h-16 border-t-4 border-l-4 border-[#90030c] z-20 pointer-events-none" />
        <div className="absolute -bottom-8 -right-8 w-16 h-16 border-b-4 border-r-4 border-[#90030c] z-20 pointer-events-none" />

        <img
          src={posterUrl}
          alt={movie.title}
          className="h-full w-full object-cover rounded-[2px] border border-white/10 shadow-[0_14px_45px_rgba(0,0,0,0.55)]"
        />
      </div>
    </article>
  );
};

export default InstagramPostTemplate;
