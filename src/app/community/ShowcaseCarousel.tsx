/**
 * B-116: den rolige karusellen med godkjente bidrag. Vises på forsiden før innlogging (festet nederst,
 * uten å forskyve innloggingsboksen eller globusen) og nederst på prosjektlisten for innloggede.
 * Ingen automatisk rotasjon når brukeren foretrekker redusert bevegelse.
 */
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, MessageSquare } from "lucide-react";
import { getShowcaseFeed } from "@/adapters/community/showcase.functions";
import { ShowcaseCard } from "./ShowcaseCard";
import { ShowcaseComments } from "./ShowcaseComments";
import { t } from "@/core/i18n/keyed";

const ROTATE_MS = 9000;

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const on = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return reduced;
}

export function ShowcaseCarousel({ signedIn, fixed = false }: { signedIn: boolean; fixed?: boolean }) {
  const q = useQuery({ queryKey: ["showcase-feed"], queryFn: () => getShowcaseFeed({}), staleTime: 60_000 });
  const reduced = usePrefersReducedMotion();
  const [index, setIndex] = useState(0);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const items = q.data ?? [];

  useEffect(() => {
    if (reduced || items.length < 2) return;
    const id = setInterval(() => setIndex((i) => (i + 1) % items.length), ROTATE_MS);
    return () => clearInterval(id);
  }, [reduced, items.length]);
  useEffect(() => { setIndex(0); setCommentsOpen(false); }, [items.length]);

  if (!items.length) return null;
  const item = items[index % items.length]!;
  const step = (d: number) => { setIndex((i) => (i + d + items.length) % items.length); setCommentsOpen(false); };

  const carousel = (
    <section
      data-testid="showcase-carousel"
      aria-label={t("b116.carousel.aria")}
      aria-roledescription="carousel"
      className={
        "pointer-events-auto w-full max-w-[360px] " +
        (fixed ? "" : "mx-auto mt-8")
      }
    >
      <div className="relative">
        <ShowcaseCard item={item} />
        {items.length > 1 ? (
          <div className="mt-1 flex items-center justify-center gap-3">
            <button type="button" aria-label={t("b116.carousel.prev")} title={t("b116.carousel.prev")} onClick={() => step(-1)}
              className="rounded-sm p-1 text-text-tertiary hover:bg-surface-2 hover:text-text-primary">
              <ChevronLeft className="size-4" />
            </button>
            <span className="flex gap-1" aria-hidden>
              {items.map((it, i) => (
                <span key={it.id} className={"size-1.5 rounded-full " + (i === index % items.length ? "bg-accent-brand" : "bg-surface-3")} />
              ))}
            </span>
            <button type="button" aria-label={t("b116.carousel.next")} title={t("b116.carousel.next")} onClick={() => step(1)}
              className="rounded-sm p-1 text-text-tertiary hover:bg-surface-2 hover:text-text-primary">
              <ChevronRight className="size-4" />
            </button>
          </div>
        ) : null}
      </div>
      <div className="mt-1 flex justify-center">
        <button type="button" data-testid="showcase-comments-toggle" aria-expanded={commentsOpen}
          onClick={() => setCommentsOpen((o) => !o)}
          className="flex items-center gap-1 text-[11px] text-text-tertiary hover:text-text-primary">
          <MessageSquare className="size-3" aria-hidden /> {t("b116.comments.title")}
        </button>
      </div>
      {commentsOpen ? (
        <div className="mt-1 rounded-sm border border-border bg-surface-1">
          <ShowcaseComments itemId={item.id} signedIn={signedIn} />
        </div>
      ) : null}
    </section>
  );

  if (!fixed) return carousel;
  // Festet nederst på innloggingssiden: innloggingsboksen og globusen røres ikke.
  return (
    <div data-testid="showcase-carousel-dock" className="pointer-events-none fixed inset-x-0 bottom-0 z-10 flex justify-center px-4 pb-3">
      {carousel}
    </div>
  );
}
