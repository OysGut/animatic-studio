/**
 * Hurtigtastene i arbeidsflatene (UX-prinsipp P7, DESIGN_SYSTEM §6, DEC-0078). Listen beskriver tastene som
 * faktisk er koblet opp i koden (AssemblyWorkspace, Timeline, Stage, ScriptWorkspace, SceneNavigator,
 * use-commands); endres en tast der, må den endres her også (testen shortcuts.test.ts sjekker de viktigste).
 */

export interface Shortcut {
  /** Tastene, slik de vises (hver tast for seg). */
  readonly keys: readonly string[];
  readonly action: string;
  /** Når tasten virker, hvis det ikke er overalt i arbeidsflaten. */
  readonly when?: string;
}

export interface ShortcutGroup {
  readonly id: "alle" | "montering" | "sceneeditor" | "manus";
  readonly title: string;
  readonly shortcuts: readonly Shortcut[];
}

/** Tasten som åpner oversikten (Shift + 7 på norsk tastatur, Shift + / på engelsk). */
export const SHORTCUT_HELP_KEY = "?";

export const SHORTCUT_GROUPS: readonly ShortcutGroup[] = [
  {
    id: "alle",
    title: "Alle arbeidsflater",
    shortcuts: [
      { keys: ["⌘/Ctrl", "Z"], action: "Angre din siste endring" },
      { keys: ["⇧", "⌘/Ctrl", "Z"], action: "Gjør om (også Ctrl + Y)" },
      {
        keys: [SHORTCUT_HELP_KEY],
        action: "Vis hurtigtastene",
        when: "i montering og sceneeditor",
      },
      { keys: ["Esc"], action: "Lukk dialog eller meny" },
    ],
  },
  {
    id: "montering",
    title: "Montering",
    shortcuts: [
      { keys: ["Mellomrom"], action: "Spill av / pause" },
      { keys: ["K"], action: "Spill av / pause" },
      { keys: ["←", "→"], action: "Ett bilde tilbake / fram" },
      { keys: ["⇧", "←/→"], action: "Ett sekund tilbake / fram" },
      { keys: ["↑"], action: "Til starten av scenen, eller forrige scene" },
      { keys: ["↓"], action: "Neste scene" },
      { keys: ["Home"], action: "Til starten av filmen" },
      { keys: ["End"], action: "Til slutten av filmen" },
      { keys: ["⌥/Alt", "←/→"], action: "Flytt valgt scene én plass", when: "når du kan redigere" },
      { keys: ["S"], action: "Del klippet der avspillingshodet står" },
      {
        keys: ["T"],
        action: "Sett tiden for replikken som står for tur",
        when: "under «Synk replikker»",
      },
      { keys: ["Enter"], action: "Åpne valgt scene i sceneeditoren" },
      { keys: ["Delete"], action: "Fjern valgt lydklipp" },
    ],
  },
  {
    id: "sceneeditor",
    title: "Sceneeditor",
    shortcuts: [
      { keys: ["Mellomrom"], action: "Spill av / pause" },
      { keys: ["←", "→"], action: "Ett bilde tilbake / fram", when: "fokus i tidslinjen" },
      { keys: ["⇧", "←/→"], action: "Ti bilder tilbake / fram", when: "fokus i tidslinjen" },
      { keys: ["Home", "End"], action: "Til start / slutt av scenen", when: "fokus i tidslinjen" },
      { keys: ["Delete"], action: "Slett valgt nøkkelbilde", when: "fokus i tidslinjen" },
      {
        keys: ["Piltaster"],
        action: "Flytt valgt lag 1 px (med ⇧: 10 px)",
        when: "fokus på lerretet",
      },
      { keys: ["Delete"], action: "Slett valgt lag", when: "fokus på lerretet" },
      { keys: ["Mellomrom", "dra"], action: "Panorer lerretet", when: "fokus på lerretet" },
      { keys: ["Esc"], action: "Avbryt dra eller tegning av bane" },
    ],
  },
  {
    id: "manus",
    title: "Manus",
    shortcuts: [
      { keys: ["↑", "↓"], action: "Forrige / neste linje", when: "fokus på manussidene" },
      { keys: ["Enter"], action: "Rediger valgt linje", when: "fokus på manussidene" },
      { keys: ["⌘/Ctrl", "Enter"], action: "Lagre teksten du skriver" },
      { keys: ["↑", "↓"], action: "Forrige / neste scene", when: "fokus i scenelisten" },
      {
        keys: ["⌥/Alt", "↑/↓"],
        action: "Flytt scenen",
        when: "scenelisten, med «Endre rekkefølge og synlighet» på",
      },
    ],
  },
];

/** Legger hurtigtasten til et verktøytips: «Spill av (mellomrom)». */
export function withShortcut(label: string, key: string | null | undefined): string {
  return key ? `${label} (${key})` : label;
}

/** Tasten åpner hurtigtastoversikten (uten Ctrl/Cmd/Alt, og ikke mens man skriver). */
export function isShortcutHelpKey(e: {
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
}): boolean {
  return e.key === SHORTCUT_HELP_KEY && !e.metaKey && !e.ctrlKey && !e.altKey;
}
