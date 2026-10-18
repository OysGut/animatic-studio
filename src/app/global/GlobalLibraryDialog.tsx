/**
 * Det globale ressursbiblioteket (GP2, spes. §2–16, G1–G10), åpnet fra prosjektets bibliotek: søk og filter,
 * forhåndsvisning (bilde, lyd og video), varianter, «Brukt i prosjekter», «Bruk i prosjekt» og varselet
 * «Ny versjon finnes – oppdater?». Redaktører kan legge til ressurser, varianter og versjoner; eieren kan
 * arkivere. Ingenting i prosjektet endres automatisk (§9).
 */
import { Link } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  EMPTY_GLOBAL_FILTER,
  GLOBAL_KINDS,
  GLOBAL_KIND_LABEL,
  L,
  cleanLabels,
  filterGlobalAssets,
  globalFacets,
  globalUpdates,
  latestGlobalVersions,
  linkedProjectAsset,
  tm,
  type GlobalAssetBundle,
  type GlobalFilter,
  type GlobalKind,
  type GlobalVersion,
  type ProjectState,
} from "@/core";
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

const input =
  "h-8 w-full rounded-sm border border-border-control bg-surface-3 px-2 text-[13px] text-text-primary";
const select =
  "h-8 rounded-sm border border-border-control bg-surface-3 px-2 text-[13px] text-text-primary";

function Preview({ v, url }: { v: GlobalVersion; url: string | undefined }) {
  if (!url) return <div className="size-16 rounded-sm bg-surface-3" aria-hidden />;
  if (v.mimeType.startsWith("image/"))
    return <img src={url} alt="" className="max-h-32 max-w-[12rem] rounded-sm object-contain" />;
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
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  state: ProjectState;
  cmds: Commands;
  editable: boolean;
  onUsed?: (assetId: string) => void;
}) {
  const qc = useQueryClient();
  const ws = useProjectWorkspace(state.project.id);
  const bundles = useGlobalBundles(ws.workspaceId, open && ws.ready && ws.rights.use);
  const [filter, setFilter] = useState<GlobalFilter>(EMPTY_GLOBAL_FILTER);
  const [selected, setSelected] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [newKind, setNewKind] = useState<GlobalKind>("logo");
  const [newName, setNewName] = useState("");
  const [newTags, setNewTags] = useState("");
  const newFile = useRef<HTMLInputElement>(null);
  const versionFile = useRef<HTMLInputElement>(null);
  const [versionTarget, setVersionTarget] = useState<string | null>(null);

  const all = bundles.data ?? [];
  const list = useMemo(() => filterGlobalAssets(all.map((b) => b.asset), filter), [all, filter]);
  const facets = useMemo(() => globalFacets(all.map((b) => b.asset)), [all]);
  const updates = useMemo(() => globalUpdates(state, all), [state, all]);
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
        ? L("Ressursen fantes i prosjektet og er gjenbrukt.", "The asset was already in the project and has been reused.")
        : L("Lagt til i prosjektet.", "Added to the project.");
    });
  }

  async function create() {
    const file = newFile.current?.files?.[0];
    if (!ws.workspaceId || !newName.trim() || !file) return;
    await act(async () => {
      const id = await createGlobalAsset(ws.workspaceId!, {
        kind: newKind,
        name: newName.trim(),
        description: "",
        categories: [],
        tags: cleanLabels(newTags.split(",")),
      });
      const variant = await createGlobalVariant(id, {
        name: L("Standard", "Standard"),
        style: "reference",
        appearance: "",
      });
      await uploadGlobalVersion(ws.workspaceId!, id, variant, file);
      setNewName("");
      setNewTags("");
      if (newFile.current) newFile.current.value = "";
      refresh();
      setSelected(id);
      return L("Den globale ressursen er laget.", "The global asset has been created.");
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl" data-testid="global-library-dialog">
        <DialogHeader>
          <DialogTitle>{L("Globalt bibliotek", "Global library")}</DialogTitle>
          <DialogDescription>
            {ws.workspaceName
              ? L(
                  `Ressurser som deles i arbeidsgruppen «${ws.workspaceName}». Det som hentes inn, blir en kopi i prosjektet; nye globale versjoner tas aldri inn av seg selv.`,
                  `Assets shared in the workspace “${ws.workspaceName}”. What you bring in becomes a copy in the project; new global versions are never brought in by themselves.`,
                )
              : L("Ressurser som deles i en arbeidsgruppe.", "Assets shared in a workspace.")}
          </DialogDescription>
        </DialogHeader>

        {!ws.ready ? (
          <p className="text-[13px] text-text-secondary">
            {L("Det globale biblioteket krever en nyere databaseversjon.", "The global library requires a newer database version.")}
          </p>
        ) : ws.loaded && !ws.workspaceId ? (
          <p className="text-[13px] text-text-secondary" data-testid="global-no-workspace">
            {L(
              "Prosjektet er ikke koblet til en arbeidsgruppe. Prosjektets eier kan koble det på gruppesiden under ",
              "The project is not linked to a workspace. The project owner can link it on the workspace page under ",
            )}
            <Link to="/konto" className="text-accent-brand underline-offset-2 hover:underline">
              {L("Min konto", "My account")}
            </Link>
            .
          </p>
        ) : ws.loaded && !ws.rights.use ? (
          <p className="text-[13px] text-text-secondary" role="alert" data-testid="global-no-access">
            {L(
              "Du er ikke medlem av arbeidsgruppen prosjektet er koblet til.",
              "You are not a member of the workspace the project is linked to.",
            )}
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
                        {L(
                          `Ny versjon finnes – oppdater? «${b.asset.name}» (${variant?.name ?? ""}): v${u.usedNumber} → v${u.newer.number}`,
                          `A new version exists – update? “${b.asset.name}” (${variant?.name ?? ""}): v${u.usedNumber} → v${u.newer.number}`,
                        )}
                      </span>
                      {editable ? (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busy}
                          data-testid={`global-update-${u.globalVariantId}`}
                          onClick={() => void use(b, [u.newer])}
                          title={L(
                            "Legger den nye versjonen til i prosjektet. Den godkjente versjonen og scenene endres ikke før du velger det.",
                            "Adds the new version to the project. The approved version and the scenes do not change until you choose so.",
                          )}
                        >
                          {L("Hent den nye versjonen", "Get the new version")}
                        </Button>
                      ) : null}
                    </div>
                  );
                })}
              </section>
            ) : null}

            <div className="flex flex-wrap gap-2">
              <input
                className={`${input} max-w-xs`}
                placeholder={L("Søk etter navn, merke, kategori …", "Search by name, tag, category …")}
                aria-label={L("Søk", "Search")}
                value={filter.query}
                onChange={(e) => setFilter({ ...filter, query: e.target.value })}
                data-testid="global-search"
              />
              <select
                className={select}
                aria-label={L("Type", "Type")}
                value={filter.kind}
                onChange={(e) => setFilter({ ...filter, kind: e.target.value as GlobalKind | "all" })}
                data-testid="global-filter-kind"
              >
                <option value="all">{L("Alle typer", "All types")}</option>
                {GLOBAL_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {GLOBAL_KIND_LABEL[k]}
                  </option>
                ))}
              </select>
              {facets.categories.length ? (
                <select
                  className={select}
                  aria-label={L("Kategori", "Category")}
                  value={filter.category ?? ""}
                  onChange={(e) => setFilter({ ...filter, category: e.target.value || null })}
                >
                  <option value="">{L("Alle kategorier", "All categories")}</option>
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
                  aria-label={L("Merke", "Tag")}
                  value={filter.tag ?? ""}
                  onChange={(e) => setFilter({ ...filter, tag: e.target.value || null })}
                  data-testid="global-filter-tag"
                >
                  <option value="">{L("Alle merker", "All tags")}</option>
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
                {L("Vis arkiverte", "Show archived")}
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
                          <img src={urls.data[v.storageKey]} alt="" className="size-10 rounded-sm object-contain" />
                        ) : (
                          <span className="size-10 rounded-sm bg-surface-3" aria-hidden />
                        )}
                        <span className="flex min-w-0 flex-col">
                          <span className="truncate text-text-primary">{a.name}</span>
                          <span className="text-xs text-text-tertiary">
                            {GLOBAL_KIND_LABEL[a.kind]}
                            {a.archived ? ` · ${L("arkivert", "archived")}` : ""}
                            {inProject ? ` · ${L("i prosjektet", "in the project")}` : ""}
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
                {bundles.isSuccess && !list.length ? (
                  <li className="text-xs text-text-tertiary" data-testid="global-empty">
                    {L("Ingen treff.", "No matches.")}
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
                              {va.name} {va.archived ? `(${L("arkivert", "archived")})` : ""}
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
                                {L("Ny versjon …", "New version …")}
                              </Button>
                            ) : null}
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {vs.map((v) => (
                              <figure key={v.id} className="flex flex-col items-start gap-1" data-global-version={v.id}>
                                <Preview v={v} url={urls.data?.[v.storageKey]} />
                                <figcaption className="text-[11px] text-text-tertiary">v{v.number}</figcaption>
                              </figure>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                    <div className="text-xs text-text-secondary" data-testid="global-used-in">
                      {L("Brukt i prosjekter:", "Used in projects:")}{" "}
                      {usedIn.data?.length
                        ? usedIn.data.map((p) => p.name).join(", ")
                        : L("ingen du har tilgang til", "none you have access to")}
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
                            ? L("Hent manglende varianter", "Get missing variants")
                            : L("Bruk i prosjekt", "Use in project")}
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
                          title={L(
                            "Skjuler ressursen i det globale biblioteket. Prosjektene beholder sine kopier.",
                            "Hides the asset in the global library. The projects keep their copies.",
                          )}
                        >
                          {current.asset.archived ? L("Hent fram", "Restore") : L("Arkiver", "Archive")}
                        </Button>
                      ) : null}
                    </div>
                  </section>
                ) : (
                  <p className="text-xs text-text-tertiary">
                    {L("Velg en ressurs for å se den.", "Choose an asset to see it.")}
                  </p>
                )}

                {ws.rights.publish ? (
                  <section className="flex flex-col gap-2 rounded-md border border-border p-3" data-testid="global-create">
                    <h3 className="text-xs font-semibold text-text-primary">
                      {L("Ny global ressurs", "New global asset")}
                    </h3>
                    <div className="flex gap-2">
                      <select
                        className={select}
                        aria-label={L("Type", "Type")}
                        value={newKind}
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
                        placeholder={L("Navn", "Name")}
                        aria-label={L("Navn", "Name")}
                        value={newName}
                        maxLength={200}
                        onChange={(e) => setNewName(e.target.value)}
                        data-testid="global-create-name"
                      />
                    </div>
                    <input
                      className={input}
                      placeholder={L("Merker, skilt med komma", "Tags, separated by commas")}
                      aria-label={L("Merker", "Tags")}
                      value={newTags}
                      onChange={(e) => setNewTags(e.target.value)}
                      data-testid="global-create-tags"
                    />
                    <input
                      ref={newFile}
                      type="file"
                      accept="image/*,audio/*,video/*"
                      aria-label={L("Fil", "File")}
                      className="text-xs text-text-secondary"
                      data-testid="global-create-file"
                    />
                    <div>
                      <Button size="sm" disabled={busy || !newName.trim()} onClick={() => void create()} data-testid="global-create-submit">
                        {L("Legg til i det globale biblioteket", "Add to the global library")}
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
                  return L(
                    "Ny versjon publisert. Prosjektene som bruker ressursen, får et varsel og velger selv.",
                    "New version published. Projects using the asset get a notice and choose for themselves.",
                  );
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
