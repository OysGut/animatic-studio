/**
 * «Filmens visuelle stil» på prosjektoversikten (DEC-0065, REQ-0147, REQ-0589): det AI-en må vite om
 * filmen – handling, verden, stil, teknikk, farger, lys, stemning, regler for figurer og omgivelser, hva som
 * skal unngås og forbildebilder. Brukes i alle bildebeskrivelser. Utkastet kan foreslås fra prosjektet, og
 * forhåndsvisningen viser hvordan en beskrivelse blir.
 */
import { useImagePromptPreview } from "@/app/library/image-prompt-preview";
import { useMemo, useState } from "react";
import { ClipboardList, Loader2, Palette, Plus, ScanSearch, Trash2 } from "lucide-react";
import { writeImagePrompt } from "@/adapters/ai/write-prompt.functions";
import { AiGlyph } from "@/app/design/icons/AiGlyph";
import { STYLE_USES, STYLE_USE_LABEL, type StyleUse, STYLE_FIELD_LIMIT, STYLE_TOTAL_LIMIT, styleGuideLength, defaultStyleProfile, emptyStyleGuide, newId, sortedAssets, suggestStyleGuide, versionsOf, type ProjectState, type StyleGuide, type StyleTextField, STYLE_ANALYSIS_KEYS, STYLE_ANALYSIS_LABEL, applyStyleAnalysis, parseStyleAnalysis, styleAnalysisUserText, type StyleAnalysis, type StyleAnalysisKey, collation, tm } from "@/core";
import { GlobalStyleText } from "./GlobalStyleText";
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
import { t as tk } from "@/core/i18n/keyed";

const FIELDS: readonly {
  key: StyleTextField;
  label: () => string;
  hint: string;
  rows?: number;
}[] = [
  {
    key: "premise",
    label: () => tk("app-projects-style-guide-section.label.label.9432cb366cd9"),
    hint: "A ten-year-old girl spends the summer with her grandfather on a small island and discovers that the old lighthouse keeps a secret.",
    rows: 3,
  },
  {
    key: "world",
    label: () => tk("app-projects-style-guide-section.label.label.5f40d76fba0c"),
    hint: "A small island on the Norwegian coast around 1950. Wind, grey sea, white wooden houses and a red lighthouse.",
    rows: 3,
  },
  {
    key: "audience",
    label: () => tk("app-projects-style-guide-section.label.label.34deaa3bc540"),
    hint: "Family film for children 6–10; warm, gentle, a little spooky.",
  },
  {
    key: "visualStyle",
    label: () => tk("app-projects-style-guide-section.label.label.0eca2fdd7cac"),
    hint: "Hand-painted 2D animation inspired by Norwegian folk-tale illustration; simple, readable shapes.",
    rows: 2,
  },
  {
    key: "technique",
    label: () => tk("app-projects-style-guide-section.label.label.3bade036daf6"),
    hint: "Watercolour and gouache on textured paper, soft edges, visible brush strokes, limited detail.",
    rows: 2,
  },
  {
    key: "lighting",
    label: () => tk("app-projects-style-guide-section.label.label.e415871fd9d3"),
    hint: "Low winter sun by day; candles, oil lamps and fireplaces indoors; cold blue moonlight outside at night.",
    rows: 2,
  },
  {
    key: "mood",
    label: () => tk("app-projects-style-guide-section.label.label.5a9451cf856f"),
    hint: "Cosy and safe indoors, mysterious and vast outdoors.",
  },
  {
    key: "characterDesign",
    label: () => tk("app-projects-style-guide-section.label.label.c82839bfc8e2"),
    hint: "Round, soft shapes; large expressive eyes; simple faces; clothes in wool and knitted patterns.",
    rows: 2,
  },
  {
    key: "environmentDesign",
    label: () => tk("app-projects-style-guide-section.label.label.6bc0add9febe"),
    hint: "Old timber buildings, uneven floorboards, rag rugs; landscapes with soft snowdrifts and dark spruce forest.",
    rows: 2,
  },
  {
    key: "composition",
    label: () => tk("app-projects-style-guide-section.label.label.aec341995498"),
    hint: "Mostly eye-level at a child's height; wide shots to show how small the child is in the landscape.",
    rows: 2,
  },
  {
    key: "avoid",
    label: () => tk("app-projects-style-guide-section.label.label.0dd5519d5394"),
    hint: "Photorealism, 3D rendering, anime style, modern objects, text, logos, watermarks.",
    rows: 2,
  },
  {
    key: "instructions",
    label: () => tk("app-projects-style-guide-section.label.label.749aa4fdbfc2"),
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
    .sort((a, b) => a.name.localeCompare(b.name, collation()));
  const g = profile?.guide;
  const filled = g ? FIELDS.filter((f) => g[f.key].trim()).length : 0;
  return (
    <section aria-labelledby="style-title" className="mt-10">
      <div className="mb-2 flex items-center gap-2">
        <h2 id="style-title" className="text-base font-semibold text-text-primary">
          {tk("app-projects-style-guide-section.style-guide-section.h2.cf3f3ca9b968")}
        </h2>
        <span className="text-xs text-text-tertiary">
          {tk("app-projects-style-guide-section.style-guide-section.span.08f72f04f8b6")}
        </span>
        <Button size="sm" variant="secondary" className="ml-auto" onClick={() => setOpen(true)}>
          <Palette />
          {editable
            ? profile
              ? tk("app-projects-style-guide-section.style-guide-section.button.bafddd68a87e")
              : tk("app-projects-style-guide-section.style-guide-section.button.f05e2e395adc")
            : tk("app-projects-style-guide-section.style-guide-section.button.85b6aa7f6377")}
        </Button>
      </div>
      <div className="border border-border bg-surface-1 px-4 py-3 text-[13px] text-text-secondary">
        {g && filled ? (
          <>
            <p className="text-text-primary">{g.premise || g.visualStyle || g.world}</p>
            <p className="mt-1 text-xs text-text-tertiary">
              {filled} {tk("app-projects-style-guide-section.style-guide-section.p.ceb65a4ada96")} {FIELDS.length} {tk("app-projects-style-guide-section.style-guide-section.p.9db020a2af76")} ·{" "}
              {g.referenceVersionIds.length} {tk("app-projects-style-guide-section.style-guide-section.p.034f7d03053b")}
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
            {tk("app-projects-style-guide-section.style-guide-section.p.85775cfd3e37")}
          </p>
        )}
      </div>
      {/* Den samlede teksten som sendes, redigerbar for hele prosjektet (DEC-0085) */}
      {profile ? (
        <div className="mt-2">
          <GlobalStyleText
            state={state}
            cmds={cmds}
            editable={editable}
            profileOverride={profile}
          />
        </div>
      ) : null}
      {/* Egne stilprofiler for bestemte bruk (REQ-0148, DEC-0071) */}
      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-text-secondary">
        {others.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => setOpenId(p.id)}
            className="rounded-sm border border-border bg-surface-1 px-2 py-1 text-left hover:bg-surface-2"
            title={tk("app-projects-style-guide-section.style-guide-section.title.7a07d463c76d")}
          >
            <span className="text-text-primary">{p.name}</span>
            <span className="text-text-tertiary">
              {" "}
              ·{" "}
              {(p.appliesTo ?? []).length
                ? (p.appliesTo ?? []).map((u) => STYLE_USE_LABEL[u]).join(", ")
                : tk("app-projects-style-guide-section.style-guide-section.span.24031cefee85")}
            </span>
          </button>
        ))}
        {editable && profile ? (
          <Button size="sm" variant="ghost" onClick={() => setOpenId("new")}>
            <Plus />{" "}
            {tk("app-projects-style-guide-section.style-guide-section.button.026a1e5e5ff1")}
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

/** Redigering av en stilprofil – brukes også fra ressursbiblioteket (REQ-0121, DEC-0078). */
export function StyleGuideDialog({
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
  // Stilanalyse av forbildebildene (DEC-0080)
  const [analysis, setAnalysis] = useState<StyleAnalysis | null>(null);
  const [analysing, setAnalysing] = useState<"confirm" | "running" | null>(null);
  const [pickedKeys, setPickedKeys] = useState<Set<StyleAnalysisKey>>(new Set(STYLE_ANALYSIS_KEYS));
  const [pickColours, setPickColours] = useState(true);
  async function analyse() {
    setAnalysing("running");
    setError(null);
    try {
      const refs = draft.referenceVersionIds
        .map((id) => state.assetVersions[id])
        .filter((v): v is NonNullable<typeof v> => !!v && v.mimeType.startsWith("image/"))
        .slice(0, 6);
      const labels = refs.map((v) => {
        const va = state.assetVariants[v.variantId];
        const a = va ? state.assets[va.assetId] : undefined;
        return `${a?.name ?? "Image"} – ${va?.name ?? ""} v${v.number}`;
      });
      const r = await writeImagePrompt({
        data: {
          projectId: state.project.id,
          assetId: null,
          task: "style",
          brief: styleAnalysisUserText(draft, labels),
          purpose: "background",
          images: refs.map((v, i) => ({ path: v.mediaPath, label: labels[i]! })),
          approved: true,
        },
      });
      if (!r.ok) return setError(tm(r.message));
      const a = parseStyleAnalysis(r.prompt);
      if (!a)
        return setError(
          tk("app-projects-style-guide-section.analyse.set-error.5a93579a5c17"),
        );
      setAnalysis(a);
      setPickedKeys(new Set(STYLE_ANALYSIS_KEYS.filter((k) => a.en[k])));
    } catch (e) {
      setError(
        (e as Error).message || tk("app-projects-style-guide-section.analyse.set-error.6322f6473941"),
      );
    } finally {
      setAnalysing(null);
    }
  }

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
        .sort((a, b) => a.label.localeCompare(b.label, collation())),
    [state],
  );
  const urls = useImageUrls(candidates.map((c) => c.version.mediaPath)).data ?? {};

  // Forhåndsvisning av en beskrivelse med utkastet
  // B-105a: eksempelbeskrivelsen bygges på serveren (malene ligger bare der)
  const preview =
    useImagePromptPreview(
      state.project.id,
      previewAsset && main
        ? { kind: "styleDraft", assetId: previewAsset, profileId: profile?.id ?? null, guide: draft as unknown as Record<string, unknown> }
        : null,
      state,
    ).data?.prompt ?? "";

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
    if (bad)
      return setError(
        tk("app-projects-style-guide-section.save.set-error.fb2c09e808f7", { bad: String(bad) }),
      );
    const guide: StyleGuide = { ...draft, palette: { ...draft.palette, colors } };
    if ((profile?.revision ?? 0) !== openedRevision)
      return setError(
        tk("app-projects-style-guide-section.save.set-error.906ffb90e99d"),
      );
    if (own && !name.trim())
      return setError(tk("app-projects-style-guide-section.save.set-error.12505857d166"));
    const group = newId();
    const id = profile?.id ?? newId<"style_profile">();
    let err = profile
      ? cmds.run(
          {
            type: "UpdateStyleProfile",
            profileId: profile.id,
            fields: { name: own ? name.trim() : profile.name, isDefault: profile.isDefault, guide },
          },
          own
            ? tk("app-projects-style-guide-section.err.cmds-run.a1217e819847", { value1: String(name.trim()) })
            : tk("app-projects-style-guide-section.err.cmds-run.2d61cb1d67e0"),
          group,
        )
      : cmds.run(
          {
            type: "CreateStyleProfile",
            profileId: id as never,
            fields: own
              ? { name: name.trim(), isDefault: false, guide }
              : { name: "Filmens visuelle stil", isDefault: true, guide }, // i18n-ignore – lagret standardnavn
          },
          own
            ? tk("app-projects-style-guide-section.err.cmds-run.9a178c6a79c7", { value1: String(name.trim()) })
            : tk("app-projects-style-guide-section.err.cmds-run.e3bd9e16d4a3"),
          group,
        );
    const before = profile?.appliesTo ?? [];
    if (!err && own && (before.length !== uses.length || before.some((u) => !uses.includes(u))))
      err = cmds.run(
        { type: "SetStyleAppliesTo", profileId: id as never, appliesTo: uses },
        tk("app-projects-style-guide-section.save.cmds-run.86f31c8bc895"),
        group,
      );
    setError(err);
    if (!err) onClose();
  }

  function remove() {
    if (!profile || profile.isDefault) return;
    const err = cmds.run(
      { type: "SetStyleProfileRemoved", profileId: profile.id, removed: true },
      tk("app-projects-style-guide-section.err.cmds-run.bb6e2cd5f50f", { name: String(profile.name) }),
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
                ? tk("app-projects-style-guide-section.style-guide-dialog.dialog-title.d9b5eb79bfc3")
                : tk("app-projects-style-guide-section.style-guide-dialog.dialog-title.3da8b3b612dc", { name: String(profile?.name) })
              : tk("app-projects-style-guide-section.style-guide-dialog.dialog-title.4541d9ed708a")}
          </DialogTitle>
          <DialogDescription>
            {tk("app-projects-style-guide-section.style-guide-dialog.dialog-description.cefa937571fa")}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
          <div className="flex flex-col gap-3">
            {editable ? (
              <div className="flex flex-wrap items-center gap-2">
                <Button size="sm" variant="ghost" onClick={suggest} disabled={!main}>
                  <ClipboardList />
                  {tk("app-projects-style-guide-section.style-guide-dialog.button.9eb9c6c4709a")}
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={draft.referenceVersionIds.length === 0 || analysing !== null}
                  onClick={() => setAnalysing("confirm")}
                  title={
                    draft.referenceVersionIds.length === 0
                      ? tk("app-projects-style-guide-section.style-guide-dialog.title.66352daa2446")
                      : tk("app-projects-style-guide-section.style-guide-dialog.title.68c4b16aa462")
                  }
                >
                  {analysing === "running" ? <Loader2 className="animate-spin" /> : <ScanSearch />}
                  {analysing === "running"
                    ? tk("app-projects-style-guide-section.style-guide-dialog.button.e29a61452c4f")
                    : tk("app-projects-style-guide-section.style-guide-dialog.button.5ce321fc54e0")}
                </Button>
              </div>
            ) : null}
            {analysing === "confirm" ? (
              <div
                role="alertdialog"
                aria-label={tk("app-projects-style-guide-section.style-guide-dialog.aria-label.a8d3fe27c570")}
                className="flex flex-col gap-2 rounded-sm border border-accent-warm/50 bg-surface-1 p-2 text-xs text-text-secondary"
              >
                <p>
                  {Math.min(6, draft.referenceVersionIds.length)}{" "}
                  {tk("app-projects-style-guide-section.style-guide-dialog.p.54f579561ac4")}
                </p>
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => void analyse()}>
                    {tk("app-projects-style-guide-section.style-guide-dialog.button.8a243932d696")}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setAnalysing(null)}>
                    {tk("app-projects-style-guide-section.style-guide-dialog.button.0bd87cb51eb6")}
                  </Button>
                </div>
              </div>
            ) : null}
            {analysis ? (
              <section
                aria-label={tk("app-projects-style-guide-section.style-guide-dialog.aria-label.9193fb91ffd8")}
                className="flex flex-col gap-2 rounded-sm border border-border bg-surface-1 p-2 text-xs"
              >
                <h3 className="text-[13px] font-medium text-text-primary">
                  {tk("app-projects-style-guide-section.style-guide-dialog.h3.707a3428a5cc")}
                </h3>
                <p className="text-text-tertiary">
                  {tk("app-projects-style-guide-section.style-guide-dialog.p.0d552a7c2ffb")}
                </p>
                <ul className="flex flex-col gap-1.5">
                  {STYLE_ANALYSIS_KEYS.filter((k) => analysis.en[k]).map((k) => (
                    <li key={k}>
                      <label className="flex items-start gap-1.5">
                        <input
                          type="checkbox"
                          className="mt-0.5"
                          checked={pickedKeys.has(k)}
                          onChange={(e) =>
                            setPickedKeys((cur) => {
                              const n = new Set(cur);
                              if (e.target.checked) n.add(k);
                              else n.delete(k);
                              return n;
                            })
                          }
                        />
                        <span className="flex flex-col">
                          <span className="font-medium text-text-primary">
                            {STYLE_ANALYSIS_LABEL[k]}
                          </span>
                          <span className="text-text-secondary">
                            {analysis.nb[k] || analysis.en[k]}
                          </span>
                          <span className="font-mono text-[11px] text-text-tertiary">
                            {analysis.en[k]}
                          </span>
                        </span>
                      </label>
                    </li>
                  ))}
                  {analysis.colours.length ? (
                    <li>
                      <label className="flex items-center gap-1.5">
                        <input
                          type="checkbox"
                          checked={pickColours}
                          onChange={(e) => setPickColours(e.target.checked)}
                        />
                        <span className="font-medium text-text-primary">
                          {tk("app-projects-style-guide-section.style-guide-dialog.span.2eeb488d0500")}
                        </span>
                        {analysis.colours.map((c) => (
                          <span
                            key={c}
                            title={c}
                            className="size-4 rounded-sm border border-border"
                            style={{ background: c }}
                          />
                        ))}
                      </label>
                    </li>
                  ) : null}
                </ul>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    disabled={ro}
                    onClick={() => {
                      const next = applyStyleAnalysis(draft, analysis, pickedKeys, pickColours);
                      setDraft(next);
                      setColorText(next.palette.colors.join(" "));
                      setAnalysis(null);
                    }}
                  >
                    {tk("app-projects-style-guide-section.style-guide-dialog.button.135d1e7ddee6")}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setAnalysis(null)}>
                    {tk("app-projects-style-guide-section.style-guide-dialog.button.8af3c4a6696c")}
                  </Button>
                </div>
                <p className="text-text-tertiary">
                  {tk("app-projects-style-guide-section.style-guide-dialog.p.7201bcc3ee98")}
                </p>
              </section>
            ) : null}
            <p
              className={
                "text-[11px] " +
                (total > STYLE_TOTAL_LIMIT ? "text-status-danger" : "text-text-tertiary")
              }
            >
              {total} {tk("app-projects-style-guide-section.style-guide-dialog.p.cff42ce71802")} {STYLE_TOTAL_LIMIT}{" "}
              {tk("app-projects-style-guide-section.style-guide-dialog.p.c039b08da81e")}
            </p>
            {own ? (
              <fieldset className="flex flex-col gap-2 rounded-sm border border-border bg-surface-1 p-2 text-xs text-text-secondary">
                <label className="flex flex-col gap-1">
                  {tk("app-projects-style-guide-section.style-guide-dialog.label.5ac3e301e8e4")}
                  <input
                    value={name}
                    maxLength={120}
                    disabled={ro}
                    placeholder={tk("app-projects-style-guide-section.style-guide-dialog.placeholder.b7c235f5a147")}
                    onChange={(e) => setName(e.target.value)}
                    className={area}
                  />
                </label>
                <legend className="sr-only">{tk("app-projects-style-guide-section.style-guide-dialog.legend.6feae9bc1307")}</legend>
                <p>
                  {tk("app-projects-style-guide-section.style-guide-dialog.p.e413dff742c9")}
                </p>
                <div className="flex flex-wrap gap-x-3 gap-y-1">
                  {STYLE_USES.map((u) => {
                    const t = taken(u);
                    return (
                      <label
                        key={u}
                        className="flex items-center gap-1"
                        title={t ? tk("app-projects-style-guide-section.style-guide-dialog.title.539ef5aaea6f", { name: String(t.name) }) : undefined}
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
                {f.label()}
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
              <legend className="mb-1">{tk("app-projects-style-guide-section.style-guide-dialog.legend.18f6e3054789")}</legend>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  aria-label={tk("app-projects-style-guide-section.style-guide-dialog.aria-label.d051a1b89038")}
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
                aria-label={tk("app-projects-style-guide-section.style-guide-dialog.aria-label.01e2143ef77f")}
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
                {tk("app-projects-style-guide-section.style-guide-dialog.legend.7887170bc913", { length: String(draft.referenceVersionIds.length) })}
              </legend>
              {candidates.length === 0 ? (
                <p className="text-text-tertiary">
                  {tk("app-projects-style-guide-section.style-guide-dialog.p.785fc5d738a7")}
                </p>
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
                    {tk("app-projects-style-guide-section.style-guide-dialog.p.8ef266ebc933")}
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
                        {tk("app-projects-style-guide-section.style-guide-dialog.button.1324834ef4c0")}
                      </button>
                    ) : null}
                  </p>
                ))}
              <p className="text-[11px] text-text-tertiary">
                {tk("app-projects-style-guide-section.style-guide-dialog.p.79d8dd862d98")}
              </p>
            </fieldset>
          </div>
          <div className="flex flex-col gap-2">
            <label className="flex flex-col gap-1 text-xs text-text-secondary">
              <span className="flex items-center gap-1">
                <AiGlyph className="size-3.5" aria-hidden />{" "}
                {tk("app-projects-style-guide-section.style-guide-dialog.span.5be9d986168d")}
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
              aria-label={tk("app-projects-style-guide-section.style-guide-dialog.aria-label.6087ec44889e")}
              className="max-h-[60vh] min-h-40 overflow-auto whitespace-pre-wrap rounded-sm border border-border bg-surface-2 p-2 font-mono text-[11px] leading-snug text-text-secondary"
            >
              {preview || tk("app-projects-style-guide-section.style-guide-dialog.pre.41adfbf536f8")}
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
              <Trash2 /> {tk("app-projects-style-guide-section.style-guide-dialog.button.898762983e0d")}
            </Button>
          ) : null}
          <Button variant="ghost" onClick={onClose}>
            {editable ? tk("app-projects-style-guide-section.style-guide-dialog.button.0bd87cb51eb6.2") : tk("app-projects-style-guide-section.style-guide-dialog.button.4abb85b60887")}
          </Button>
          {editable ? <Button onClick={save}>{tk("app-projects-style-guide-section.style-guide-dialog.button.ba969324d6d6")}</Button> : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
