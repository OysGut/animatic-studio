/**
 * «Filmens visuelle stil» på prosjektoversikten (DEC-0065, REQ-0147, REQ-0589): det AI-en må vite om
 * filmen – handling, verden, stil, teknikk, farger, lys, stemning, regler for figurer og omgivelser, hva som
 * skal unngås og forbildebilder. Brukes i alle bildebeskrivelser. Utkastet kan foreslås fra prosjektet, og
 * forhåndsvisningen viser hvordan en beskrivelse blir.
 */
import { useMemo, useState } from "react";
import { ClipboardList, Loader2, Palette, Plus, ScanSearch, Trash2 } from "lucide-react";
import { writeImagePrompt } from "@/adapters/ai/write-prompt.functions";
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
  STYLE_ANALYSIS_KEYS,
  STYLE_ANALYSIS_LABEL,
  applyStyleAnalysis,
  parseStyleAnalysis,
  styleAnalysisUserText,
  type StyleAnalysis,
  type StyleAnalysisKey,
  L,
  collation,
  tm,
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

const FIELDS: readonly {
  key: StyleTextField;
  label: () => string;
  hint: string;
  rows?: number;
}[] = [
  {
    key: "premise",
    label: () => L("Hva filmen handler om", "What the film is about"),
    hint: "A ten-year-old girl spends the summer with her grandfather on a small island and discovers that the old lighthouse keeps a secret.",
    rows: 3,
  },
  {
    key: "world",
    label: () => L("Verden: sted, tid og årstid", "The world: place, time and season"),
    hint: "A small island on the Norwegian coast around 1950. Wind, grey sea, white wooden houses and a red lighthouse.",
    rows: 3,
  },
  {
    key: "audience",
    label: () => L("Publikum og tone", "Audience and tone"),
    hint: "Family film for children 6–10; warm, gentle, a little spooky.",
  },
  {
    key: "visualStyle",
    label: () => L("Visuell stil", "Visual style"),
    hint: "Hand-painted 2D animation inspired by Norwegian folk-tale illustration; simple, readable shapes.",
    rows: 2,
  },
  {
    key: "technique",
    label: () => L("Teknikk og materialer", "Technique and materials"),
    hint: "Watercolour and gouache on textured paper, soft edges, visible brush strokes, limited detail.",
    rows: 2,
  },
  {
    key: "lighting",
    label: () => L("Lys", "Light"),
    hint: "Low winter sun by day; candles, oil lamps and fireplaces indoors; cold blue moonlight outside at night.",
    rows: 2,
  },
  {
    key: "mood",
    label: () => L("Stemning og følelse", "Mood and feeling"),
    hint: "Cosy and safe indoors, mysterious and vast outdoors.",
  },
  {
    key: "characterDesign",
    label: () => L("Figurer", "Characters"),
    hint: "Round, soft shapes; large expressive eyes; simple faces; clothes in wool and knitted patterns.",
    rows: 2,
  },
  {
    key: "environmentDesign",
    label: () => L("Omgivelser og bakgrunner", "Surroundings and backgrounds"),
    hint: "Old timber buildings, uneven floorboards, rag rugs; landscapes with soft snowdrifts and dark spruce forest.",
    rows: 2,
  },
  {
    key: "composition",
    label: () => L("Bildeutsnitt og kameraspråk", "Framing and camera language"),
    hint: "Mostly eye-level at a child's height; wide shots to show how small the child is in the landscape.",
    rows: 2,
  },
  {
    key: "avoid",
    label: () => L("Unngå", "Avoid"),
    hint: "Photorealism, 3D rendering, anime style, modern objects, text, logos, watermarks.",
    rows: 2,
  },
  {
    key: "instructions",
    label: () => L("Egne instrukser til AI-en", "Own instructions to the AI"),
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
          {L("Filmens visuelle stil", "The film's visual style")}
        </h2>
        <span className="text-xs text-text-tertiary">
          {L("brukes i alle AI-beskrivelser", "used in all AI descriptions")}
        </span>
        <Button size="sm" variant="secondary" className="ml-auto" onClick={() => setOpen(true)}>
          <Palette />
          {editable
            ? profile
              ? L("Rediger …", "Edit …")
              : L("Lag …", "Make …")
            : L("Vis …", "View …")}
        </Button>
      </div>
      <div className="border border-border bg-surface-1 px-4 py-3 text-[13px] text-text-secondary">
        {g && filled ? (
          <>
            <p className="text-text-primary">{g.premise || g.visualStyle || g.world}</p>
            <p className="mt-1 text-xs text-text-tertiary">
              {filled} {L("av", "of")} {FIELDS.length} {L("felt fylt ut", "fields filled in")} ·{" "}
              {g.referenceVersionIds.length} {L("forbildebilder", "reference images")}
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
            {L(
              "Ikke fylt ut. En bildemodell vet ingenting om filmen – her beskriver dere hva den handler om, stil, teknikk, farger, lys og stemning, så alle bilder AI lager, passer inn.",
              "Not filled in. An image model knows nothing about the film – here you describe what it is about, style, technique, colours, light and mood, so that all the images the AI makes fit in.",
            )}
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
            title={L("Åpne stilprofilen", "Open the style profile")}
          >
            <span className="text-text-primary">{p.name}</span>
            <span className="text-text-tertiary">
              {" "}
              ·{" "}
              {(p.appliesTo ?? []).length
                ? (p.appliesTo ?? []).map((u) => STYLE_USE_LABEL[u]).join(", ")
                : L("ikke i bruk", "not in use")}
            </span>
          </button>
        ))}
        {editable && profile ? (
          <Button size="sm" variant="ghost" onClick={() => setOpenId("new")}>
            <Plus />{" "}
            {L(
              "Egen stil for plakater, steder, AI-video …",
              "Own style for posters, places, AI video …",
            )}
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
          L(
            "Svaret fra AI kunne ikke leses. Prøv igjen.",
            "The reply from the AI could not be read. Try again.",
          ),
        );
      setAnalysis(a);
      setPickedKeys(new Set(STYLE_ANALYSIS_KEYS.filter((k) => a.en[k])));
    } catch (e) {
      setError(
        (e as Error).message || L("Stilen ble ikke analysert.", "The style was not analysed."),
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
          name: L("Utkast", "Draft"),
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
    if (bad)
      return setError(
        L(
          `«${bad}» er ikke en farge på formen #rrggbb.`,
          `“${bad}” is not a colour in the form #rrggbb.`,
        ),
      );
    const guide: StyleGuide = { ...draft, palette: { ...draft.palette, colors } };
    if ((profile?.revision ?? 0) !== openedRevision)
      return setError(
        L(
          "Noen andre har endret filmens visuelle stil mens du skrev. Kopier det du har skrevet, lukk og åpne på nytt.",
          "Someone else changed the film's visual style while you were writing. Copy what you have written, close and open again.",
        ),
      );
    if (own && !name.trim())
      return setError(L("Gi stilprofilen et navn.", "Give the style profile a name."));
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
            ? L(`Endre stilprofilen «${name.trim()}»`, `Change the style profile “${name.trim()}”`)
            : L("Endre filmens visuelle stil", "Change the film's visual style"),
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
            ? L(`Ny stilprofil «${name.trim()}»`, `New style profile “${name.trim()}”`)
            : L("Lag filmens visuelle stil", "Make the film's visual style"),
          group,
        );
    const before = profile?.appliesTo ?? [];
    if (!err && own && (before.length !== uses.length || before.some((u) => !uses.includes(u))))
      err = cmds.run(
        { type: "SetStyleAppliesTo", profileId: id as never, appliesTo: uses },
        L("Hva stilprofilen gjelder for", "What the style profile applies to"),
        group,
      );
    setError(err);
    if (!err) onClose();
  }

  function remove() {
    if (!profile || profile.isDefault) return;
    const err = cmds.run(
      { type: "SetStyleProfileRemoved", profileId: profile.id, removed: true },
      L(`Fjern stilprofilen «${profile.name}»`, `Remove the style profile “${profile.name}”`),
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
                ? L("Ny stilprofil", "New style profile")
                : L(`Stilprofil: ${profile?.name}`, `Style profile: ${profile?.name}`)
              : L("Filmens visuelle stil", "The film's visual style")}
          </DialogTitle>
          <DialogDescription>
            {L(
              "Dette sendes med i alle bildebeskrivelser, sammen med det programmet vet om scenene (sted, tid på døgnet, lys, hvem som er der) og godkjente bilder. Skriv helst på engelsk – beskrivelsene som sendes, er på engelsk. Eksemplene i feltene viser hva som passer.",
              "This is sent with every image description, together with what the app knows about the scenes (place, time of day, light, who is there) and approved images. Preferably write in English – the descriptions sent are in English. The examples in the fields show what fits.",
            )}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
          <div className="flex flex-col gap-3">
            {editable ? (
              <div className="flex flex-wrap items-center gap-2">
                <Button size="sm" variant="ghost" onClick={suggest} disabled={!main}>
                  <ClipboardList />
                  {L(
                    "Foreslå utkast fra prosjektet (fyller bare tomme felt)",
                    "Suggest a draft from the project (fills empty fields only)",
                  )}
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={draft.referenceVersionIds.length === 0 || analysing !== null}
                  onClick={() => setAnalysing("confirm")}
                  title={
                    draft.referenceVersionIds.length === 0
                      ? L(
                          "Velg forbildebilder nederst først",
                          "Choose reference images at the bottom first",
                        )
                      : L(
                          "En bildeforstående AI ser på forbildebildene og beskriver stilen konkret",
                          "An image-understanding AI looks at the reference images and describes the style concretely",
                        )
                  }
                >
                  {analysing === "running" ? <Loader2 className="animate-spin" /> : <ScanSearch />}
                  {analysing === "running"
                    ? L(
                        "Analyserer … (opptil et halvt minutt)",
                        "Analysing … (up to half a minute)",
                      )
                    : L(
                        "Analyser stilen i forbildebildene …",
                        "Analyse the style in the reference images …",
                      )}
                </Button>
              </div>
            ) : null}
            {analysing === "confirm" ? (
              <div
                role="alertdialog"
                aria-label={L("Bekreft stilanalyse", "Confirm style analysis")}
                className="flex flex-col gap-2 rounded-sm border border-accent-warm/50 bg-surface-1 p-2 text-xs text-text-secondary"
              >
                <p>
                  {Math.min(6, draft.referenceVersionIds.length)}{" "}
                  {L(
                    "forbildebilder sendes til en språkmodell i Lovable AI, som beskriver stilen. Det bruker litt kreditter (langt mindre enn et bilde) og endrer ingenting før du velger hva som skal inn.",
                    "reference images are sent to a language model in Lovable AI, which describes the style. It uses a few credits (far less than an image) and changes nothing until you choose what goes in.",
                  )}
                </p>
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => void analyse()}>
                    {L("Ja, analyser", "Yes, analyse")}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setAnalysing(null)}>
                    {L("Avbryt", "Cancel")}
                  </Button>
                </div>
              </div>
            ) : null}
            {analysis ? (
              <section
                aria-label={L("Stilanalyse", "Style analysis")}
                className="flex flex-col gap-2 rounded-sm border border-border bg-surface-1 p-2 text-xs"
              >
                <h3 className="text-[13px] font-medium text-text-primary">
                  {L(
                    "Stilanalyse – velg hva som skal inn i stilen",
                    "Style analysis – choose what goes into the style",
                  )}
                </h3>
                <p className="text-text-tertiary">
                  {L(
                    "Norsk for deg å lese; den engelske teksten er den som havner i feltene og sendes med bildebeskrivelsene. Du kan rette feltene etterpå.",
                    "Norwegian for you to read; the English text is what ends up in the fields and is sent with the image descriptions. You can correct the fields afterwards.",
                  )}
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
                          {L("Fargepaletten", "The colour palette")}
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
                    {L("Bruk det valgte i stilen", "Use the selection in the style")}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setAnalysis(null)}>
                    {L("Forkast", "Discard")}
                  </Button>
                </div>
                <p className="text-text-tertiary">
                  {L(
                    "Ingenting er lagret før du trykker «Lagre» nederst.",
                    "Nothing is saved until you press “Save” at the bottom.",
                  )}
                </p>
              </section>
            ) : null}
            <p
              className={
                "text-[11px] " +
                (total > STYLE_TOTAL_LIMIT ? "text-status-danger" : "text-text-tertiary")
              }
            >
              {total} {L("av", "of")} {STYLE_TOTAL_LIMIT}{" "}
              {L(
                "tegn til sammen (resten av beskrivelsen – bildet og scenene – må også få plass).",
                "characters in total (the rest of the description – the image and the scenes – must also fit).",
              )}
            </p>
            {own ? (
              <fieldset className="flex flex-col gap-2 rounded-sm border border-border bg-surface-1 p-2 text-xs text-text-secondary">
                <label className="flex flex-col gap-1">
                  {L("Navn", "Name")}
                  <input
                    value={name}
                    maxLength={120}
                    disabled={ro}
                    placeholder={L(
                      "F.eks. Plakatstil, Nattscener",
                      "E.g. Poster style, Night scenes",
                    )}
                    onChange={(e) => setName(e.target.value)}
                    className={area}
                  />
                </label>
                <legend className="sr-only">{L("Gjelder for", "Applies to")}</legend>
                <p>
                  {L(
                    "Gjelder for (resten bruker filmens visuelle stil):",
                    "Applies to (the rest use the film's visual style):",
                  )}
                </p>
                <div className="flex flex-wrap gap-x-3 gap-y-1">
                  {STYLE_USES.map((u) => {
                    const t = taken(u);
                    return (
                      <label
                        key={u}
                        className="flex items-center gap-1"
                        title={t ? L(`Brukes av «${t.name}»`, `Used by “${t.name}”`) : undefined}
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
              <legend className="mb-1">{L("Fargepalett", "Colour palette")}</legend>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  aria-label={L(
                    "Farger (#rrggbb, skilt med mellomrom)",
                    "Colours (#rrggbb, separated by spaces)",
                  )}
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
                aria-label={L("Beskrivelse av fargene", "Description of the colours")}
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
                {L(
                  `Forbildebilder (${draft.referenceVersionIds.length} valgt, høyst 6) – bilder som viser stilen`,
                  `Reference images (${draft.referenceVersionIds.length} selected, max 6) – images that show the style`,
                )}
              </legend>
              {candidates.length === 0 ? (
                <p className="text-text-tertiary">
                  {L("Ingen bilder i biblioteket ennå.", "No images in the library yet.")}
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
                    {L(
                      "Et valgt forbilde er ikke lenger godkjent eller finnes ikke.",
                      "A selected reference image is no longer approved or does not exist.",
                    )}
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
                        {L("Fjern", "Remove")}
                      </button>
                    ) : null}
                  </p>
                ))}
              <p className="text-[11px] text-text-tertiary">
                {L(
                  "Forbildebildene nevnes i beskrivelsen. Å sende dem med til bildemodellen koster mer og venter på ditt ja.",
                  "The reference images are mentioned in the description. Sending them to the image model costs more and waits for your yes.",
                )}
              </p>
            </fieldset>
          </div>
          <div className="flex flex-col gap-2">
            <label className="flex flex-col gap-1 text-xs text-text-secondary">
              <span className="flex items-center gap-1">
                <AiGlyph className="size-3.5" aria-hidden />{" "}
                {L("Slik blir en beskrivelse", "What a description looks like")}
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
              aria-label={L("Forhåndsvisning av beskrivelsen", "Preview of the description")}
              className="max-h-[60vh] min-h-40 overflow-auto whitespace-pre-wrap rounded-sm border border-border bg-surface-2 p-2 font-mono text-[11px] leading-snug text-text-secondary"
            >
              {preview || L("Velg en ressurs.", "Choose an asset.")}
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
              <Trash2 /> {L("Fjern stilprofilen", "Remove the style profile")}
            </Button>
          ) : null}
          <Button variant="ghost" onClick={onClose}>
            {editable ? L("Avbryt", "Cancel") : L("Lukk", "Close")}
          </Button>
          {editable ? <Button onClick={save}>{L("Lagre", "Save")}</Button> : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
