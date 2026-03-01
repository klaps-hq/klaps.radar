type InstagramFeedPostTemplateProps = {
  title: string;
  description: string;
  cinemaName: string;
  cinemaAddress: string;
  screeningDateLabel: string;
  ratingLabel: string;
  posterUrl: string;
  backdropUrl: string;
  ctaLabel: string;
};

export const InstagramFeedPostTemplate = ({
  title,
  description,
  cinemaName,
  cinemaAddress,
  screeningDateLabel,
  ratingLabel,
  posterUrl,
  backdropUrl,
  ctaLabel,
}: InstagramFeedPostTemplateProps) => {
  return (
    <article
      className="relative h-[1350px] w-[1080px] overflow-hidden bg-black text-white"
      aria-label="Instagram feed post template"
    >
      <img
        src={backdropUrl}
        alt=""
        className="absolute inset-0 h-full w-full scale-110 object-cover blur-2xl brightness-[0.35]"
      />
      <div className="absolute inset-0 bg-black/45" />

      <header className="absolute left-14 right-14 top-12 z-10 flex items-center justify-between">
        <span className="rounded-full bg-red-600/90 px-5 py-2 text-2xl font-bold tracking-wide">
          KLAPS
        </span>
        <span className="rounded-full border border-white/40 bg-white/10 px-5 py-2 text-xl font-semibold">
          {ratingLabel}
        </span>
      </header>

      <div className="absolute inset-0 z-10 px-16 pb-16 pt-36">
        <div className="mx-auto h-[860px] w-[640px] overflow-hidden rounded-2xl border-2 border-white/70 shadow-2xl shadow-black/80">
          <img
            src={posterUrl}
            alt={`Poster filmu ${title}`}
            className="h-full w-full object-cover"
          />
        </div>

        <section
          className="mt-12 rounded-2xl border border-white/20 bg-black/55 p-10 backdrop-blur-sm"
          aria-label="Film details"
        >
          <h1 className="text-6xl font-bold leading-tight">{title}</h1>
          <p className="mt-5 max-h-[220px] overflow-hidden text-3xl leading-relaxed text-white/90">
            {description}
          </p>

          <dl className="mt-7 space-y-2 text-2xl text-white/90">
            <div>
              <dt className="inline font-semibold text-white">Kino: </dt>
              <dd className="inline">{cinemaName}</dd>
            </div>
            <div>
              <dt className="inline font-semibold text-white">Adres: </dt>
              <dd className="inline">{cinemaAddress}</dd>
            </div>
            <div>
              <dt className="inline font-semibold text-white">Seans: </dt>
              <dd className="inline">{screeningDateLabel}</dd>
            </div>
          </dl>
        </section>

        <footer className="mt-8 flex items-center justify-between">
          <span className="text-2xl font-semibold text-white/80">
            klaps.space
          </span>
          <span className="rounded-xl bg-red-600 px-6 py-3 text-2xl font-bold">
            {ctaLabel}
          </span>
        </footer>
      </div>
    </article>
  );
};

export type { InstagramFeedPostTemplateProps };
