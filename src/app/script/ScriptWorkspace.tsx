/**
 * Arbeidsflaten «Manus» (M2): import, sidevisning, scenenavigator, korrigering og redigering med angre.
 * Manus og film bygger på samme aktive struktur (INV-01); alt her er kommandoer mot domenekjernen.
 */
import {
  Download,
  FileUp,
  History,
  Loader2,
  Lock,
  MessageSquarePlus,
  Redo2,
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
import {
  assetNames,
  allAssetUsage,
  charactersInProduction,
  filterPages,
  isFilterActive,
  mainProduction,
  matchingOccurrences,
  alignBlockLines,
  annotationsByVariant,
  movedOccurrences,
  newId,
  pageDecorations,
  resolveRange,
  searchHits,
  type Annotation,
  nameKey,
  orderedOccurrences,
  scriptPages,
  scriptView,
  sortedAssets,
  type ProjectState,
  type SceneFilter,
} from "@/core";
import { canEdit, useMembers, useProfiles, useProjectState } from "@/app/project/use-project";
import { initials, usePresence, type PresentUser } from "@/app/project/use-presence";
import { useCommands, type Commands } from "@/app/project/use-commands";
import { useVersionList, useVersionSnapshot } from "@/app/project/use-versions";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { ExportDialog } from "./ExportDialog";
import { ImportDialog } from "./ImportDialog";
import { VersionsDialog } from "./VersionsDialog";
import { Inspector } from "./Inspector";
import { SceneNavigator, type CharacterOption } from "./SceneNavigator";
import { ScriptPageView, type Selection } from "./ScriptPageView";

const ZOOMS = ["fit", "0.75", "1", "1.25", "1.5"] as const;
type Zoom = (typeof ZOOMS)[number];
const PAGE_PX = 51 * 16; // sidebredde ved 100 %

export function ScriptWorkspace({
  projectId,
  userId,
  initialOccurrenceId = null,
}: {
  projectId: string;
  userId: string;
  /** Scene som skal være valgt når manuset åpnes (f.eks. fra ressursbiblioteket). */
  initialOccurrenceId?: string | null;
}) {
  const query = useProjectState(projectId);
  const members = useMembers(projectId);
  const role = members.data?.find((m) => m.user_id === userId)?.role;
  const editable = canEdit(role);
  const cmds = useCommands(projectId, userId, editable);

  if (query.isLoading) return <p className="p-6 text-[13px] text-text-tertiary">Henter manus …</p>;
  if (query.isError || !query.data)
    return (
      <div role="alert" className="p-6 text-[13px] text-status-danger">
        Manuset kunne ikke hentes.
        {query.error ? (
          <p className="mt-2 font-mono text-xs text-text-tertiary">
            Teknisk detalj: {query.error.message}
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
}: {
  state: ProjectState;
  projectId: string;
  editable: boolean;
  roleKnown: boolean;
  cmds: Commands;
  userId: string;
  initialOccurrenceId: string | null;
}) {
  const productions = useMemo(
    () =>
      Object.values(state.productions).sort((a, b) =>
        a.kind === "main" ? -1 : b.kind === "main" ? 1 : a.name.localeCompare(b.name, "nb"),
      ),
    [state.productions],
  );
  const initialOcc = initialOccurrenceId ? state.occurrences[initialOccurrenceId] : undefined;
  const [productionId, setProductionId] = useState<string>(
    () => initialOcc?.productionId ?? mainProduction(state)?.id ?? productions[0]?.id ?? "",
  );
  const [selection, setSelection] = useState<Selection>({
    occurrenceId: initialOcc?.id ?? null,
    blockId: null,
  });
  const [lockedPages, setLockedPages] = useState(true);
  const [zoomChoice, setZoom] = useState<Zoom>("fit");
  const [fitZoom, setFitZoom] = useState(1);
  const [importOpen, setImportOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [versionsOpen, setVersionsOpen] = useState(false);
  // Visningsvalg (REQ-0531, REQ-0073–0075): endrer aldri produksjonen
  const [onlySelected, setOnlySelected] = useState(false);
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
  const myName = me.data?.[userId]?.display_name || "Medlem";
  const others = usePresence(
    projectId,
    userId,
    me.data?.[userId]?.display_name || "Medlem",
    selection.occurrenceId,
  );
  const presenceByOcc = useMemo(() => {
    const m = new Map<string, PresentUser[]>();
    for (const o of others)
      if (o.occurrenceId) m.set(o.occurrenceId, [...(m.get(o.occurrenceId) ?? []), o]);
    return m;
  }, [others]);

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
    () => scriptPages(state, productionId, { lockedPages }),
    [state, productionId, lockedPages],
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
  const matching = useMemo(
    () => (isFilterActive(filter) ? matchingOccurrences(state, productionId, filter) : null),
    [state, productionId, filter],
  );
  const showOnlySelected = onlySelected && selection.occurrenceId !== null;
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
    () => pageDecorations(shownPages, state, { query, notes: showNotes }),
    [shownPages, state, query, showNotes],
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
  // Åpnet med en valgt scene: vis den når sidene er tegnet
  useEffect(() => {
    if (initialOcc) setTimeout(() => scrollTo({ occurrenceId: initialOcc.id, blockId: null }), 60);
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
      setPendingNote({ ...p, error: "Teksten er endret mens du skrev – merk ordene på nytt." });
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
      "Nytt notat",
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
      <div className="flex h-10 shrink-0 items-center gap-2 border-b border-border bg-surface-2 px-3">
        {productions.length > 1 ? (
          <select
            aria-label="Produksjon"
            value={productionId}
            onChange={(e) => {
              setProductionId(e.target.value);
              setSelection({ occurrenceId: null, blockId: null });
            }}
            className="h-7 rounded-sm border border-border-control bg-surface-3 px-2 text-[13px] text-text-primary"
          >
            {productions.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        ) : (
          <span className="text-[13px] font-medium text-text-primary">{productions[0]?.name}</span>
        )}
        <div className="mx-1 h-5 w-px bg-border" aria-hidden />
        <Button
          size="sm"
          variant="ghost"
          onClick={cmds.undo}
          disabled={!cmds.canUndo}
          title={cmds.undoLabel ? `Angre: ${cmds.undoLabel} (⌘Z)` : "Angre (⌘Z)"}
          aria-label={cmds.undoLabel ? `Angre: ${cmds.undoLabel}` : "Angre"}
        >
          <Undo2 />
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={cmds.redo}
          disabled={!cmds.canRedo}
          title={cmds.redoLabel ? `Gjør om: ${cmds.redoLabel} (⇧⌘Z)` : "Gjør om (⇧⌘Z)"}
          aria-label={cmds.redoLabel ? `Gjør om: ${cmds.redoLabel}` : "Gjør om"}
        >
          <Redo2 />
        </Button>
        {editable ? (
          <Button size="sm" variant="secondary" onClick={() => setImportOpen(true)}>
            <FileUp />
            Importer manus
          </Button>
        ) : null}
        {hasScenes ? (
          <>
            <Button size="sm" variant="ghost" onClick={() => setVersionsOpen(true)}>
              <History />
              Versjoner
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setExportOpen(true)}>
              <Download />
              Eksporter
            </Button>
          </>
        ) : null}
        <div className="ml-auto flex items-center gap-3">
          {others.length ? (
            <div
              className="flex -space-x-1.5"
              aria-label={`Også her nå: ${others.map((o) => o.name).join(", ")}`}
            >
              {others.slice(0, 5).map((o) => (
                <button
                  key={o.userId}
                  type="button"
                  title={`${o.name}${o.occurrenceId ? " – se hvor" : ""}`}
                  onClick={() =>
                    o.occurrenceId && select({ occurrenceId: o.occurrenceId, blockId: null }, true)
                  }
                  className="flex size-6 items-center justify-center rounded-full border-2 border-surface-2 bg-accent-brand text-[10px] font-semibold text-accent-fg"
                >
                  {initials(o.name)}
                </button>
              ))}
            </div>
          ) : null}
          <SaveIndicator cmds={cmds} />
          <label
            className="flex items-center gap-1.5 text-xs text-text-secondary"
            title="Vis eller skjul notater i manuset (REQ-0538)"
          >
            <input
              type="checkbox"
              checked={showNotes}
              onChange={(e) => setShowNotes(e.target.checked)}
              className="size-3.5 accent-[var(--accent-brand)]"
            />
            Vis notater
          </label>
          <label
            className="flex items-center gap-1.5 text-xs text-text-secondary"
            title="Vis bare scenen som er valgt i scenelisten. Endrer ikke filmen."
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
            Vis kun valgt scene
          </label>
          {roleKnown && !editable ? (
            <span className="text-xs text-text-tertiary">Bare lesetilgang</span>
          ) : null}
          <label
            className="flex items-center gap-1.5 text-xs text-text-secondary"
            title="Følg originalens sideskift for importert tekst (låste sider)"
          >
            <Lock className="size-3.5" aria-hidden />
            Låste sider
            <Switch
              checked={lockedPages}
              onCheckedChange={setLockedPages}
              className="scale-75"
              aria-label="Låste sider"
            />
          </label>
          <select
            aria-label="Zoom"
            value={zoomChoice}
            onChange={(e) => setZoom(e.target.value as Zoom)}
            className="h-7 rounded-sm border border-border-control bg-surface-3 px-1.5 text-xs text-text-primary"
          >
            {ZOOMS.map((z) => (
              <option key={z} value={z}>
                {z === "fit" ? "Tilpass bredde" : `${Math.round(Number(z) * 100)} %`}
              </option>
            ))}
          </select>
          <span className="tabular text-xs text-text-tertiary">
            {visibleOcc
              ? `${shownPages.length} av ${pagination.pages.length}`
              : pagination.pages.length}{" "}
            sider
          </span>
        </div>
      </div>

      {hasScenes ? (
        <div className="grid min-h-0 flex-1 grid-cols-[280px_minmax(0,1fr)_320px]">
          <div className="flex min-h-0 flex-col border-r border-border bg-surface-1">
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
              movedBaseline={latestVersion ? `versjon ${latestVersion.number}` : null}
              onSelect={(id) => select({ occurrenceId: id, blockId: null }, true)}
              onMove={(id, orderKey, label) =>
                run({ type: "MoveOccurrence", occurrenceId: id as never, orderKey }, label)
              }
              onToggleActive={(id, active) =>
                run(
                  { type: "SetOccurrenceActive", occurrenceId: id as never, active },
                  active ? "Aktiver scene" : "Deaktiver scene",
                )
              }
            />
          </div>
          <div
            ref={scrollRef}
            tabIndex={0}
            aria-label="Manussider. Pil opp og ned velger linje, Enter redigerer."
            onKeyDown={onPagesKey}
            onMouseUp={onPagesMouseUp}
            onScroll={() => {
              setPendingNote((p) => (p && !p.open ? null : p));
              if (scrollTick.current !== null) return;
              scrollTick.current = requestAnimationFrame(() => {
                scrollTick.current = null;
                updateInView();
              });
            }}
            className="relative min-h-0 overflow-auto bg-bg-app outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus-ring"
          >
            {onlySelected && !selection.occurrenceId ? (
              <p className="px-6 pt-4 text-xs text-text-tertiary">
                «Vis kun valgt scene» er på – velg en scene i listen til venstre. Hele manuset vises
                til da.
              </p>
            ) : null}
            {visibleOcc && shownPages.length === 0 ? (
              <p className="px-6 pt-6 text-[13px] text-text-secondary">
                {showOnlySelected && !state.occurrences[selection.occurrenceId!]?.active
                  ? "Den valgte scenen er deaktivert og står derfor ikke på manussidene. Slå den på i listen (med «Endre rekkefølge og synlighet») for å se den."
                  : "Ingen aktive scener passer med filteret. Deaktiverte scener vises ikke på sidene."}
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
                  Legg til notat
                </Button>
              )}
            </div>
          ) : null}
          <div className="flex min-h-0 flex-col border-l border-border bg-surface-1">
            <Inspector
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
            />
          </div>
        </div>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
          <p className="text-base font-medium text-text-primary">
            Ingen scener i «{state.productions[productionId]?.name}» ennå
          </p>
          <p className="max-w-[420px] text-[13px] text-text-secondary">
            Importer manuset som PDF (for eksempel fra Final Draft) eller Word. Du ser en
            forhåndsvisning før noe lagres, og importen kan angres.
          </p>
          {editable ? (
            <Button onClick={() => setImportOpen(true)}>
              <FileUp />
              Importer manus
            </Button>
          ) : null}
        </div>
      )}

      {hasScenes ? (
        <VersionsDialog
          open={versionsOpen}
          onOpenChange={setVersionsOpen}
          projectId={projectId}
          productionId={productionId}
          state={state}
          editable={editable}
          saving={cmds.status.kind === "saving"}
          onGoToScene={(occurrenceId) => {
            if (state.occurrences[occurrenceId]) select({ occurrenceId, blockId: null }, true);
          }}
        />
      ) : null}
      {hasScenes ? (
        <ExportDialog
          open={exportOpen}
          onOpenChange={setExportOpen}
          state={state}
          productionId={productionId}
          lockedPages={lockedPages}
        />
      ) : null}
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
        placeholder="Skriv notatet …"
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) onSave(text);
          if (e.key === "Escape") onCancel();
        }}
        className="rounded-sm border border-border-control bg-surface-3 p-1.5 text-[13px] text-text-primary"
      />
      <div className="flex gap-1.5">
        <Button size="sm" onClick={() => onSave(text)} disabled={!text.trim()}>
          Lagre notat
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>
          Avbryt
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
        Lagrer …
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
  return <span className="text-xs text-text-tertiary">Lagret</span>;
}
