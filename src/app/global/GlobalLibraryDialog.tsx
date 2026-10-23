/**
 * Det globale ressursbiblioteket (GP2, spes. §2–16, G1–G10), åpnet fra prosjektets bibliotek: søk og filter,
 * forhåndsvisning (bilde, lyd og video), varianter, «Brukt i prosjekter», «Bruk i prosjekt» og varselet
 * «Ny versjon finnes – oppdater?». Redaktører kan legge til ressurser, varianter og versjoner; eieren kan
 * arkivere. Ingenting i prosjektet endres automatisk (§9).
 */
import { Thumbnail } from "@/app/shared/Thumbnail";
import { Link } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { EMPTY_GLOBAL_FILTER, GLOBAL_KINDS, GLOBAL_KIND_LABEL, cleanLabels, filterGlobalAssets, globalFacets, globalUpdates, withdrawnInUse, latestGlobalVersions, linkedProjectAsset, tm, type GlobalAssetBundle, type GlobalFilter, type GlobalKind, type GlobalVersion, type ProjectState } from "@/core";
import {
  createGlobalAsset,
  createGlobalVariant,
  globalAssetProjects,
  setGlobalAssetArchived,
} from "@/adapters/browser/global-library";
import { getGlobalFileUrls } from "@/adapters/global/global-library.functions";
import type { Commands } from "@/app/project/use-commands";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { globalBundlesKey, useGlobalBundles, useProjectWorkspace } from "./use-global";
import { uploadGlobalVersion, useGlobalInProject } from "./global-actions";
import { t } from "@/core/i18n/keyed";

const input =
  "h-8 w-full rounded-sm border border-border-control bg-surface-3 px-2 text-[13px] text-text-primary";
const select =
  "h-8 rounded-sm border border-border-control bg-surface-3 px-2 text-[13px] text-text-primary";

function Preview({ v, url }: { v: GlobalVersion; url: string | undefined }) {
  if (!url) return <div className="size-16 rounded-sm bg-surface-3" aria-hidden />;
  if (v.mimeType.startsWith("image/"))
    return <Thumbnail src={url} alt="" className="max-h-32 max-w-[12rem] rounded-sm" />;
  if (v.mimeType.startsWith("audio/"))
    return <audio controls src={url} className="w-56" data-testid="global-audio-preview" />;
  if (v.mimeType.startsWith("video/"))
    return <video controls src={url} className="max-h-40 rounded-sm" playsInline />;
  return <span className="text-xs text-text-tertiary">{v.mimeType}</span>;
}

export function GlobalLibraryDialog({
  open,
  onOpenChange,
  state,
  cmds,
  editable,
  onUsed,
  fixedKind,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  state: ProjectState;
  cmds: Commands;
  editable: boolean;
  onUsed?: (assetId: string) => void;
  /** GP6: vis bare én ressurstype (for eksempel maler i MTS eller bilder i Asset Studio). */
  fixedKind?: GlobalKind;
}) {
  const qc = useQueryClient();
  const ws = useProjectWorkspace(state.project.id);
  const bundles = useGlobalBundles(ws.workspaceId, open && ws.ready && ws.rights.use);
  const [filter, setFilter] = useState<GlobalFilter>(EMPTY_GLOBAL_FILTER);
  const [selected, setSelected] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [newKind, setNewKind] = useState<GlobalKind>(fixedKind ?? "logo");
  const [newName, setNewName] = useState("");
  const [newTags, setNewTags] = useState("");
  const newFile = useRef<HTMLInputElement>(null);
  const versionFile = useRef<HTMLInputElement>(null);
  const [versionTarget, setVersionTarget] = useState<string | null>(null);

  const all = bundles.data ?? [];
  const list = useMemo(
    () => filterGlobalAssets(all.map((b) => b.asset), filter).filter((a) => !fixedKind || a.kind === fixedKind),
    [all, filter, fixedKind],
  );
  const facets = useMemo(() => globalFacets(all.map((b) => b.asset)), [all]);
  const updates = useMemo(() => globalUpdates(state, all), [state, all]);
  // R3: kopier av versjoner som senere er trukket tilbake globalt – bare et varsel, prosjektet endres ikke
  const withdrawnHere = useMemo(() => withdrawnInUse(state, all), [state, all]);
  const current: GlobalAssetBundle | undefined = all.find((b) => b.asset.id === selected);

  const previewPaths = useMemo(() => {
    const out: string[] = [];
    for (const b of all) {
      if (!list.some((a) => a.id === b.asset.id)) continue;
      const latest = latestGlobalVersions(b.versions);
      const first = b.variants.find((v) => !v.archived);
      const v = first ? latest.get(first.id) : undefined;
      if (v) out.push(v.storageKey);
    }
    if (current) for (const v of current.versions) out.push(v.storageKey);
    return [...new Set(out)].slice(0, 200);
  }, [all, list, current]);
  const urls = useQuery({
    queryKey: ["global-urls", ws.workspaceId, previewPaths.join("|")],
    queryFn: () => getGlobalFileUrls({ data: { workspaceId: ws.workspaceId!, paths: previewPaths } }),
    enabled: open && !!ws.workspaceId && previewPaths.length > 0,
    staleTime: 300_000,
  });
  const usedIn = useQuery({
    queryKey: ["global-used-in", selected],
    queryFn: () => globalAssetProjects(selected!),
    enabled: open && !!selected,
  });

  const refresh = () => void qc.invalidateQueries({ queryKey: globalBundlesKey(ws.workspaceId) });

  async function act(fn: () => Promise<string | null>) {
    setBusy(true);
    setMsg(null);
    try {
      const ok = await fn();
      if (ok) setMsg({ ok: true, text: ok });
    } catch (e) {
      setMsg({ ok: false, text: tm((e as Error).message) });
    } finally {
      setBusy(false);
    }
  }

  async function use(b: GlobalAssetBundle, chosen?: readonly GlobalVersion[]) {
    await act(async () => {
      const r = await useGlobalInProject(state, cmds, b, chosen);
      if (r.error) throw new Error(r.error);
      void qc.invalidateQueries({ queryKey: ["global-used-in", b.asset.id] });
      if (r.assetId) onUsed?.(r.assetId);
      return r.reused
        ? t("app-global-global-library-dialog.use.act.d909b395d682")
        : t("app-global-global-library-dialog.use.act.d78dd443e850");
    });
  }

  async function create() {
    const file = newFile.current?.files?.[0];
    const workspaceId = ws.workspaceId;
    if (!workspaceId || !newName.trim() || !file) return;
    await act(async () => {
      const id = await createGlobalAsset(workspaceId, {
        kind: newKind,
        name: newName.trim(),
        description: "",
        categories: [],
        tags: cleanLabels(newTags.split(",")),
      });
      const variant = await createGlobalVariant(id, {
        name: t("app-global-global-library-dialog.name.name.5ae7e3c71566"),
        style: "reference",
        appearance: "",
      });
      setNewName("");
      setNewTags("");
      if (newFile.current) newFile.current.value = "";
      setSelected(id);
      try {
        await uploadGlobalVersion(workspaceId, id, variant, file);
      } catch {
        throw new Error(t("app-global-global-library-dialog.create.act.0d7b0489a1da"));
      } finally {
        refresh();
      }
      return t("app-global-global-library-dialog.create.act.2e30574da328");
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl" data-testid="global-library-dialog">
        <DialogHeader>
          <DialogTitle>{t("app-global-global-library-dialog.global-library-dialog.dialog-title.5633ef0a1f18")}</DialogTitle>
          <DialogDescription>
            {ws.workspaceName
              ? t("app-global-global-library-dialog.global-library-dialog.dialog-description.8ff55228021d", { workspaceName: String(ws.workspaceName) })
              : t("app-global-global-library-dialog.global-library-dialog.dialog-description.d6cd863d4466")}
          </DialogDescription>
        </DialogHeader>

        {!ws.ready ? (
          <p className="text-[13px] text-text-secondary">
            {t("app-global-global-library-dialog.global-library-dialog.p.5a35bca2a060")}
          </p>
        ) : ws.loaded && !ws.workspaceId ? (
          <p className="text-[13px] text-text-secondary" data-testid="global-no-workspace">
            {t("app-global-global-library-dialog.global-library-dialog.p.cca1ebe58835")}
            <Link to="/konto" className="text-accent-brand underline-offset-2 hover:underline">
              {t("app-global-global-library-dialog.global-library-dialog.link.b2b8bad32cc5")}
            </Link>
            .
          </p>
        ) : ws.loaded && !ws.rights.use ? (
          <p className="text-[13px] text-text-secondary" role="alert" data-testid="global-no-access">
            {t("app-global-global-library-dialog.global-library-dialog.p.43e7196f3257")}
          </p>
        ) : (
          <div className="flex max-h-[70vh] flex-col gap-3 overflow-y-auto">
            {updates.length ? (
              <section
                className="flex flex-col gap-1 rounded-md border border-status-warning bg-surface-2 p-3"
                data-testid="global-updates"
              >
                {updates.map((u) => {
                  const b = all.find((x) => x.asset.id === u.globalAssetId)!;
                  const variant = b.variants.find((v) => v.id === u.globalVariantId);
                  return (
                    <div key={`${u.globalAssetId}:${u.globalVariantId}`} className="flex items-center justify-between gap-2 text-[13px]">
                      <span className="text-text-primary">
                        {t("app-global-global-library-dialog.global-library-dialog.span.fea9485311d5", { name: String(b.asset.name), value2: String(variant?.name ?? ""), usedNumber: String(u.usedNumber), number: String(u.newer.number) })}
                      </span>
                      {editable ? (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busy}
                          data-testid={`global-update-${u.globalVariantId}`}
                          onClick={() => void use(b, [u.newer])}
                          title={t("app-global-global-library-dialog.global-library-dialog.title.d7a035374701")}
                        >
                          {t("app-global-global-library-dialog.global-library-dialog.button.b7c0895a7d9e")}
                        </Button>
                      ) : null}
                    </div>
                  );
                })}
              </section>
            ) : null}

            {withdrawnHere.length ? (
              <section className="flex flex-col gap-1 rounded-md border border-border bg-surface-2 p-3 text-[13px] text-text-secondary" data-testid="global-withdrawn">
                {withdrawnHere.map((w) => (
                  <p key={w.projectVersionId}>
                    {t("r3-global.withdrawn-in-use", { name: String(all.find((b) => b.asset.id === w.globalAssetId)?.asset.name ?? ""), number: w.version.number })}
                  </p>
                ))}
              </section>
            ) : null}

            <div className="flex flex-wrap gap-2">
              <input
                className={`${input} max-w-xs`}
                placeholder={t("app-global-global-library-dialog.global-library-dialog.placeholder.ca8b8a1af7de")}
                aria-label={t("app-global-global-library-dialog.global-library-dialog.aria-label.349309ebbcaa")}
                value={filter.query}
                onChange={(e) => setFilter({ ...filter, query: e.target.value })}
                data-testid="global-search"
              />
              <select
                className={select}
                aria-label={t("app-global-global-library-dialog.global-library-dialog.aria-label.faa62b3aa418")}
                value={filter.kind}
                onChange={(e) => setFilter({ ...filter, kind: e.target.value as GlobalKind | "all" })}
                data-testid="global-filter-kind"
              >
                <option value="all">{t("app-global-global-library-dialog.global-library-dialog.option.162186c63bf5")}</option>
                {GLOBAL_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {GLOBAL_KIND_LABEL[k]}
                  </option>
                ))}
              </select>
              {facets.categories.length ? (
                <select
                  className={select}
                  aria-label={t("app-global-global-library-dialog.global-library-dialog.aria-label.12df3f2d1b6b")}
                  value={filter.category ?? ""}
                  onChange={(e) => setFilter({ ...filter, category: e.target.value || null })}
                >
                  <option value="">{t("app-global-global-library-dialog.global-library-dialog.option.c6b0a80e85bf")}</option>
                  {facets.categories.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              ) : null}
              {facets.tags.length ? (
                <select
                  className={select}
                  aria-label={t("app-global-global-library-dialog.global-library-dialog.aria-label.ab5260a2eb61")}
                  value={filter.tag ?? ""}
                  onChange={(e) => setFilter({ ...filter, tag: e.target.value || null })}
                  data-testid="global-filter-tag"
                >
                  <option value="">{t("app-global-global-library-dialog.global-library-dialog.option.d6017618f2d9")}</option>
                  {facets.tags.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              ) : null}
              <label className="flex items-center gap-1 text-xs text-text-secondary">
                <input
                  type="checkbox"
                  checked={filter.includeArchived}
                  onChange={(e) => setFilter({ ...filter, includeArchived: e.target.checked })}
                />
                {t("app-global-global-library-dialog.global-library-dialog.label.25aa4c5a32c6")}
              </label>
            </div>

            <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] gap-3">
              <ul className="flex flex-col gap-1" data-testid="global-list">
                {list.map((a) => {
                  const b = all.find((x) => x.asset.id === a.id)!;
                  const latest = latestGlobalVersions(b.versions);
                  const first = b.variants.find((v) => !v.archived);
                  const v = first ? latest.get(first.id) : undefined;
                  const inProject = !!linkedProjectAsset(state, a.id);
                  return (
                    <li key={a.id}>
                      <button
                        type="button"
                        data-global-asset={a.id}
                        onClick={() => setSelected(a.id)}
                        className={`flex w-full items-center gap-2 rounded-sm border p-2 text-left text-[13px] ${
                          selected === a.id ? "border-accent-brand bg-surface-2" : "border-border bg-surface-1"
                        }`}
                      >
                        {v?.mimeType.startsWith("image/") && urls.data?.[v.storageKey] ? (
                          <Thumbnail src={urls.data[v.storageKey]} alt="" className="size-10 rounded-sm" />
                        ) : (
                          <span className="size-10 rounded-sm bg-surface-3" aria-hidden />
                        )}
                        <span className="flex min-w-0 flex-col">
                          <span className="truncate text-text-primary">{a.name}</span>
                          <span className="text-xs text-text-tertiary">
                            {GLOBAL_KIND_LABEL[a.kind]}
                            {a.archived ? ` · ${t("app-global-global-library-dialog.global-library-dialog.span.cbe825799eed")}` : ""}
                            {inProject ? ` · ${t("app-global-global-library-dialog.global-library-dialog.span.90a6a1b93385")}` : ""}
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
                {bundles.isSuccess && !list.length ? (
                  <li className="text-xs text-text-tertiary" data-testid="global-empty">
                    {t("app-global-global-library-dialog.global-library-dialog.li.843f4e50752a")}
                  </li>
                ) : null}
              </ul>

              <div className="flex flex-col gap-3">
                {current ? (
                  <section className="flex flex-col gap-2 rounded-md border border-border p-3" data-testid="global-detail">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="text-sm font-semibold text-text-primary">{current.asset.name}</h3>
                      <span className="text-xs text-text-tertiary">{GLOBAL_KIND_LABEL[current.asset.kind]}</span>
                    </div>
                    {current.asset.description ? (
                      <p className="text-xs text-text-secondary">{current.asset.description}</p>
                    ) : null}
                    {current.asset.tags.length || current.asset.categories.length ? (
                      <p className="text-xs text-text-tertiary">
                        {[...current.asset.categories, ...current.asset.tags].join(" · ")}
                      </p>
                    ) : null}
                    {current.variants.map((va) => {
                      const vs = current.versions.filter((x) => x.variantId === va.id);
                      return (
                        <div key={va.id} className="flex flex-col gap-1" data-global-variant={va.id}>
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-medium text-text-primary">
                              {va.name} {va.archived ? `(${t("app-global-global-library-dialog.global-library-dialog.span.cbe825799eed.2")})` : ""}
                            </span>
                            {ws.rights.publish && !current.asset.archived ? (
                              <Button
                                size="sm"
                                variant="ghost"
                                disabled={busy}
                                data-testid={`global-new-version-${va.id}`}
                                onClick={() => {
                                  setVersionTarget(va.id);
                                  versionFile.current?.click();
                                }}
                              >
                                {vs.length ? t("app-global-global-library-dialog.global-library-dialog.button.5c638abac4ad") : t("app-global-global-library-dialog.global-library-dialog.button.a64706d4c220")}
                              </Button>
                            ) : null}
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {vs.map((v) => (
                              <figure key={v.id} className="flex flex-col items-start gap-1" data-global-version={v.id}>
                                <Preview v={v} url={urls.data?.[v.storageKey]} />
                                <figcaption className="text-[11px] text-text-tertiary">
                                  v{v.number}
                                  {v.withdrawn ? <span data-testid={`global-withdrawn-${v.id}`}> · {t("r3-global.withdrawn-label")}</span> : null}
                                </figcaption>
                              </figure>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                    <div className="text-xs text-text-secondary" data-testid="global-used-in">
                      {t("app-global-global-library-dialog.global-library-dialog.div.dcd3b1266f5e")}{" "}
                      {usedIn.data?.length
                        ? usedIn.data.map((p) => p.name).join(", ")
                        : t("app-global-global-library-dialog.global-library-dialog.div.c20f5e13b260")}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {editable && !current.asset.archived ? (
                        <Button
                          size="sm"
                          disabled={busy}
                          onClick={() => void use(current)}
                          data-testid="global-use-in-project"
                        >
                          {linkedProjectAsset(state, current.asset.id)
                            ? t("app-global-global-library-dialog.global-library-dialog.button.997ea58ee386")
                            : t("app-global-global-library-dialog.global-library-dialog.button.9500da253b32")}
                        </Button>
                      ) : null}
                      {ws.rights.archive ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={busy}
                          data-testid="global-archive"
                          onClick={() =>
                            void act(async () => {
                              await setGlobalAssetArchived(current.asset.id, !current.asset.archived);
                              refresh();
                              return null;
                            })
                          }
                          title={t("app-global-global-library-dialog.global-library-dialog.title.10ac6c847d34")}
                        >
                          {current.asset.archived ? t("app-global-global-library-dialog.global-library-dialog.button.c8d7f62abff0") : t("app-global-global-library-dialog.global-library-dialog.button.80efebfb6ceb")}
                        </Button>
                      ) : null}
                    </div>
                  </section>
                ) : (
                  <p className="text-xs text-text-tertiary">
                    {t("app-global-global-library-dialog.global-library-dialog.p.b130b57448e3")}
                  </p>
                )}

                {ws.rights.publish ? (
                  <section className="flex flex-col gap-2 rounded-md border border-border p-3" data-testid="global-create">
                    <h3 className="text-xs font-semibold text-text-primary">
                      {t("app-global-global-library-dialog.global-library-dialog.h3.2dee9180574d")}
                    </h3>
                    <div className="flex gap-2">
                      <select
                        className={select}
                        aria-label={t("app-global-global-library-dialog.global-library-dialog.aria-label.faa62b3aa418.2")}
                        value={newKind}
                        disabled={!!fixedKind}
                        onChange={(e) => setNewKind(e.target.value as GlobalKind)}
                        data-testid="global-create-kind"
                      >
                        {GLOBAL_KINDS.map((k) => (
                          <option key={k} value={k}>
                            {GLOBAL_KIND_LABEL[k]}
                          </option>
                        ))}
                      </select>
                      <input
                        className={input}
                        placeholder={t("app-global-global-library-dialog.global-library-dialog.placeholder.9e935e59aa41")}
                        aria-label={t("app-global-global-library-dialog.global-library-dialog.aria-label.9e935e59aa41")}
                        value={newName}
                        maxLength={200}
                        onChange={(e) => setNewName(e.target.value)}
                        data-testid="global-create-name"
                      />
                    </div>
                    <input
                      className={input}
                      placeholder={t("app-global-global-library-dialog.global-library-dialog.placeholder.7bab8b693b9c")}
                      aria-label={t("app-global-global-library-dialog.global-library-dialog.aria-label.edd45b597b9a")}
                      value={newTags}
                      onChange={(e) => setNewTags(e.target.value)}
                      data-testid="global-create-tags"
                    />
                    <input
                      ref={newFile}
                      type="file"
                      accept="image/*,audio/*,video/*"
                      aria-label={t("app-global-global-library-dialog.global-library-dialog.aria-label.6fff7b5d855c")}
                      className="text-xs text-text-secondary"
                      data-testid="global-create-file"
                    />
                    <div>
                      <Button size="sm" disabled={busy || !newName.trim()} onClick={() => void create()} data-testid="global-create-submit">
                        {t("app-global-global-library-dialog.global-library-dialog.button.e58cede1bdf5")}
                      </Button>
                    </div>
                  </section>
                ) : null}
              </div>
            </div>
            <input
              ref={versionFile}
              type="file"
              accept="image/*,audio/*,video/*"
              className="hidden"
              aria-hidden
              tabIndex={-1}
              data-testid="global-version-file"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (!file || !current || !versionTarget || !ws.workspaceId) return;
                void act(async () => {
                  await uploadGlobalVersion(ws.workspaceId!, current.asset.id, versionTarget, file);
                  refresh();
                  return t("app-global-global-library-dialog.global-library-dialog.act.980bc9268e45");
                });
              }}
            />
          </div>
        )}
        {msg ? (
          <p role={msg.ok ? "status" : "alert"} className={`text-xs ${msg.ok ? "text-text-secondary" : "text-status-danger"}`} data-testid="global-message">
            {msg.text}
          </p>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
