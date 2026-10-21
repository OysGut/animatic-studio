/**
 * P8 (REQ-0140): original og harmonisert bilde før godkjenning – side om side med en skyver, eller veksling
 * mellom dem. Bare visning; ingenting lagres her.
 */
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { t } from "@/core/i18n/keyed";

export function HarmonizeCompare({ original, result }: { original: string | undefined; result: string | undefined }) {
  const [mode, setMode] = useState<"slider" | "toggle">("slider");
  const [pos, setPos] = useState(50);
  const [showResult, setShowResult] = useState(true);
  return (
    <div data-testid="harmonize-compare" className="flex flex-col gap-1.5">
      <div className="flex gap-1.5" role="group" aria-label={t("app-library-harmonize-compare.harmonize-compare.aria-label.4fbe0191f491")}>
        <Button size="sm" variant={mode === "slider" ? "default" : "secondary"} data-testid="harmonize-compare-slider-mode" onClick={() => setMode("slider")}>
          {t("app-library-harmonize-compare.harmonize-compare.button.161029389940")}
        </Button>
        <Button size="sm" variant={mode === "toggle" ? "default" : "secondary"} data-testid="harmonize-compare-toggle-mode" onClick={() => setMode("toggle")}>
          {t("app-library-harmonize-compare.harmonize-compare.button.815314ffe105")}
        </Button>
      </div>
      {mode === "slider" ? (
        <>
          <div className="relative aspect-square w-full overflow-hidden rounded-sm border border-border bg-surface-3">
            {original ? <img src={original} alt={t("app-library-harmonize-compare.harmonize-compare.alt.0cf9a2fef661")} className="absolute inset-0 h-full w-full object-contain" /> : null}
            {result ? (
              <img
                src={result}
                alt={t("app-library-harmonize-compare.harmonize-compare.alt.5a7da45245a3")}
                data-testid="harmonize-compare-result"
                className="absolute inset-0 h-full w-full object-contain"
                style={{ clipPath: `inset(0 0 0 ${pos}%)` }}
              />
            ) : null}
            <div aria-hidden className="absolute inset-y-0 w-px bg-accent-warm" style={{ left: `${pos}%` }} />
            <span className="absolute left-1 top-1 rounded-sm bg-surface-1/80 px-1 text-[11px] text-text-primary">{t("app-library-harmonize-compare.harmonize-compare.span.0cf9a2fef661")}</span>
            <span className="absolute right-1 top-1 rounded-sm bg-surface-1/80 px-1 text-[11px] text-text-primary">{t("app-library-harmonize-compare.harmonize-compare.span.5a7da45245a3")}</span>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            value={pos}
            data-testid="harmonize-compare-range"
            aria-label={t("app-library-harmonize-compare.harmonize-compare.aria-label.fac1c9169bde")}
            onChange={(e) => setPos(Number(e.target.value))}
          />
        </>
      ) : (
        <>
          <div className="relative aspect-square w-full overflow-hidden rounded-sm border border-border bg-surface-3">
            {(showResult ? result : original) ? (
              <img src={showResult ? result : original} alt={showResult ? t("app-library-harmonize-compare.harmonize-compare.alt.5a7da45245a3.2") : t("app-library-harmonize-compare.harmonize-compare.alt.0cf9a2fef661.2")} className="absolute inset-0 h-full w-full object-contain" />
            ) : null}
          </div>
          <Button size="sm" variant="secondary" data-testid="harmonize-compare-toggle" onClick={() => setShowResult((x) => !x)}>
            {showResult ? t("app-library-harmonize-compare.harmonize-compare.button.f4285e660a5f") : t("app-library-harmonize-compare.harmonize-compare.button.7af22ece9e2e")}
          </Button>
        </>
      )}
    </div>
  );
}
