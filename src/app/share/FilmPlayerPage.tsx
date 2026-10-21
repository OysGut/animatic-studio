/**
 * Den offentlige visningssiden for en delt filmversjon (GP5, §29–30, §33). Bare tittel og film. Ingen
 * innlogging, ingen prosjektdata og ingen tredjepartsskript. Mobilens egen spiller: spill av, pause,
 * spoling, fullskjerm og lyd (iPhone krever trykk på spill av for lyd).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { resolveFilmShare, type PublicFilm } from "@/adapters/share/film-share.functions";
import { t } from "@/core/i18n/keyed";

export function FilmPlayerPage({ token }: { token: string }) {
  const [film, setFilm] = useState<PublicFilm | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "gone">("loading");
  const video = useRef<HTMLVideoElement>(null);
  const resumeAt = useRef(0);

  const load = useCallback(async () => {
    const r = await resolveFilmShare({ data: { token } }).catch(() => ({ ok: false as const }));
    if (r.ok) {
      setFilm(r.film);
      setState("ready");
    } else setState("gone");
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  if (state === "loading")
    return (
      <main className="flex min-h-dvh items-center justify-center bg-surface-0 text-text-tertiary" data-testid="film-player-loading">
        {t("app-share-film-player-page.film-player-page.main.50aed27d9aaa")}
      </main>
    );
  if (state === "gone" || !film)
    return (
      <main className="flex min-h-dvh items-center justify-center bg-surface-0 p-6 text-center text-text-secondary" data-testid="film-player-gone">
        {t("app-share-film-player-page.film-player-page.main.385a941ea606")}
      </main>
    );
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-surface-0 p-3" data-testid="film-player">
      <h1 className="text-center text-base font-semibold text-text-primary">{film.title}</h1>
      <video
        ref={video}
        src={film.url}
        controls
        playsInline
        preload="metadata"
        controlsList="nodownload"
        className="max-h-[80dvh] w-full max-w-5xl bg-surface-1"
        style={{ aspectRatio: `${film.width} / ${film.height}` }}
        data-testid="film-player-video"
        onTimeUpdate={(e) => (resumeAt.current = e.currentTarget.currentTime)}
        onError={() => {
          // Den kortlivede lenken kan ha gått ut: hent en ny og fortsett der filmen var
          const at = resumeAt.current;
          void load().then(() => {
            if (video.current) video.current.currentTime = at;
          });
        }}
      />
      <p className="text-xs text-text-tertiary">
        {Math.floor(film.durationMs / 60000)}:{String(Math.round((film.durationMs % 60000) / 1000)).padStart(2, "0")}
      </p>
    </main>
  );
}
