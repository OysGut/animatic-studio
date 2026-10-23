/**
 * B-116: kortet som viser ett bidrag – likt i karusellen, i forhåndsvisningen før deling,
 * på «Mine delinger» og i admin-køen, slik at forhåndsvisningen er nøyaktig lik visningen.
 */
import { Thumbnail } from "@/app/shared/Thumbnail";
import { Film, Music, FileText } from "lucide-react";
import type { ShowcaseItem } from "@/core/community";
import { t } from "@/core/i18n/keyed";

export function ShowcaseCard({ item, testId = "showcase-card" }: { item: Pick<ShowcaseItem, "kind" | "title" | "text" | "excerpt" | "url" | "mime" | "authorName">; testId?: string }) {
  return (
    <article data-testid={testId} className="flex w-full flex-col gap-2 overflow-hidden rounded-sm border border-border bg-surface-1">
      {item.kind === "script" ? (
        <div className="flex max-h-40 flex-col gap-1 overflow-hidden bg-surface-2 px-4 py-3">
          <FileText className="size-4 shrink-0 text-text-tertiary" aria-hidden />
          <p className="whitespace-pre-line text-[13px] italic text-text-secondary">{item.excerpt}</p>
        </div>
      ) : item.url && item.mime?.startsWith("image/") ? (
        <Thumbnail src={item.url} alt={item.title} className="max-h-48 w-full bg-surface-2" />
      ) : item.url && item.mime?.startsWith("video/") ? (
        <video src={item.url} className="max-h-48 w-full bg-surface-2" controls muted playsInline preload="metadata" />
      ) : item.url && item.mime?.startsWith("audio/") ? (
        <div className="flex items-center gap-2 bg-surface-2 px-4 py-3">
          <Music className="size-4 shrink-0 text-text-tertiary" aria-hidden />
          <audio src={item.url} controls preload="metadata" className="h-8 w-full" />
        </div>
      ) : (
        <div className="flex h-24 items-center justify-center bg-surface-2">
          <Film className="size-5 text-text-tertiary" aria-hidden />
        </div>
      )}
      <div className="flex flex-col gap-1 px-4 pb-3">
        <h3 className="truncate text-[13px] font-semibold text-text-primary">{item.title}</h3>
        {item.text ? <p className="line-clamp-3 whitespace-pre-line text-xs text-text-secondary">{item.text}</p> : null}
        {item.authorName ? <p className="text-[11px] text-text-tertiary">{t("b116.card.by", { name: item.authorName })}</p> : null}
      </div>
    </article>
  );
}
