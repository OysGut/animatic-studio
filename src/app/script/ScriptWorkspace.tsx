/**
 * Arbeidsflaten «Manus» (M2): import, sidevisning, scenenavigator, korrigering og redigering med angre.
 * Manus og film bygger på samme aktive struktur (INV-01); alt her er kommandoer mot domenekjernen.
 */
import { ProductionPicker, useActiveProduction } from "@/app/project/use-production";
import { ProductionDialog } from "@/app/projects/ProductionDialog";
import { PromotionDialog } from "@/app/projects/PromotionDialog";
import { TranslationImportDialog } from "./TranslationImportDialog";
import { RemoveTranslationsDialog } from "./RemoveTranslationsDialog";
import { LanguageVersionsDialog } from "./LanguageVersionsDialog";
import { ScriptLanguageSelect } from "./ScriptLanguageSelect";
import { WritingPanel, type AssistTrigger } from "./assist/WritingPanel";
import { AssistContextMenu, assistShortcut, selectedBlockIdsIn } from "./assist/assist-ui";
import {
  ChevronDown,
  CornerUpLeft,
  Download,
  FileUp,
  History,
  Languages,
  ListPlus,
  Loader2,
  Lock,
  MessageSquarePlus,
  Plus,
  Redo2,
  SlidersHorizontal,
  Undo2,
} from "lucide-react";
import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { collation, changedBlockIds, discrepancies, filmClips, assetNames, allAssetUsage, charactersInProduction, filterPages, isFilterActive, matchingScenes, productionStatus, estimateProduction, alignBlockLines, annotationsByVariant, movedOccurrences, keysEvenly, LANGUAGE_LABEL, isScriptLanguageTag, translatedState, translationStatus, newId, pageDecorations, resolveRange, searchHits, type Annotation, nameKey, orderedOccurrences, scriptPages, scriptView, sortedAssets, type ProjectState, type SceneFilter, promotionCandidates } from "@/core";
import { canEdit, useMembers, useProfiles, useProjectState } from "@/app/project/use-project";
import { initials, usePresence, type PresentUser } from "@/app/project/use-presence";
import { useCommands, type Commands } from "@/app/project/use-commands";
import { useVersionList, useVersionSnapshot } from "@/app/project/use-versions";
import { Button } from "@/components/ui/button";
import { Toolbar, ToolbarButton, ToolbarSeparator, ToolbarGroup, IconButton } from "@/app/shell/workspace-chrome";
import { Switch } from "@/components/ui/switch";
import { ExportDialog } from "./ExportDialog";
import { ImportDialog } from "./ImportDialog";
import { VersionsDialog } from "./VersionsDialog";
import { Inspector } from "./Inspector";
import { SceneNavigator, type CharacterOption } from "./SceneNavigator";
import { ScriptPageView, type Selection } from "./ScriptPageView";
import { PaneResizer, usePaneSize, useStoredFlag } from "@/app/shell/pane-size";
import { onGotoScene, rememberScene } from "@/app/shell/current-scene";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { RejectedTextNotice } from "@/app/project/RejectedTextNotice";
import { titlePageCommand } from "@/core/commands/export-settings";
import { useSchemaAtLeast } from "@/app/shell/use-schema";
import { t as tk } from "@/core/i18n/keyed";

const ZOOMS = ["fit", "0.75", "1", "1.25", "1.5"] as const;
type Zoom = (typeof ZOOMS)[number];
const PAGE_PX = 51 * 16; // sidebredde ved 100 %

export function ScriptWorkspace({
  projectId,
  userId,
  initialOccurrenceId = null,
  initialBlockId = null,
}: {
  projectId: string;
  userId: string;
  /** Scene som skal være valgt når manuset åpnes (f.eks. fra ressursbiblioteket). */
  initialOccurrenceId?: string | null;
  /** Blokk som skal være valgt (fra monteringen). */
  initialBlockId?: string | null;
}) {
  const query = useProjectState(projectId);
  const members = useMembers(projectId);
  const role = members.data?.find((m) => m.user_id === userId)?.role;
  const editable = canEdit(role);
  const cmds = useCommands(projectId, userId, editable);

  if (query.isLoading)
    return (
      <p className="p-6 text-[13px] text-text-tertiary">
        {tk("app-script-script-workspace.script-workspace.p.6c70d6eba610")}
      </p>
    );
  if (query.isError || !query.data)
    return (
      <div role="alert" className="p-6 text-[13px] text-status-danger">
        {tk("app-script-script-workspace.script-workspace.div.33729a2872d9")}
        {query.error ? (
          <p className="mt-2 font-mono text-xs text-text-tertiary">
            {tk("app-script-script-workspace.script-workspace.p.982d6ef58489")}: {query.error.message}
          </p>
        ) : null}
      </div>
    );
  return (
    <Workspace
      state={query.data}
      projectId={projectId}
      editable={editable}
      roleKnown={members.isSuccess}
      cmds={cmds}
      userId={userId}
      initialOccurrenceId={initialOccurrenceId}
      initialBlockId={initialBlockId}
    />
  );
}

function Workspace({
  state,
  projectId,
  editable,
  roleKnown,
  cmds,
  userId,
  initialOccurrenceId,
  initialBlockId,
}: {
  state: ProjectState;
  projectId: string;
  editable: boolean;
  roleKnown: boolean;
  cmds: Commands;
  userId: string;
  initialOccurrenceId: string | null;
  initialBlockId: string | null;
}) {
  const [navWidth, setNavWidth] = usePaneSize("script-nav", 280, 200, 520);
  const [inspWidth, setInspWidth] = usePaneSize("script-inspector", 320, 240, 640);
  const productions = useMemo(
    () =>
      Object.values(state.productions).sort((a, b) =>
        a.kind === "main" ? -1 : b.kind === "main" ? 1 : a.name.localeCompare(b.name, collation()),
      ),
    [state.productions],
  );
  const initialOcc = initialOccurrenceId ? state.occurrences[initialOccurrenceId] : undefined;
  const initialBlock =
    initialOcc && initialBlockId && state.blocks[initialBlockId]?.variantId === initialOcc.variantId
      ? initialBlockId
      : null;
  // Valgt produksjon, felles for arbeidsflatene (DEC-0057)
  const [productionId, setProductionId] = useActiveProduction(
    projectId,
    state,
    initialOcc?.id ?? null,
  );
  const [selection, setSelection] = useState<Selection>({
    occurrenceId: initialOcc?.id ?? null,
    blockId: initialBlock,
  });
  useEffect(
    () => rememberScene(projectId, selection.occurrenceId, state.occurrences[selection.occurrenceId ?? ""]?.sceneId ?? null),
    [projectId, selection.occurrenceId, state.occurrences],
  );
  // Scenen har fått egen versjon (ForkVariant, DEC-0057): valgt linje flyttes til den nye versjonen
  useEffect(() => {
    const o = selection.occurrenceId ? state.occurrences[selection.occurrenceId] : undefined;
    const b = selection.blockId ? state.blocks[selection.blockId] : undefined;
    if (!o || !b || b.variantId === o.variantId) return;
    if (state.variants[o.variantId]?.basedOnVariantId !== b.variantId) return;
    const twin = Object.values(state.blocks).find(
      (x) => x.variantId === o.variantId && x.orderKey === b.orderKey,
    );
    setSelection({ occurrenceId: o.id, blockId: twin?.id ?? null });
  }, [selection.occurrenceId, selection.blockId, state.occurrences, state.blocks, state.variants]);
  // Produksjonen er byttet (her eller i en annen arbeidsflate): valget gjelder ikke lenger
  useEffect(() => {
    const o = selection.occurrenceId ? state.occurrences[selection.occurrenceId] : undefined;
    if (o && o.productionId !== productionId) setSelection({ occurrenceId: null, blockId: null });
  }, [productionId, selection.occurrenceId, state.occurrences]);
  const [lockedPages, setLockedPages] = useState(true);
  // Manusspråk i visningen (DEC-0058): norsk hovedmanus eller en oversettelse. Huskes per prosjekt.
  const [lang, setLangState] = useState<string>(() => {
    try {
      const l = window.localStorage.getItem(`animatic:script-lang:${projectId}`) ?? "nb";
      return LANGUAGE_LABEL[l] || isScriptLanguageTag(l) ? l : "nb";
    } catch {
      return "nb";
    }
  });
  const setLang = (l: string) => {
    setLangState(l);
    try {
      window.localStorage.setItem(`animatic:script-lang:${projectId}`, l);
    } catch {
      // Ikke tilgjengelig: valget gjelder bare denne visningen
    }
  };
  const [importLangOpen, setImportLangOpen] = useState(false);
  const [removeLangOpen, setRemoveLangOpen] = useState(false);
  const [langVersionsOpen, setLangVersionsOpen] = useState(false);
  const viewState = useMemo(() => translatedState(state, lang), [state, lang]);
  const langStatus = useMemo(
    () => (lang === "nb" ? null : translationStatus(state, productionId, lang)),
    [state, productionId, lang],
  );
  const langMarks = useMemo(
    () =>
      langStatus
        ? {
            missing: langStatus.missingIds,
            uncertain: langStatus.uncertainIds,
            review: langStatus.reviewIds,
          }
        : undefined,
    [langStatus],
  );
  const [zoomChoice, setZoom] = useState<Zoom>("fit");
  const [fitZoom, setFitZoom] = useState(1);
  const [importOpen, setImportOpen] = useState(false);
  const [addScenesOpen, setAddScenesOpen] = useState(false);
  /** Tilbakeføring til hovedfilmen (DEC-0060). */
  const [promoteOpen, setPromoteOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [versionsOpen, setVersionsOpen] = useState(false);
  // Visningsvalg (REQ-0531, REQ-0073–0075): endrer aldri produksjonen
  const [onlySelected, setOnlySelected] = useState(false);
  /** Lesevisningen for valgt scene: sort tekst på hvit bakgrunn (DEC-0080). Huskes i nettleseren. */
  const [lightReading, setLightReading] = useStoredFlag("script-scene-light", false);
  // Røde margmerker for linjer endret etter materialet (KI-176, REQ-0102, Mars 15.10.2026: «legg med et valg
  // for å skjule»). Bare på skjermen; de kommer aldri med i utskrift eller eksport.
  const [showChanged, setShowChanged] = useStoredFlag("script-changed-marks", true);
  const [filter, setFilter] = useState<SceneFilter>({});
  // Rekkefølge og synlighet endres bare når brukeren har slått det på (REQ-0532)
  const [structureEditing, setStructureEditing] = useState(false);
  // Notater (DEC-0031): vis/skjul, og hvilket notat som er klikket
  const [showNotes, setShowNotes] = useState(true);
  const [focusNote, setFocusNote] = useState<string | null>(null);
  // Scenen som vises øverst i manuset nå (oppdateres når du blar)
  const [inView, setInView] = useState<string | null>(null);
  // Markert tekst som kan få et notat
  const [pendingNote, setPendingNote] = useState<PendingNote | null>(null);
  const textRef = useRef<HTMLTextAreaElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  // Tilstedeværelse: hvem andre er i prosjektet, og hvilken scene de står i
  const me = useProfiles([userId]);
  const myName = me.data?.[userId]?.display_name || tk("app-script-script-workspace.my-name.message.e0177e934ee9");
  // Skrivehjelpen (T2): egen fane ved inspektøren, hurtigtaster og kontekstmeny
  const [rightTab, setRightTab] = useState<"inspector" | "assist">("inspector");
  const [assistTrigger, setAssistTrigger] = useState<AssistTrigger | null>(null);
  const [assistMenu, setAssistMenu] = useState<{ x: number; y: number; blockIds: string[] } | null>(null);
  const assistAvailable = editable && lang === "nb";
  const selectedBlockIds = useCallback(() => selectedBlockIdsIn(scrollRef.current), []);
  const triggerAssist = useCallback((t: Omit<AssistTrigger, "nonce">) => {
    setRightTab("assist");
    setAssistTrigger({ ...t, nonce: Date.now() });
  }, []);
  useEffect(() => {
    if (!assistAvailable) return;
    const onKey = (e: globalThis.KeyboardEvent) => {
      const action = assistShortcut(e);
      if (!action) return;
      e.preventDefault();
      const ids = selectedBlockIds();
      triggerAssist({ action, blockIds: ids.length ? ids : selection.blockId ? [selection.blockId] : [] });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [assistAvailable, selectedBlockIds, triggerAssist, selection.blockId]);
  const others = usePresence(
    projectId,
    userId,
    me.data?.[userId]?.display_name || tk("app-script-script-workspace.others.use-presence.dd7c3ee425b2"),
    selection.occurrenceId,
  );
  const presenceByOcc = useMemo(() => {
    const m = new Map<string, PresentUser[]>();
    for (const o of others)
      if (o.occurrenceId) m.set(o.occurrenceId, [...(m.get(o.occurrenceId) ?? []), o]);
    return m;
  }, [others]);

  // Tittelsiden lagres i eksportinnstillingene (migrasjon 0027, KI-20)
  const schema27 = useSchemaAtLeast(27);
  const hasScenes = Object.values(state.occurrences).some((o) => o.productionId === productionId);
  // Flyttet siden siste lagrede versjon (REQ-0533)
  const versionList = useVersionList(productionId, hasScenes);
  const latestVersion = versionList.data?.[0] ?? null;
  const latestSnapshot = useVersionSnapshot(latestVersion?.id ?? null);
  const moved = useMemo(() => {
    const snap = latestSnapshot.data;
    if (!snap || snap.productionId !== productionId) return null;
    return movedOccurrences(
      snap,
      orderedOccurrences(state, productionId).map((o) => o.id),
    );
  }, [latestSnapshot.data, state, productionId]);
  // «Tilpass bredde»: siden fyller midtfeltet
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() =>
      setFitZoom(Math.max(0.5, Math.min(1.5, (el.clientWidth - 48) / PAGE_PX))),
    );
    ro.observe(el);
    return () => ro.disconnect();
  }, [hasScenes]);
  const zoom = zoomChoice === "fit" ? fitZoom : Number(zoomChoice);

  const pagination = useMemo(
    () => scriptPages(viewState, productionId, { lockedPages }),
    [viewState, productionId, lockedPages],
  );
  // Karakterfilter: karakterer fra biblioteket (med alle navn, KI-29) og navn i manuset som ikke er der ennå
  const characters = useMemo<CharacterOption[]>(() => {
    const lib = sortedAssets(state, "character").filter((a) => !a.archived);
    const known = new Set(lib.flatMap(assetNames).map(nameKey));
    const usage = allAssetUsage(state, productionId);
    return [
      ...lib.map((a) => ({
        value: `asset:${a.id}`,
        label: a.name,
        scenes: usage.get(a.id)?.length ?? 0,
        names: assetNames(a),
        fromLibrary: true,
      })),
      ...charactersInProduction(state, productionId)
        .filter((c) => !known.has(c.name))
        .map((c) => ({
          value: c.name,
          label: c.name,
          scenes: c.scenes,
          names: [c.name],
          fromLibrary: false,
        })),
    ];
  }, [state, productionId]);
  // Status per scene bare når filteret trenger den, og ikke på nytt for hvert tastetrykk i søket
  const needsStatus = !!(filter.assetId || filter.status || filter.discrepancy);
  const statusRows = useMemo(
    () =>
      needsStatus
        ? productionStatus(state, productionId, estimateProduction(state, productionId)).rows
        : undefined,
    [needsStatus, state, productionId],
  );
  const matching = useMemo(
    () =>
      isFilterActive(filter) ? matchingScenes(viewState, productionId, filter, statusRows) : null,
    [viewState, productionId, filter, statusRows],
  );
  const showOnlySelected = onlySelected && selection.occurrenceId !== null;
  // Lesevisningen: ny scene vises fra toppen (DEC-0080)
  useEffect(() => {
    if (showOnlySelected) scrollRef.current?.scrollTo({ top: 0 });
  }, [showOnlySelected, selection.occurrenceId]);
  const visibleOcc = useMemo<ReadonlySet<string> | null>(
    () => (showOnlySelected ? new Set([selection.occurrenceId!]) : matching),
    [showOnlySelected, selection.occurrenceId, matching],
  );
  const shownPages = useMemo(
    () => (visibleOcc ? filterPages(pagination.pages, visibleOcc) : pagination.pages),
    [pagination, visibleOcc],
  );
  // Søketreff og notater markert på sidene (REQ-0538, REQ-0541)
  // Søket markeres litt etter tastetrykket, så skrivingen ikke hakker i lange manus
  const query = useDeferredValue(filter.text ?? "");
  const decor = useMemo(
    // Notatene står i den norske teksten; i en annen språkvisning markeres bare søketreff
    () =>
      pageDecorations(shownPages, viewState, {
        query,
        notes: showNotes && lang === "nb",
      }),
    [shownPages, viewState, query, showNotes, lang],
  );
  // Blokker endret etter at 2D-scene eller film ble laget (DEC-0054)
  const changedKey = useMemo(
    () =>
      [...changedBlockIds(discrepancies(state, filmClips(state, productionId), { spans: false }))]
        .sort()
        .join(","),
    [state, productionId],
  );
  // Samme sett så lenge innholdet er likt (sidene er memoisert og skal ikke tegnes om ved hver endring)
  const changedBlocks = useMemo(
    () => new Set(changedKey ? changedKey.split(",") : []),
    [changedKey],
  );
  const hits = useMemo(
    () => (query.trim() ? searchHits(state, productionId, query) : null),
    [state, productionId, query],
  );
  const noteCounts = useMemo(() => {
    const m = new Map<string, number>();
    const byVariant = annotationsByVariant(state);
    for (const o of Object.values(state.occurrences)) {
      if (o.productionId !== productionId) continue;
      const n = byVariant.get(o.variantId)?.length ?? 0;
      if (n) m.set(o.id, n);
    }
    return m;
  }, [state, productionId]);
  const uncertainCount = useMemo(() => {
    let n = 0;
    for (const sc of scriptView(state, productionId)) {
      if (state.variants[state.occurrences[sc.occurrenceId]!.variantId]?.uncertainty) n++;
      for (const b of sc.blocks) if (b.uncertainty) n++;
    }
    return n;
  }, [state, productionId]);

  // Valget kan forsvinne (angre, andres endringer): rydd opp
  useEffect(() => {
    if (
      selection.blockId &&
      (!state.blocks[selection.blockId] || state.blocks[selection.blockId]!.removed)
    ) {
      setSelection((s) => ({ ...s, blockId: null }));
    }
    if (selection.occurrenceId && !state.occurrences[selection.occurrenceId])
      setSelection({ occurrenceId: null, blockId: null });
  }, [state, selection]);

  const scrollTo = useCallback((sel: Selection) => {
    requestAnimationFrame(() => {
      const el = sel.blockId
        ? scrollRef.current?.querySelector(`[data-block="${sel.blockId}"]`)
        : sel.occurrenceId
          ? document.getElementById(`scene-${sel.occurrenceId}`)
          : null;
      // Valgt scene: overskriften øverst (REQ-0542). Valgt linje: midt i visningen.
      el?.scrollIntoView({ block: sel.blockId ? "center" : "start", behavior: "smooth" });
    });
  }, []);

  const select = useCallback(
    (sel: Selection, scroll = false) => {
      setSelection(sel);
      if (scroll) scrollTo(sel);
    },
    [scrollTo],
  );
  // Oppgavene i toppstripen (DEC-0088): gå til neste/forrige scene som skal oppdateres
  useEffect(
    () =>
      onGotoScene(projectId, (occurrenceId) => {
        if (!state.occurrences[occurrenceId]) return;
        select({ occurrenceId, blockId: null }, true);
      }),
    [projectId, state.occurrences, select],
  );
  // Åpnet med en valgt scene: vis den når sidene er tegnet
  useEffect(() => {
    if (initialOcc)
      setTimeout(() => scrollTo({ occurrenceId: initialOcc.id, blockId: initialBlock }), 60);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Rekkefølge av synlige blokker og overskrifter, for tastaturnavigasjon og «neste usikre»
  const order = useMemo(() => {
    const out: Selection[] = [];
    for (const sc of scriptView(state, productionId)) {
      if (visibleOcc && !visibleOcc.has(sc.occurrenceId)) continue;
      out.push({ occurrenceId: sc.occurrenceId, blockId: null });
      for (const b of sc.blocks) out.push({ occurrenceId: sc.occurrenceId, blockId: b.id });
    }
    return out;
  }, [state, productionId, visibleOcc]);

  function nextUncertain() {
    const at = order.findIndex(
      (x) => x.occurrenceId === selection.occurrenceId && x.blockId === selection.blockId,
    );
    for (let k = 1; k <= order.length; k++) {
      const s = order[(at + k + order.length) % order.length]!;
      const occ = state.occurrences[s.occurrenceId!]!;
      const unc = s.blockId
        ? state.blocks[s.blockId]?.uncertainty
        : state.variants[occ.variantId]?.uncertainty;
      if (unc) {
        select(s, true);
        return;
      }
    }
  }

  function onPagesKey(e: KeyboardEvent) {
    if (e.target !== e.currentTarget) return;
    const at = order.findIndex(
      (x) => x.occurrenceId === selection.occurrenceId && x.blockId === selection.blockId,
    );
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const n =
        order[Math.min(order.length - 1, Math.max(0, at + (e.key === "ArrowDown" ? 1 : -1)))];
      if (n) select(n, true);
    } else if (e.key === "Enter" && selection.blockId) {
      e.preventDefault();
      textRef.current?.focus();
    }
  }

  const run = cmds.run;

  // Stabile funksjoner til manussidene, så sider som ikke er endret, ikke tegnes på nytt (memo)
  const stateRef = useRef(state);
  stateRef.current = state;
  const onPageSelect = useCallback((s: Selection) => select(s), [select]);
  const onPageActivate = useCallback(
    (s: Selection) => {
      select(s);
      setTimeout(() => textRef.current?.focus(), 30);
    },
    [select],
  );
  const onPageNoteClick = useCallback(
    (ids: readonly string[], s: Selection) => {
      const a = stateRef.current.annotations[ids[0]!];
      select(a && a.blockId === null ? { occurrenceId: s.occurrenceId, blockId: null } : s);
      setFocusNote(ids[0] ?? null);
    },
    [select],
  );

  /** Hvilken scene står øverst i visningen? Regnes ut fra sidenes plassering (rask, også for lange manus). */
  const updateInView = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const sheets = el.querySelectorAll<HTMLElement>("section[data-page]");
    const first = sheets[0];
    if (!first) return;
    const stride = sheets[1] ? sheets[1].offsetTop - first.offsetTop : first.offsetHeight;
    const probe = el.scrollTop + Math.min(160, el.clientHeight / 4) - first.offsetTop;
    const idx = Math.max(0, Math.min(shownPages.length - 1, Math.floor(probe / stride)));
    const page = shownPages[idx];
    if (!page) return;
    const em = first.offsetHeight / 66;
    const row = (probe - idx * stride) / em - 6;
    let occ = page.lines[0]?.occurrenceId ?? null;
    for (const l of page.lines) if (l.row <= row) occ = l.occurrenceId;
    setInView((cur) => (cur === occ ? cur : occ));
  }, [shownPages]);
  const scrollTick = useRef<number | null>(null);
  useEffect(() => {
    updateInView();
  }, [updateInView, zoom]);

  /** Markert tekst i manuset → mulig notat på akkurat de ordene (REQ-0535). */
  function onPagesMouseUp() {
    // Notater festes til den norske teksten; i en annen språkvisning kan ikke markeringen brukes
    if (lang !== "nb") {
      setPendingNote(null);
      return;
    }
    const sel = window.getSelection();
    if (!editable || !sel || sel.isCollapsed || sel.rangeCount === 0) {
      setPendingNote(null);
      return;
    }
    const range = sel.getRangeAt(0);
    const lineOf = (n: Node | null) =>
      (n instanceof Element ? n : n?.parentElement)?.closest<HTMLElement>("[data-line]") ?? null;
    const startLine = lineOf(range.startContainer);
    const endLine = lineOf(range.endContainer);
    const blockId = startLine?.dataset["block"];
    if (!startLine || !endLine || !blockId || endLine.dataset["block"] !== blockId) {
      setPendingNote(null);
      return;
    }
    const block = state.blocks[blockId];
    if (!block) return;
    // Kolonne i linjen: lengden av teksten fra linjens start til punktet
    const col = (line: HTMLElement, node: Node, offset: number) => {
      const r = document.createRange();
      r.setStart(line, 0);
      r.setEnd(node, offset);
      return r.toString().length;
    };
    const lines = shownPages.flatMap((p) =>
      p.lines
        .map((l, i) => ({ key: `${p.number}:${i}`, l }))
        .filter((x) => x.l.blockId === blockId),
    );
    const cols = alignBlockLines(
      block.text,
      lines.map((x) => x.l.text),
    );
    const offsetAt = (key: string | undefined, c: number, isEnd: boolean) => {
      const i = lines.findIndex((x) => x.key === key);
      const row = cols[i];
      if (!row || !row.length) return -1;
      // Start etter siste tegn på linjen = like etter det; slutt i kolonne 0 = før første tegn
      if (isEnd) return c <= 0 ? row[0]! : row[Math.min(c, row.length) - 1]! + 1;
      return c >= row.length ? row[row.length - 1]! + 1 : row[Math.max(0, c)]!;
    };
    let start = offsetAt(
      startLine.dataset["line"],
      col(startLine, range.startContainer, range.startOffset),
      false,
    );
    let end = offsetAt(
      endLine.dataset["line"],
      col(endLine, range.endContainer, range.endOffset),
      true,
    );
    // Ikke start eller slutt midt i et mellomrom
    while (start < end && /\s/.test(block.text[start] ?? "")) start++;
    while (end > start && /\s/.test(block.text[end - 1] ?? "")) end--;
    if (start < 0 || end <= start) {
      setPendingNote(null);
      return;
    }
    const rect = range.getBoundingClientRect();
    end = Math.min(end, start + 5000);
    setPendingNote({
      blockId,
      occurrenceId: startLine.dataset["occ"] ?? "",
      start,
      end,
      // Det markerte huskes, så notatet havner riktig selv om teksten endres mens du skriver
      quote: block.text.slice(start, end),
      x: rect.left,
      y: rect.bottom + 6,
      open: false,
    });
  }

  function savePendingNote(text: string) {
    const p = pendingNote;
    if (!p || !text.trim()) return;
    const block = state.blocks[p.blockId];
    if (!block) return;
    const at = resolveRange(
      { start: p.start, end: p.end, quote: p.quote } as Annotation,
      block.text,
    );
    if (!at.found) {
      setPendingNote({
        ...p,
        error: tk("app-script-script-workspace.error.error.9cbf95fa4a8e"),
      });
      return;
    }
    const err = run(
      {
        type: "AddAnnotations",
        annotations: [
          {
            annotationId: newId<"annotation">(),
            blockId: block.id,
            variantId: null,
            start: at.start,
            end: at.end,
            quote: p.quote,
            text,
            authorName: myName,
          },
        ],
      },
      tk("app-script-script-workspace.err.run.19bffc68c0d6"),
    );
    if (!err) {
      setPendingNote(null);
      window.getSelection()?.removeAllRanges();
      if (!showNotes) setShowNotes(true);
    } else setPendingNote({ ...p, error: err });
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Verktøylinje */}
      <Toolbar overflow="menu">
        <ToolbarGroup priority={9}>
        {productions.length > 1 ? (
          <ProductionPicker state={state} value={productionId} onChange={setProductionId} />
        ) : (
          <span className="text-chrome font-medium text-text-primary">{productions[0]?.name}</span>
        )}
        <ScriptLanguageSelect
          state={state}
          value={lang}
          onChange={setLang}
          label={tk("app-script-script-workspace.workspace.aria-label.ef7efda65221")}
          title={tk("app-script-script-workspace.workspace.title.442aea26253d")}
          testId="script-language-select"
        />
        {langStatus ? (
          <span
            className="whitespace-nowrap text-xs text-text-tertiary"
            title={tk("app-script-script-workspace.workspace.title.ecab89434db5")}
          >
            {tk("app-script-script-workspace.workspace.span.ec47390de436", { translated: String(langStatus.translated), lines: String(langStatus.lines) })}
            {langStatus.review
              ? tk("app-script-script-workspace.workspace.span.048b3ab3de10", { review: String(langStatus.review) })
              : ""}
            {langStatus.uncertain
              ? tk("app-script-script-workspace.workspace.span.a4fa89817a89", { uncertain: String(langStatus.uncertain) })
              : ""}
          </span>
        ) : null}
        </ToolbarGroup>
        {/* ML4: import og fjerning av oversettelse går i «Mer» før språkvelgeren, så valgt språkversjon alltid vises */}
        <ToolbarGroup priority={3}>
        {langStatus && editable ? (
          <ToolbarButton data-testid="translation-import-open" onClick={() => setImportLangOpen(true)}>
            <Languages />
            {tk("r8-translation-import.button")}
          </ToolbarButton>
        ) : null}
        {langStatus && editable && langStatus.translated > 0 ? (
          <ToolbarButton
            onClick={() => setRemoveLangOpen(true)}
            title={tk("app-script-script-workspace.workspace.title.67cc04366e0d")}
          >
            {tk("app-script-script-workspace.workspace.toolbar-button.48dd6b7fbf04")}
          </ToolbarButton>
        ) : null}
        </ToolbarGroup>
        <ToolbarGroup priority={2}>
        {/* ML4: ikonknapp, så verktøylinjen får plass uten «Mer …» ved 1280 px */}
        <IconButton data-testid="language-versions-open" label={tk("ml3-language-versions.button.manage")} onClick={() => setLangVersionsOpen(true)}>
          <Languages />
        </IconButton>
        </ToolbarGroup>
        <ToolbarSeparator />
        <ToolbarGroup priority={7}>
        <IconButton
          onClick={cmds.undo}
          shortcut="⌘Z"
          disabled={!cmds.canUndo}
          title={
            cmds.undoLabel
              ? tk("app-script-script-workspace.workspace.title.9190e6a61a9c", { undoLabel: String(cmds.undoLabel) })
              : tk("app-script-script-workspace.workspace.title.bd4f0744ad84")
          }
          label={
            cmds.undoLabel
              ? tk("app-script-script-workspace.workspace.label.e2cc01325b5b", { undoLabel: String(cmds.undoLabel) })
              : tk("app-script-script-workspace.workspace.label.3362824102ea")
          }
        >
          <Undo2 />
        </IconButton>
        <IconButton
          onClick={cmds.redo}
          shortcut="⇧⌘Z"
          disabled={!cmds.canRedo}
          title={
            cmds.redoLabel
              ? tk("app-script-script-workspace.workspace.title.2c1f264d7e99", { redoLabel: String(cmds.redoLabel) })
              : tk("app-script-script-workspace.workspace.title.6d4e35b2e0a2")
          }
          label={
            cmds.redoLabel
              ? tk("app-script-script-workspace.workspace.label.c39571853125", { redoLabel: String(cmds.redoLabel) })
              : tk("app-script-script-workspace.workspace.label.b6704946a46c")
          }
        >
          <Redo2 />
        </IconButton>
        </ToolbarGroup>
        <ToolbarGroup priority={1}>
        {editable && state.productions[productionId]?.kind !== "main" ? (
          <ToolbarButton
            onClick={() => setAddScenesOpen(true)}
            title={tk("app-script-script-workspace.workspace.title.ab59c5d3bc7e")}
          >
            <ListPlus />
            {tk("app-script-script-workspace.workspace.toolbar-button.61cbc7374b1d")}
          </ToolbarButton>
        ) : editable ? (
          <ToolbarButton
            variant={hasScenes ? "default" : "primary"}
            onClick={() => setImportOpen(true)}
          >
            <FileUp />
            {tk("app-script-script-workspace.workspace.toolbar-button.36d735c429be")}
          </ToolbarButton>
        ) : null}
        {state.productions[productionId]?.kind !== "main" &&
        promotionCandidates(state, productionId).length > 0 ? (
          <ToolbarButton
            onClick={() => setPromoteOpen(true)}
            title={tk("app-script-script-workspace.workspace.title.5e6d7daf8488")}
            aria-label={tk("app-script-script-workspace.workspace.aria-label.476a13ae83e3")}
          >
            <CornerUpLeft />
            <span className="hidden 2xl:inline">{tk("app-script-script-workspace.workspace.span.7e399e2c169f")}</span>
          </ToolbarButton>
        ) : null}
        {hasScenes ? (
          <>
            <ToolbarButton onClick={() => setVersionsOpen(true)}>
              <History />
              {tk("app-script-script-workspace.workspace.toolbar-button.d987ab9929c2")}
            </ToolbarButton>
            <ToolbarButton data-testid="script-export-open" onClick={() => setExportOpen(true)}>
              <Download />
              {tk("app-script-script-workspace.workspace.toolbar-button.5e33b57871b7")}
            </ToolbarButton>
          </>
        ) : null}
        </ToolbarGroup>
        <div data-toolbar-fixed className="ml-auto flex items-center gap-3">
          {others.length ? (
            <div
              className="flex -space-x-1.5"
              aria-label={tk("app-script-script-workspace.workspace.aria-label.d76d7968aeca", { value1: String(others.map((o) => o.name).join(", ")) })}
            >
              {others.slice(0, 5).map((o) => (
                <button
                  key={o.userId}
                  type="button"
                  title={`${o.name}${o.occurrenceId ? tk("app-script-script-workspace.workspace.title.181981dbb0d5") : ""}`}
                  onClick={() =>
                    o.occurrenceId && select({ occurrenceId: o.occurrenceId, blockId: null }, true)
                  }
                  className="flex size-6 items-center justify-center rounded-full border-2 border-surface-2 bg-accent-brand text-[11px] font-semibold text-accent-fg"
                >
                  {initials(o.name)}
                </button>
              ))}
            </div>
          ) : null}
          <SaveIndicator cmds={cmds} />
          {roleKnown && !editable ? (
            <span className="text-xs text-text-tertiary">
              {tk("app-script-script-workspace.workspace.span.7c7941fb9566")}
            </span>
          ) : null}
          {/* Visningsvalg samlet i én meny, så verktøylinjen ikke bryter tekst (UX-gjennomgang DEC-0076) */}
          <Popover>
            <PopoverTrigger asChild>
              <ToolbarButton
                className="gap-1 text-xs"
                title={tk("app-script-script-workspace.workspace.title.e1e017defea2")}
              >
                <SlidersHorizontal className="size-3.5" aria-hidden />
                {tk("app-script-script-workspace.workspace.toolbar-button.1de494e767b5")}
                {onlySelected || !showNotes || !showChanged ? (
                  <>
                    <span className="size-1.5 rounded-full bg-accent-brand" aria-hidden />
                    <span className="sr-only">{tk("app-script-script-workspace.workspace.span.b6b1aad09348")}</span>
                  </>
                ) : null}
                <ChevronDown className="size-3" aria-hidden />
              </ToolbarButton>
            </PopoverTrigger>
            <PopoverContent align="end" className="flex w-60 flex-col gap-2 p-3">
              <label
                className="flex items-center gap-1.5 text-xs text-text-secondary"
                title={tk("app-script-script-workspace.workspace.title.1319d610390c")}
              >
                <input
                  type="checkbox"
                  checked={showNotes}
                  onChange={(e) => setShowNotes(e.target.checked)}
                  className="size-3.5 accent-[var(--accent-brand)]"
                />
                {tk("app-script-script-workspace.workspace.label.ab8687b6461c")}
              </label>
              <label
                className="flex items-center gap-1.5 text-xs text-text-secondary"
                title={tk("app-script-script-workspace.workspace.title.49da193529f4")}
              >
                <input
                  type="checkbox"
                  checked={showChanged}
                  onChange={(e) => setShowChanged(e.target.checked)}
                  className="size-3.5 accent-[var(--accent-brand)]"
                  data-testid="show-changed-marks"
                />
                {tk("app-script-script-workspace.workspace.label.27533df79d71")}
              </label>
              <label
                className="flex items-center gap-1.5 text-xs text-text-secondary"
                title={tk("app-script-script-workspace.workspace.title.dbf1ce70536a")}
              >
                <input
                  type="checkbox"
                  checked={onlySelected}
                  onChange={(e) => {
                    setOnlySelected(e.target.checked);
                    requestAnimationFrame(() => scrollRef.current?.scrollTo({ top: 0 }));
                  }}
                  className="size-3.5 accent-[var(--accent-brand)]"
                />
                {tk("app-script-script-workspace.workspace.label.8676b83317ee")}
              </label>
              <label
                className={
                  "ml-5 flex items-center gap-1.5 text-xs " +
                  (onlySelected ? "text-text-secondary" : "text-text-tertiary")
                }
                title={tk("app-script-script-workspace.workspace.title.f3a9414f12ae")}
              >
                <input
                  type="checkbox"
                  checked={lightReading}
                  disabled={!onlySelected}
                  onChange={(e) => setLightReading(e.target.checked)}
                  className="size-3.5 accent-[var(--accent-brand)]"
                />
                {tk("app-script-script-workspace.workspace.label.68d82f85cc60")}
              </label>
              <label
                className="flex items-center gap-1.5 text-xs text-text-secondary"
                title={tk("app-script-script-workspace.workspace.title.134afc00c999")}
              >
                <Lock className="size-3.5" aria-hidden />
                {tk("app-script-script-workspace.workspace.label.2c75b17c31a9")}
                <Switch
                  checked={lockedPages}
                  onCheckedChange={setLockedPages}
                  className="scale-75"
                  aria-label={tk("app-script-script-workspace.workspace.aria-label.2c75b17c31a9")}
                />
              </label>
            </PopoverContent>
          </Popover>
          <select
            aria-label={tk("app-script-script-workspace.workspace.aria-label.dfae56e1d21c")}
            value={zoomChoice}
            onChange={(e) => setZoom(e.target.value as Zoom)}
            className="h-7 rounded-sm border border-border-control bg-surface-3 px-1.5 text-xs text-text-primary"
          >
            {ZOOMS.map((z) => (
              <option key={z} value={z}>
                {z === "fit"
                  ? tk("app-script-script-workspace.workspace.option.f2f185ef5aa4")
                  : `${Math.round(Number(z) * 100)} %`}
              </option>
            ))}
          </select>
          <span className="tabular shrink-0 whitespace-nowrap text-xs text-text-tertiary">
            {visibleOcc
              ? tk("app-script-script-workspace.workspace.span.446c7442419c", { length: String(shownPages.length), length2: String(pagination.pages.length) })
              : pagination.pages.length}{" "}
            {tk("app-script-script-workspace.workspace.span.b997ee84328e")}
          </span>
        </div>
      </Toolbar>

      {/* Avvist tekst ved samtidig redigering går ikke tapt (KI-182, DEC-0078) */}
      <RejectedTextNotice cmds={cmds} />
      {hasScenes ? (
        <div
          className="grid min-h-0 flex-1"
          style={{ gridTemplateColumns: `${navWidth}px minmax(0,1fr) ${inspWidth}px` }}
        >
          <div className="relative flex min-h-0 flex-col border-r border-border bg-surface-1">
            <PaneResizer
              edge="right"
              size={navWidth}
              onSize={setNavWidth}
              min={200}
              max={520}
              label={tk("app-script-script-workspace.workspace.label.ba59ddc1d352")}
            />
            <SceneNavigator
              state={state}
              productionId={productionId}
              startPages={pagination.sceneStartPage}
              selectedOcc={selection.occurrenceId}
              editable={editable}
              filter={filter}
              onFilterChange={setFilter}
              characters={characters}
              visible={matching}
              presence={presenceByOcc}
              hits={hits}
              noteCounts={showNotes ? noteCounts : null}
              inView={inView}
              structureEditing={structureEditing}
              onStructureEditingChange={setStructureEditing}
              moved={moved}
              movedBaseline={
                latestVersion
                  ? tk("app-script-script-workspace.workspace.moved-baseline.081ba12b8257", { number: String(latestVersion.number) })
                  : null
              }
              onSelect={(id) => select({ occurrenceId: id, blockId: null }, true)}
              onMove={(id, orderKey, label) =>
                run({ type: "MoveOccurrence", occurrenceId: id as never, orderKey }, label)
              }
              onToggleActive={(id, active) =>
                run(
                  { type: "SetOccurrenceActive", occurrenceId: id as never, active },
                  active
                    ? tk("app-script-script-workspace.workspace.run.13fb4ec5bff2")
                    : tk("app-script-script-workspace.workspace.run.785fcc2a05a5"),
                )
              }
            />
          </div>
          <div
            ref={scrollRef}
            tabIndex={0}
            aria-label={tk("app-script-script-workspace.workspace.aria-label.1a39ad059236")}
            onKeyDown={onPagesKey}
            onMouseUp={onPagesMouseUp}
            onContextMenu={(e) => {
              if (!assistAvailable) return;
              const el = (e.target as HTMLElement).closest("[data-block]");
              const id = el?.getAttribute("data-block");
              if (!id) return;
              e.preventDefault();
              const ids = selectedBlockIds();
              setAssistMenu({ x: e.clientX, y: e.clientY, blockIds: ids.includes(id) ? ids : [id] });
            }}
            onScroll={() => {
              setPendingNote((p) => (p && !p.open ? null : p));
              if (scrollTick.current !== null) return;
              scrollTick.current = requestAnimationFrame(() => {
                scrollTick.current = null;
                updateInView();
              });
            }}
            className={
              "relative min-h-0 overflow-auto outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus-ring " +
              (showOnlySelected && lightReading ? "bg-paper" : "bg-bg-app")
            }
          >
            {onlySelected && !selection.occurrenceId ? (
              <p className="px-6 pt-4 text-xs text-text-tertiary">
                {tk("app-script-script-workspace.workspace.p.c6a460464bdf")}
              </p>
            ) : null}
            {visibleOcc && shownPages.length === 0 ? (
              <p className="px-6 pt-6 text-[13px] text-text-secondary">
                {showOnlySelected && !state.occurrences[selection.occurrenceId!]?.active
                  ? tk("app-script-script-workspace.workspace.p.b3243fa495e0")
                  : tk("app-script-script-workspace.workspace.p.f85765d85227")}
              </p>
            ) : null}
            <ScriptPageView
              pages={shownPages}
              state={state}
              selection={selection}
              zoom={zoom}
              onSelect={onPageSelect}
              onActivate={onPageActivate}
              decor={decor}
              onNoteClick={onPageNoteClick}
              changed={showChanged ? changedBlocks : undefined}
              language={langMarks}
              // Valgt scene alene: rett på siden, uten ark og sideskift (DEC-0080)
              flow={showOnlySelected ? { light: lightReading } : undefined}
            />
          </div>
          {pendingNote ? (
            <div
              className="fixed z-40 flex w-[300px] flex-col gap-1.5 border border-note/50 bg-surface-2 p-2 shadow-[var(--shadow-float)]"
              style={{
                left: Math.min(pendingNote.x, window.innerWidth - 316),
                top: Math.min(pendingNote.y, window.innerHeight - 180),
              }}
              onMouseUp={(e) => e.stopPropagation()}
            >
              {pendingNote.open ? (
                <PendingNoteForm
                  quote={pendingNote.quote}
                  error={pendingNote.error}
                  onSave={savePendingNote}
                  onCancel={() => setPendingNote(null)}
                />
              ) : (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => setPendingNote({ ...pendingNote, open: true })}
                >
                  <MessageSquarePlus />
                  {tk("app-script-script-workspace.workspace.button.de441996bb2a")}
                </Button>
              )}
            </div>
          ) : null}
          <div className="relative flex min-h-0 flex-col border-l border-border bg-surface-1">
            <PaneResizer
              edge="left"
              size={inspWidth}
              onSize={setInspWidth}
              min={240}
              max={640}
              label={tk("app-script-script-workspace.workspace.label.f65e02e2f309")}
            />
            {assistAvailable ? (
              <div className="flex h-8 shrink-0 items-center gap-1 border-b border-border px-2 text-[12px]" role="tablist">
                <button type="button" role="tab" aria-selected={rightTab === "inspector"} data-testid="script-tab-inspector" onClick={() => setRightTab("inspector")} className={"rounded-sm px-2 py-0.5 " + (rightTab === "inspector" ? "bg-surface-3 text-text-primary" : "text-text-secondary hover:text-text-primary")}>
                  {tk("app-script-script-workspace.workspace.button.ebd161a4610b")}
                </button>
                <button type="button" role="tab" aria-selected={rightTab === "assist"} data-testid="script-tab-assist" onClick={() => setRightTab("assist")} className={"rounded-sm px-2 py-0.5 " + (rightTab === "assist" ? "bg-surface-3 text-text-primary" : "text-text-secondary hover:text-text-primary")}>
                  {tk("app-script-script-workspace.workspace.button.083015dbb2e5")}
                </button>
              </div>
            ) : null}
            {assistAvailable ? (
              <div className={rightTab === "assist" ? "flex min-h-0 flex-1 flex-col" : "hidden"}>
                <WritingPanel
                  projectId={projectId}
                  state={state}
                  productionId={productionId}
                  selection={selection}
                  editable={editable}
                  cmds={cmds}
                  authorName={myName}
                  getSelectedBlockIds={selectedBlockIds}
                  trigger={assistTrigger}
                  onSelect={(s) => select(s, true)}
                />
              </div>
            ) : null}
            {rightTab === "inspector" || !assistAvailable ? (
            <Inspector
              projectId={projectId}
              state={state}
              productionId={productionId}
              selection={selection}
              editable={editable}
              startPages={pagination.sceneStartPage}
              textRef={textRef}
              run={run}
              onSelect={(s) => select(s, true)}
              onNextUncertain={nextUncertain}
              uncertainCount={uncertainCount}
              structureEditing={structureEditing}
              authorName={myName}
              focusNote={focusNote}
              language={lang}
              cmds={cmds}
            />
            ) : null}
          </div>
        </div>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
          <p className="text-base font-medium text-text-primary">
            {tk("app-script-script-workspace.workspace.p.29928c11a830", { name: String(state.productions[productionId]?.name) })}
          </p>
          {state.productions[productionId]?.kind !== "main" ? (
            <>
              <p className="max-w-[440px] text-[13px] text-text-secondary">
                {tk("app-script-script-workspace.workspace.p.0d1a72ef9f90")}
              </p>
              {editable ? (
                <div className="flex gap-2">
                  <Button onClick={() => setAddScenesOpen(true)}>
                    <ListPlus />
                    {tk("app-script-script-workspace.workspace.button.61cbc7374b1d")}
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => {
                      const occurrenceId = newId<"scene_occurrence">();
                      const e = cmds.run(
                        {
                          type: "CreateScene",
                          productionId: productionId as never,
                          sceneId: newId(),
                          variantId: newId(),
                          occurrenceId,
                          orderKey: keysEvenly(1)[0]!,
                          heading: { intExt: "INT.", location: "NY SCENE", time: "DAG" },
                          blocks: [{ blockId: newId(), kind: "action", text: "", orderKey: "i" }],
                          productionNumber: null,
                        },
                        tk("app-script-script-workspace.e.cmds-run.7bf7f54e70ef"),
                      );
                      if (!e) setSelection({ occurrenceId, blockId: null });
                    }}
                  >
                    <Plus />
                    {tk("app-script-script-workspace.workspace.button.a577d61c554a")}
                  </Button>
                </div>
              ) : null}
            </>
          ) : (
            <>
              <p className="max-w-[420px] text-[13px] text-text-secondary">
                {tk("app-script-script-workspace.workspace.p.17dbe6cfba2b")}
              </p>
              {editable ? (
                <Button onClick={() => setImportOpen(true)}>
                  <FileUp />
                  {tk("app-script-script-workspace.workspace.button.36d735c429be")}
                </Button>
              ) : null}
            </>
          )}
        </div>
      )}

      {assistMenu ? (
        <AssistContextMenu
          x={assistMenu.x}
          y={assistMenu.y}
          onClose={() => setAssistMenu(null)}
          onPick={(action, mode) => {
            const ids = assistMenu.blockIds;
            setAssistMenu(null);
            triggerAssist({ action, blockIds: ids, ...(mode ? { mode } : {}) });
          }}
        />
      ) : null}
      {hasScenes ? (
        <VersionsDialog
          open={versionsOpen}
          onOpenChange={setVersionsOpen}
          projectId={projectId}
          productionId={productionId}
          state={state}
          editable={editable}
          saving={cmds.status.kind === "saving"}
          onRun={cmds.runQueued}
          whenIdle={cmds.whenIdle}
          current={cmds.current}
          onGoToScene={(occurrenceId) => {
            if (state.occurrences[occurrenceId]) select({ occurrenceId, blockId: null }, true);
          }}
        />
      ) : null}
      {hasScenes ? (
        <ExportDialog
          open={exportOpen}
          onOpenChange={setExportOpen}
          state={viewState}
          productionId={productionId}
          lockedPages={lockedPages}
          language={lang}
          sourceState={state}
          languageStatus={langStatus}
          onLanguageChange={setLang}
          {...(editable && schema27
            ? {
                onSaveTitlePage: (lines: readonly string[]) => {
                  const tp = titlePageCommand(state, productionId, lines);
                  if (tp) cmds.runSilent(tp.command, tk("app-script-script-workspace.on-save-title-page.cmds-run-silent.4b33f3c3cbfc"));
                },
              }
            : {})}
        />
      ) : null}
      {langVersionsOpen ? (
        <LanguageVersionsDialog
          open={langVersionsOpen}
          onOpenChange={setLangVersionsOpen}
          state={state}
          productionId={productionId}
          cmds={cmds}
          editable={editable}
        />
      ) : null}
      {removeLangOpen && lang !== "nb" ? (
        <RemoveTranslationsDialog
          open={removeLangOpen}
          onOpenChange={setRemoveLangOpen}
          state={state}
          language={lang}
          cmds={cmds}
        />
      ) : null}
      <TranslationImportDialog
        state={state}
        cmds={cmds}
        productionId={productionId}
        language={lang === "nb" ? "en" : lang}
        open={importLangOpen}
        onOpenChange={setImportLangOpen}
      />
      {promoteOpen ? (
        <PromotionDialog
          state={state}
          cmds={cmds}
          productionId={productionId}
          initialOccurrenceId={selection.occurrenceId}
          editable={editable}
          open
          onOpenChange={setPromoteOpen}
        />
      ) : null}
      <ProductionDialog
        key={`add-${productionId}`}
        state={state}
        cmds={cmds}
        open={addScenesOpen}
        addTo={productionId}
        onOpenChange={setAddScenesOpen}
      />
      {editable ? (
        <ImportDialog
          open={importOpen}
          onOpenChange={setImportOpen}
          projectId={projectId}
          productionId={productionId}
          state={state}
          runAndWait={cmds.runAndWait}
          authorName={myName}
        />
      ) : null}
      {/* Skjult for skjermlesere: varsler om lagring og feil */}
      <span className="sr-only" aria-live="polite">
        {cmds.status.kind === "error" ? cmds.status.message : ""}
      </span>
    </div>
  );
}

interface PendingNote {
  readonly blockId: string;
  readonly occurrenceId: string;
  readonly start: number;
  readonly end: number;
  readonly quote: string;
  /** Skjermposisjon for boksen. */
  readonly x: number;
  readonly y: number;
  readonly open: boolean;
  readonly error?: string;
}

/** Skrivefeltet for et nytt notat har egen tilstand, så manussidene ikke tegnes på nytt for hvert tastetrykk. */
function PendingNoteForm({
  quote,
  error,
  onSave,
  onCancel,
}: {
  quote: string;
  error: string | undefined;
  onSave: (text: string) => void;
  onCancel: () => void;
}) {
  const [text, setText] = useState("");
  return (
    <>
      <p className="truncate text-[11px] italic text-text-tertiary">«{quote}»</p>
      <textarea
        autoFocus
        rows={3}
        maxLength={10000}
        value={text}
        placeholder={tk("app-script-script-workspace.pending-note-form.placeholder.5a426aacadc4")}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) onSave(text);
          if (e.key === "Escape") onCancel();
        }}
        className="rounded-sm border border-border-control bg-surface-3 p-1.5 text-[13px] text-text-primary"
      />
      <div className="flex gap-1.5">
        <Button size="sm" onClick={() => onSave(text)} disabled={!text.trim()}>
          {tk("app-script-script-workspace.pending-note-form.button.7b89e44e9453")}
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>
          {tk("app-script-script-workspace.pending-note-form.button.feb08cc7c905")}
        </Button>
      </div>
      {error ? (
        <p role="alert" className="text-xs text-status-danger">
          {error}
        </p>
      ) : null}
    </>
  );
}

export function SaveIndicator({ cmds }: { cmds: Commands }) {
  const s = cmds.status;
  if (s.kind === "saving")
    return (
      <span className="flex items-center gap-1 text-xs text-text-tertiary" role="status">
        <Loader2 className="size-3 animate-spin" aria-hidden />
        {tk("app-script-script-workspace.save-indicator.span.c775d27e8e0a")}
      </span>
    );
  if (s.kind === "error")
    return (
      <button
        type="button"
        onClick={cmds.clearError}
        className="max-w-[420px] truncate text-left text-xs text-status-danger"
        title={s.message}
        role="alert"
      >
        {s.message}
      </button>
    );
  return <span className="text-xs text-text-tertiary">{tk("app-script-script-workspace.save-indicator.span.76d2d5532927")}</span>;
}
