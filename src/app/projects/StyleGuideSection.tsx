/**
 * «Filmens visuelle stil» på prosjektoversikten (DEC-0065, REQ-0147, REQ-0589): det AI-en må vite om
 * filmen – handling, verden, stil, teknikk, farger, lys, stemning, regler for figurer og omgivelser, hva som
 * skal unngås og forbildebilder. Brukes i alle bildebeskrivelser. Utkastet kan foreslås fra prosjektet, og
 * forhåndsvisningen viser hvordan en beskrivelse blir.
 */
import { useMemo, useState } from "react";
import { ClipboardList, Palette, Plus, Trash2 } from "lucide-react";
import { AiGlyph } from "@/app/design/icons/AiGlyph";
import {
  STYLE_USES,
  STYLE_USE_LABEL,
  type StyleUse,
  STYLE_FIELD_LIMIT,
  STYLE_TOTAL_LIMIT,
  styleGuideLength,
  buildContextImagePrompt,
  defaultStyleProfile,
  emptyStyleGuide,
  newId,
  sortedAssets,
  suggestStyleGuide,
  versionsOf,
  type ProjectState,
  type StyleGuide,
  type StyleTextField,
} from "@/core";
import { useCommands, type Commands } from "@/app/project/use-commands";
import { useImageUrls } from "@/app/library/asset-images";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const FIELDS: readonly { key: StyleTextField; label: string; hint: string; rows?: number }[] = [
  {
    key: "premise",
    label: "Hva filmen handler om",
    hint: "A ten-year-old girl spends Christmas with her grandmother on a farm in Dovre and discovers that the farm's nisse is real.",
    rows: 3,
  },
  {
    key: "world",
    label: "Verden: sted, tid og årstid",
    hint: "A small mountain farm in Dovre, Norway, around 1950. Deep snow, short winter days, wooden houses with turf roofs.",
    rows: 3,
  },
  {
    key: "audience",
    label: "Publikum og tone",
    hint: "Family film for children 6–10; warm, gentle, a little spooky.",
  },
  {
    key: "visualStyle",
    label: "Visuell stil",
    hint: "Hand-painted 2D animation inspired by Norwegian folk-tale illustration; simple, readable shapes.",
    rows: 2,
  },
  {
    key: "technique",
    label: "Teknikk og materialer",
    hint: "Watercolour and gouache on textured paper, soft edges, visible brush strokes, limited detail.",
    rows: 2,
  },
  {
    key: "lighting",
    label: "Lys",
    hint: "Low winter sun by day; candles, oil lamps and fireplaces indoors; cold blue moonlight outside at night.",
    rows: 2,
  },
  {
    key: "mood",
    label: "Stemning og følelse",
    hint: "Cosy and safe indoors, mysterious and vast outdoors.",
  },
  {
    key: "characterDesign",
    label: "Figurer",
    hint: "Round, soft shapes; large expressive eyes; simple faces; clothes in wool and knitted patterns.",
    rows: 2,
  },
  {
    key: "environmentDesign",
    label: "Omgivelser og bakgrunner",
    hint: "Old timber buildings, uneven floorboards, rag rugs; landscapes with soft snowdrifts and dark spruce forest.",
    rows: 2,
  },
  {
    key: "composition",
    label: "Bildeutsnitt og kameraspråk",
    hint: "Mostly eye-level at a child's height; wide shots to show how small Maja is in the landscape.",
    rows: 2,
  },
  {
    key: "avoid",
    label: "Unngå",
    hint: "Photorealism, 3D rendering, anime style, modern objects, text, logos, watermarks.",
    rows: 2,
  },
  {
    key: "instructions",
    label: "Egne instrukser til AI-en",
    hint: "Anything else the AI should always follow in this project.",
    rows: 2,
  },
];

const HEX = /^#[0-9a-f]{6}$/i;

export function StyleGuideSection({
  state,
  projectId,
  userId,
  editable,
}: {
  state: ProjectState;
  projectId: string;
  userId: string;
  editable: boolean;
}) {
  const cmds = useCommands(projectId, userId, editable);
  // null = lukket; "default" = standardprofilen; "new" = ny profil; ellers profilens id (DEC-0071)
  const [open, setOpenId] = useState<string | null>(null);
  const setOpen = (v: boolean) => setOpenId(v ? "default" : null);
  const profile = defaultStyleProfile(state);
  const others = Object.values(state.styleProfiles)
    .filter((p) => !p.removed && p.id !== profile?.id)
    .sort((a, b) => a.name.localeCompare(b.name, "nb"));
  const g = profile?.guide;
  const filled = g ? FIELDS.filter((f) => g[f.key].trim()).length : 0;
  return (
    <section aria-labelledby="style-title" className="mt-10">
      <div className="mb-2 flex items-center gap-2">
        <h2 id="style-title" className="text-base font-semibold text-text-primary">
          Filmens visuelle stil
        </h2>
        <span className="text-xs text-text-tertiary">brukes i alle AI-beskrivelser</span>
        <Button size="sm" variant="secondary" className="ml-auto" onClick={() => setOpen(true)}>
          <Palette />
          {editable ? (profile ? "Rediger …" : "Lag …") : "Vis …"}
        </Button>
      </div>
      <div className="border border-border bg-surface-1 px-4 py-3 text-[13px] text-text-secondary">
        {g && filled ? (
          <>
            <p className="text-text-primary">{g.premise || g.visualStyle || g.world}</p>
            <p className="mt-1 text-xs text-text-tertiary">
              {filled} av {FIELDS.length} felt fylt ut · {g.referenceVersionIds.length}{" "}
              forbildebilder
              {g.palette.colors.length ? " · " : ""}
              {g.palette.colors.map((c) => (
                <span
                  key={c}
                  aria-hidden
                  className="mx-0.5 inline-block size-2.5 rounded-full align-middle"
                  style={{ background: c }}
                />
              ))}
            </p>
          </>
        ) : (
          <p>
            Ikke fylt ut. En bildemodell vet ingenting om filmen – her beskriver dere hva den
            handler om, stil, teknikk, farger, lys og stemning, så alle bilder AI lager, passer inn.
          </p>
        )}
      </div>
      {/* Egne stilprofiler for bestemte bruk (REQ-0148, DEC-0071) */}
      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-text-secondary">
        {others.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => setOpenId(p.id)}
            className="rounded-sm border border-border bg-surface-1 px-2 py-1 text-left hover:bg-surface-2"
            title="Åpne stilprofilen"
          >
            <span className="text-text-primary">{p.name}</span>
            <span className="text-text-tertiary">
              {" "}
              ·{" "}
              {(p.appliesTo ?? []).length
                ? (p.appliesTo ?? []).map((u) => STYLE_USE_LABEL[u]).join(", ")
                : "ikke i bruk"}
            </span>
          </button>
        ))}
        {editable && profile ? (
          <Button size="sm" variant="ghost" onClick={() => setOpenId("new")}>
            <Plus /> Egen stil for plakater, steder, AI-video …
          </Button>
        ) : null}
      </div>
      {open ? (
        <StyleGuideDialog
          state={state}
          cmds={cmds}
          editable={editable}
          profileId={open === "default" ? null : open}
          onClose={() => setOpenId(null)}
        />
      ) : null}
    </section>
  );
}

function StyleGuideDialog({
  state,
  cmds,
  editable,
  profileId,
  onClose,
}: {
  state: ProjectState;
  cmds: Commands;
  editable: boolean;
  /** null = standardprofilen; «new» = ny egen profil; ellers profilens id. */
  profileId: string | null;
  onClose: () => void;
}) {
  const isNew = profileId === "new";
  const base = defaultStyleProfile(state);
  const profile = isNew ? null : profileId ? (state.styleProfiles[profileId] ?? null) : base;
  const own = isNew || (profile !== null && !profile.isDefault);
  const [name, setName] = useState(() => (isNew ? "" : (profile?.name ?? "")));
  const [uses, setUses] = useState<readonly StyleUse[]>(() => profile?.appliesTo ?? []);
  const taken = (u: StyleUse) =>
    Object.values(state.styleProfiles).find(
      (x) => !x.removed && x.id !== profile?.id && (x.appliesTo ?? []).includes(u),
    );
  const main = Object.values(state.productions).find((p) => p.kind === "main");
  // En ny egen profil starter som en kopi av standardprofilen
  const [draft, setDraft] = useState<StyleGuide>(
    () => profile?.guide ?? (isNew ? base?.guide : undefined) ?? emptyStyleGuide(),
  );
  // Revisjonen da dialogen ble åpnet: har noen andre lagret i mellomtiden, overskrives det ikke i stillhet
  const [openedRevision] = useState(() => profile?.revision ?? 0);
  const total = styleGuideLength(draft);
  const [colorText, setColorText] = useState(draft.palette.colors.join(" "));
  const [error, setError] = useState<string | null>(null);
  const [previewAsset, setPreviewAsset] = useState<string>(
    () => sortedAssets(state).find((a) => a.kind === "character" && !a.archived)?.id ?? "",
  );
  const ro = !editable;
  const set = (k: StyleTextField, v: string) => setDraft((d) => ({ ...d, [k]: v }));

  // Godkjente bilder (og forsidebilder) som kan velges som forbilder
  const candidates = useMemo(
    () =>
      Object.values(state.assetVariants)
        .filter(
          (v) =>
            !v.archived && state.assets[v.assetId] && state.assets[v.assetId]!.kind !== "sound",
        )
        .flatMap((v) => {
          const ver = v.approvedVersionId
            ? state.assetVersions[v.approvedVersionId]
            : versionsOf(state, v.id)[0];
          return ver
            ? [
                {
                  version: ver,
                  label: `${state.assets[v.assetId]!.name} – ${v.name} v${ver.number}`,
                },
              ]
            : [];
        })
        .sort((a, b) => a.label.localeCompare(b.label, "nb")),
    [state],
  );
  const urls = useImageUrls(candidates.map((c) => c.version.mediaPath)).data ?? {};

  // Forhåndsvisning av en beskrivelse med utkastet
  const preview = useMemo(() => {
    if (!previewAsset || !main) return "";
    const pid = profile?.id ?? "preview";
    const sim: ProjectState = {
      ...state,
      // Bare utkastet, så forhåndsvisningen viser akkurat denne profilen
      styleProfiles: {
        [pid]: {
          id: pid as never,
          revision: 1,
          name: "Utkast",
          isDefault: true,
          guide: draft,
          removed: false,
        },
      },
    };
    const va = Object.values(state.assetVariants).find(
      (v) => v.assetId === previewAsset && !v.archived,
    );
    return buildContextImagePrompt(sim, {
      assetId: previewAsset,
      variantId: va?.id ?? null,
      productionId: main.id,
      occurrenceId: null,
      withReference: false,
    });
  }, [previewAsset, main, profile?.id, state, draft]);

  function suggest() {
    if (!main) return;
    const s = suggestStyleGuide(state, main.id);
    // Fyller bare tomme felt – det dere har skrevet, står
    const next: Record<string, unknown> = { ...draft };
    for (const f of FIELDS) if (!draft[f.key].trim() && s[f.key].trim()) next[f.key] = s[f.key];
    const keepPalette = draft.palette.colors.length > 0 || !!draft.palette.description.trim();
    const palette = keepPalette ? draft.palette : s.palette;
    if (!keepPalette && !colorText.trim()) setColorText(palette.colors.join(" "));
    setDraft({
      ...(next as unknown as StyleGuide),
      palette,
      referenceVersionIds: draft.referenceVersionIds.length
        ? draft.referenceVersionIds
        : s.referenceVersionIds,
    });
  }

  function save() {
    const colors = colorText.split(/[\s,;]+/).filter(Boolean);
    const bad = colors.find((c) => !HEX.test(c));
    if (bad) return setError(`«${bad}» er ikke en farge på formen #rrggbb.`);
    const guide: StyleGuide = { ...draft, palette: { ...draft.palette, colors } };
    if ((profile?.revision ?? 0) !== openedRevision)
      return setError(
        "Noen andre har endret filmens visuelle stil mens du skrev. Kopier det du har skrevet, lukk og åpne på nytt.",
      );
    if (own && !name.trim()) return setError("Gi stilprofilen et navn.");
    const group = newId();
    const id = profile?.id ?? newId<"style_profile">();
    let err = profile
      ? cmds.run(
          {
            type: "UpdateStyleProfile",
            profileId: profile.id,
            fields: { name: own ? name.trim() : profile.name, isDefault: profile.isDefault, guide },
          },
          own ? `Endre stilprofilen «${name.trim()}»` : "Endre filmens visuelle stil",
          group,
        )
      : cmds.run(
          {
            type: "CreateStyleProfile",
            profileId: id as never,
            fields: own
              ? { name: name.trim(), isDefault: false, guide }
              : { name: "Filmens visuelle stil", isDefault: true, guide },
          },
          own ? `Ny stilprofil «${name.trim()}»` : "Lag filmens visuelle stil",
          group,
        );
    const before = profile?.appliesTo ?? [];
    if (!err && own && (before.length !== uses.length || before.some((u) => !uses.includes(u))))
      err = cmds.run(
        { type: "SetStyleAppliesTo", profileId: id as never, appliesTo: uses },
        "Hva stilprofilen gjelder for",
        group,
      );
    setError(err);
    if (!err) onClose();
  }

  function remove() {
    if (!profile || profile.isDefault) return;
    const err = cmds.run(
      { type: "SetStyleProfileRemoved", profileId: profile.id, removed: true },
      `Fjern stilprofilen «${profile.name}»`,
    );
    setError(err);
    if (!err) onClose();
  }

  const area =
    "w-full rounded-sm border border-border-control bg-surface-3 px-2 py-1.5 text-[13px] text-text-primary placeholder:text-text-tertiary disabled:opacity-70";
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-5xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {own
              ? isNew
                ? "Ny stilprofil"
                : `Stilprofil: ${profile?.name}`
              : "Filmens visuelle stil"}
          </DialogTitle>
          <DialogDescription>
            Dette sendes med i alle bildebeskrivelser, sammen med det programmet vet om scenene
            (sted, tid på døgnet, lys, hvem som er der) og godkjente bilder. Skriv helst på engelsk
            – beskrivelsene som sendes, er på engelsk. Eksemplene i feltene viser hva som passer.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
          <div className="flex flex-col gap-3">
            {editable ? (
              <Button
                size="sm"
                variant="ghost"
                className="self-start"
                onClick={suggest}
                disabled={!main}
              >
                <ClipboardList />
                Foreslå utkast fra prosjektet (fyller bare tomme felt)
              </Button>
            ) : null}
            <p
              className={
                "text-[11px] " +
                (total > STYLE_TOTAL_LIMIT ? "text-status-danger" : "text-text-tertiary")
              }
            >
              {total} av {STYLE_TOTAL_LIMIT} tegn til sammen (resten av beskrivelsen – bildet og
              scenene – må også få plass).
            </p>
            {own ? (
              <fieldset className="flex flex-col gap-2 rounded-sm border border-border bg-surface-1 p-2 text-xs text-text-secondary">
                <label className="flex flex-col gap-1">
                  Navn
                  <input
                    value={name}
                    maxLength={120}
                    disabled={ro}
                    placeholder="F.eks. Plakatstil, Nattscener"
                    onChange={(e) => setName(e.target.value)}
                    className={area}
                  />
                </label>
                <legend className="sr-only">Gjelder for</legend>
                <p>Gjelder for (resten bruker filmens visuelle stil):</p>
                <div className="flex flex-wrap gap-x-3 gap-y-1">
                  {STYLE_USES.map((u) => {
                    const t = taken(u);
                    return (
                      <label
                        key={u}
                        className="flex items-center gap-1"
                        title={t ? `Brukes av «${t.name}»` : undefined}
                      >
                        <input
                          type="checkbox"
                          checked={uses.includes(u)}
                          disabled={ro || !!t}
                          onChange={(e) =>
                            setUses((cur) =>
                              e.target.checked ? [...cur, u] : cur.filter((x) => x !== u),
                            )
                          }
                        />
                        {STYLE_USE_LABEL[u]}
                        {t ? <span className="text-text-tertiary"> ({t.name})</span> : null}
                      </label>
                    );
                  })}
                </div>
              </fieldset>
            ) : null}
            {FIELDS.map((f) => (
              <label key={f.key} className="flex flex-col gap-1 text-xs text-text-secondary">
                {f.label}
                <textarea
                  value={draft[f.key]}
                  placeholder={f.hint}
                  rows={f.rows ?? 1}
                  maxLength={STYLE_FIELD_LIMIT}
                  disabled={ro}
                  onChange={(e) => set(f.key, e.target.value)}
                  className={area}
                />
              </label>
            ))}
            <fieldset className="flex flex-col gap-1 text-xs text-text-secondary">
              <legend className="mb-1">Fargepalett</legend>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  aria-label="Farger (#rrggbb, skilt med mellomrom)"
                  value={colorText}
                  placeholder="#0d1b2a #f4efe6 #d9a441"
                  disabled={ro}
                  onChange={(e) => setColorText(e.target.value)}
                  className={`${area} max-w-sm font-mono`}
                />
                {colorText
                  .split(/[\s,;]+/)
                  .filter((c) => HEX.test(c))
                  .map((c) => (
                    <span
                      key={c}
                      aria-hidden
                      className="size-5 rounded-sm border border-border"
                      style={{ background: c }}
                    />
                  ))}
              </div>
              <textarea
                aria-label="Beskrivelse av fargene"
                value={draft.palette.description}
                placeholder="Muted winter blues and whites, warm amber and red accents from lamps and wool."
                rows={2}
                maxLength={STYLE_FIELD_LIMIT}
                disabled={ro}
                onChange={(e) =>
                  setDraft((d) => ({
                    ...d,
                    palette: { ...d.palette, description: e.target.value },
                  }))
                }
                className={area}
              />
            </fieldset>
            <fieldset className="flex flex-col gap-1 text-xs text-text-secondary">
              <legend className="mb-1">
                Forbildebilder ({draft.referenceVersionIds.length} valgt, høyst 6) – bilder som
                viser stilen
              </legend>
              {candidates.length === 0 ? (
                <p className="text-text-tertiary">Ingen bilder i biblioteket ennå.</p>
              ) : (
                <ul className="flex flex-wrap gap-2">
                  {candidates.map((c) => {
                    const on = draft.referenceVersionIds.includes(c.version.id);
                    const url = urls[c.version.mediaPath];
                    return (
                      <li key={c.version.id}>
                        <label
                          className={
                            "flex w-28 cursor-pointer flex-col gap-1 rounded-sm border p-1 text-[11px] " +
                            (on ? "border-accent-brand bg-accent-selection" : "border-border")
                          }
                        >
                          <span className="flex h-20 items-center justify-center overflow-hidden bg-surface-3">
                            {url ? (
                              <img
                                src={url}
                                alt=""
                                className="max-h-full max-w-full object-contain"
                              />
                            ) : null}
                          </span>
                          <span className="flex items-start gap-1">
                            <input
                              type="checkbox"
                              checked={on}
                              disabled={ro || (!on && draft.referenceVersionIds.length >= 6)}
                              onChange={(e) =>
                                setDraft((d) => ({
                                  ...d,
                                  referenceVersionIds: e.target.checked
                                    ? [...d.referenceVersionIds, c.version.id]
                                    : d.referenceVersionIds.filter((x) => x !== c.version.id),
                                }))
                              }
                              className="mt-0.5 size-3 accent-[var(--accent-brand)]"
                            />
                            <span className="line-clamp-2">{c.label}</span>
                          </span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              )}
              {draft.referenceVersionIds
                .filter((id) => !candidates.some((c) => c.version.id === id))
                .map((id) => (
                  <p key={id} className="flex items-center gap-2 text-[11px] text-text-tertiary">
                    Et valgt forbilde er ikke lenger godkjent eller finnes ikke.
                    {editable ? (
                      <button
                        type="button"
                        className="underline"
                        onClick={() =>
                          setDraft((d) => ({
                            ...d,
                            referenceVersionIds: d.referenceVersionIds.filter((x) => x !== id),
                          }))
                        }
                      >
                        Fjern
                      </button>
                    ) : null}
                  </p>
                ))}
              <p className="text-[11px] text-text-tertiary">
                Forbildebildene nevnes i beskrivelsen. Å sende dem med til bildemodellen koster mer
                og venter på ditt ja.
              </p>
            </fieldset>
          </div>
          <div className="flex flex-col gap-2">
            <label className="flex flex-col gap-1 text-xs text-text-secondary">
              <span className="flex items-center gap-1">
                <AiGlyph className="size-3.5" aria-hidden /> Slik blir en beskrivelse
              </span>
              <select
                value={previewAsset}
                onChange={(e) => setPreviewAsset(e.target.value)}
                className="h-8 rounded-sm border border-border-control bg-surface-3 px-2 text-[13px] text-text-primary"
              >
                {sortedAssets(state)
                  .filter((a) => !a.archived && a.kind !== "sound")
                  .map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
              </select>
            </label>
            <pre
              aria-label="Forhåndsvisning av beskrivelsen"
              className="max-h-[60vh] min-h-40 overflow-auto whitespace-pre-wrap rounded-sm border border-border bg-surface-2 p-2 font-mono text-[11px] leading-snug text-text-secondary"
            >
              {preview || "Velg en ressurs."}
            </pre>
          </div>
        </div>
        {error ? (
          <p role="alert" className="text-xs text-status-danger">
            {error}
          </p>
        ) : null}
        <DialogFooter>
          {editable && own && profile ? (
            <Button variant="ghost" className="mr-auto" onClick={remove}>
              <Trash2 /> Fjern stilprofilen
            </Button>
          ) : null}
          <Button variant="ghost" onClick={onClose}>
            {editable ? "Avbryt" : "Lukk"}
          </Button>
          {editable ? <Button onClick={save}>Lagre</Button> : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
