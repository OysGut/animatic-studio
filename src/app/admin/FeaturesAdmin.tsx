/**
 * B-114 C0: administrator slår Community-funksjoner av, på beta for inviterte testere, eller på.
 * Testerlisten søkes fram blant eksisterende brukere. Databasen håndhever; dette er bare styringen.
 */
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FEATURE_STATES, type FeatureKey, type FeatureState } from "@/core/community";
import { fetchAdminFeatures, findUsers, setFeatureState, setFeatureTesters, type AdminFeature, type FeatureTester } from "@/adapters/browser/features";
import { Button } from "@/components/ui/button";
import { MY_FEATURES_KEY } from "@/app/community/use-feature";
import { t } from "@/core/i18n/keyed";

export const ADMIN_FEATURES_KEY = ["admin-features"] as const;

function featureName(k: FeatureKey): string {
  switch (k) {
    case "community.sharing": return t("b114.feature.sharing");
    case "community.review": return t("b114.feature.review");
    case "community.abtest": return t("b114.feature.abtest");
    case "community.profiles": return t("b114.feature.profiles");
    case "community.public": return t("b114.feature.public");
  }
}
function stateName(s: FeatureState): string {
  return s === "off" ? t("b114.state.off") : s === "beta" ? t("b114.state.beta") : t("b114.state.on");
}

export function FeaturesAdmin() {
  const q = useQuery({ queryKey: ADMIN_FEATURES_KEY, queryFn: fetchAdminFeatures });
  return (
    <section className="flex flex-col gap-3 rounded-md border border-border bg-surface-1 p-4" data-testid="admin-features">
      <h2 className="text-sm font-semibold text-text-primary">{t("b114.admin.title")}</h2>
      <p className="text-xs text-text-tertiary">{t("b114.admin.note")}</p>
      {!q.data ? (
        <p className="text-xs text-text-tertiary">{q.isLoading ? t("b109.admin.loading") : t("b114.admin.unavailable")}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {q.data.map((f) => <FeatureRow key={f.key} feature={f} />)}
        </ul>
      )}
    </section>
  );
}

function FeatureRow({ feature }: { feature: AdminFeature }) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [testers, setTesters] = useState<readonly FeatureTester[]>(feature.testers);
  const [dirty, setDirty] = useState(false);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<readonly FeatureTester[]>([]);
  const refresh = async () => {
    await qc.invalidateQueries({ queryKey: ADMIN_FEATURES_KEY });
    await qc.invalidateQueries({ queryKey: MY_FEATURES_KEY });
  };
  async function changeState(state: FeatureState) {
    setBusy(true); setFailed(false);
    const ok = await setFeatureState(feature.key, state);
    setBusy(false); if (!ok) setFailed(true);
    await refresh();
  }
  async function saveTesters() {
    setBusy(true); setFailed(false);
    const ok = await setFeatureTesters(feature.key, testers.map((x) => x.userId));
    setBusy(false); if (!ok) setFailed(true); else setDirty(false);
    await refresh();
  }
  const label = featureName(feature.key);
  return (
    <li className="flex flex-col gap-2 rounded-sm border border-border p-3" data-testid={`feature-${feature.key}`}>
      <div className="flex flex-wrap items-center gap-3">
        <span className="min-w-40 text-xs font-medium text-text-primary">{label}</span>
        <div role="radiogroup" aria-label={label} className="flex overflow-hidden rounded-sm border border-border-control">
          {FEATURE_STATES.map((s) => (
            <button key={s} type="button" role="radio" aria-checked={feature.state === s} data-testid={`feature-${feature.key}-${s}`}
              disabled={busy || feature.state === s} onClick={() => void changeState(s)}
              className={"px-3 py-1 text-xs " + (feature.state === s ? "bg-surface-3 font-semibold text-text-primary" : "text-text-secondary hover:bg-surface-2")}>
              {stateName(s)}
            </button>
          ))}
        </div>
      </div>
      {feature.state === "beta" ? (
        <div className="flex flex-col gap-2" data-testid={`feature-${feature.key}-testers`}>
          <span className="text-xs text-text-secondary">{t("b114.admin.testers")}</span>
          {testers.length === 0 ? <p className="text-xs text-text-tertiary">{t("b114.admin.no-testers")}</p> : (
            <ul className="flex flex-wrap gap-1">
              {testers.map((x) => (
                <li key={x.userId} className="flex items-center gap-1 rounded-sm bg-surface-2 px-2 py-0.5 text-xs text-text-primary">
                  {x.email ?? x.displayName ?? x.userId}
                  <button type="button" className="text-text-tertiary hover:text-text-primary" aria-label={t("b114.admin.remove")}
                    onClick={() => { setTesters(testers.filter((y) => y.userId !== x.userId)); setDirty(true); }}>×</button>
                </li>
              ))}
            </ul>
          )}
          <div className="flex gap-2">
            <input type="search" value={query} placeholder={t("b114.admin.search")} aria-label={t("b114.admin.search")}
              onChange={async (e) => { const v = e.target.value; setQuery(v); setHits(await findUsers(v)); }}
              className="h-8 flex-1 rounded-sm border border-border-control bg-surface-0 px-2 text-xs text-text-primary" />
            <Button size="sm" disabled={busy || !dirty} onClick={() => void saveTesters()}>{t("b114.admin.save")}</Button>
          </div>
          {hits.length > 0 ? (
            <ul className="flex flex-col gap-1">
              {hits.filter((h) => !testers.some((x) => x.userId === h.userId)).map((h) => (
                <li key={h.userId}>
                  <button type="button" className="text-xs text-text-link hover:underline"
                    onClick={() => { setTesters([...testers, h]); setDirty(true); setQuery(""); setHits([]); }}>
                    {t("b114.admin.add", { email: h.email ?? h.userId })}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
      {failed ? <p role="alert" className="text-xs text-status-danger">{t("b114.admin.failed")}</p> : null}
    </li>
  );
}
