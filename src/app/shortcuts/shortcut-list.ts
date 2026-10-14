import { L } from "@/core";

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

/** Teksten velges når den vises, så listen følger gjeldende språk (norsk eller engelsk). */
function shortcut(
  keys: readonly string[] | (() => readonly string[]),
  action: () => string,
  when?: () => string,
): Shortcut {
  return {
    get keys() {
      return typeof keys === "function" ? keys() : keys;
    },
    get action() {
      return action();
    },
    ...(when
      ? {
          get when() {
            return when();
          },
        }
      : {}),
  };
}

function group(
  id: ShortcutGroup["id"],
  title: () => string,
  shortcuts: readonly Shortcut[],
): ShortcutGroup {
  return {
    id,
    get title() {
      return title();
    },
    shortcuts,
  };
}

export const SHORTCUT_GROUPS: readonly ShortcutGroup[] = [
  // i18n-ignore
  group("alle", () => L("Alle arbeidsflater", "All workspaces"), [
    shortcut(["⌘/Ctrl", "Z"], () => L("Angre din siste endring", "Undo your last change")),
    shortcut(["⇧", "⌘/Ctrl", "Z"], () => L("Gjør om (også Ctrl + Y)", "Redo (also Ctrl + Y)")),
    shortcut(
      [SHORTCUT_HELP_KEY],
      () => L("Vis hurtigtastene", "Show keyboard shortcuts"),
      () => L("i montering og sceneeditor", "in assembly and scene editor"),
    ),
    shortcut(["Esc"], () => L("Lukk dialog eller meny", "Close dialog or menu")),
  ]),
  group("montering", () => L("Montering", "Assembly"), [
    shortcut(
      () => [L("Mellomrom", "Space")],
      () => L("Spill av / pause", "Play / pause"),
    ),
    shortcut(["K"], () => L("Spill av / pause", "Play / pause")),
    shortcut(["←", "→"], () => L("Ett bilde tilbake / fram", "One frame back / forward")),
    shortcut(["⇧", "←/→"], () => L("Ett sekund tilbake / fram", "One second back / forward")),
    shortcut(["↑"], () =>
      L(
        "Til starten av scenen, eller forrige scene",
        "To the start of the scene, or the previous scene",
      ),
    ),
    shortcut(["↓"], () => L("Neste scene", "Next scene")),
    shortcut(["Home"], () => L("Til starten av filmen", "To the start of the film")),
    shortcut(["End"], () => L("Til slutten av filmen", "To the end of the film")),
    shortcut(
      ["⌥/Alt", "←/→"],
      () => L("Flytt valgt scene én plass", "Move the selected scene one place"),
      () => L("når du kan redigere", "when you can edit"),
    ),
    shortcut(["S"], () =>
      L("Del klippet der avspillingshodet står", "Split the clip at the playhead"),
    ),
    shortcut(
      ["T"],
      () =>
        L(
          "Sett tiden for replikken som står for tur",
          "Set the time for the line whose turn it is",
        ),
      () => L("under «Synk replikker»", "under “Sync lines”"),
    ),
    shortcut(["Enter"], () =>
      L("Åpne valgt scene i sceneeditoren", "Open the selected scene in the scene editor"),
    ),
    shortcut(["Delete"], () => L("Fjern valgt lydklipp", "Remove the selected audio clip")),
  ]),
  group("sceneeditor", () => L("Sceneeditor", "Scene editor"), [
    shortcut(
      () => [L("Mellomrom", "Space")],
      () => L("Spill av / pause", "Play / pause"),
    ),
    shortcut(
      ["←", "→"],
      () => L("Ett bilde tilbake / fram", "One frame back / forward"),
      () => L("fokus i tidslinjen", "focus in the timeline"),
    ),
    shortcut(
      ["⇧", "←/→"],
      () => L("Ti bilder tilbake / fram", "Ten frames back / forward"),
      () => L("fokus i tidslinjen", "focus in the timeline"),
    ),
    shortcut(
      ["Home", "End"],
      () => L("Til start / slutt av scenen", "To start / end of the scene"),
      () => L("fokus i tidslinjen", "focus in the timeline"),
    ),
    shortcut(
      ["Delete"],
      () => L("Slett valgt nøkkelbilde", "Delete the selected keyframe"),
      () => L("fokus i tidslinjen", "focus in the timeline"),
    ),
    shortcut(
      () => [L("Piltaster", "Arrow keys")],
      () =>
        L("Flytt valgt lag 1 px (med ⇧: 10 px)", "Move the selected layer 1 px (with ⇧: 10 px)"),
      () => L("fokus på lerretet", "focus on the canvas"),
    ),
    shortcut(
      ["Delete"],
      () => L("Slett valgt lag", "Delete the selected layer"),
      () => L("fokus på lerretet", "focus on the canvas"),
    ),
    shortcut(
      () => [L("Mellomrom", "Space"), L("dra", "drag")],
      () => L("Panorer lerretet", "Pan the canvas"),
      () => L("fokus på lerretet", "focus on the canvas"),
    ),
    shortcut(["Esc"], () =>
      L("Avbryt dra eller tegning av bane", "Cancel dragging or drawing a path"),
    ),
  ]),
  group("manus", () => L("Manus", "Script"), [
    shortcut(
      ["↑", "↓"],
      () => L("Forrige / neste linje", "Previous / next line"),
      () => L("fokus på manussidene", "focus on the script pages"),
    ),
    shortcut(
      ["Enter"],
      () => L("Rediger valgt linje", "Edit the selected line"),
      () => L("fokus på manussidene", "focus on the script pages"),
    ),
    shortcut(["⌘/Ctrl", "Enter"], () =>
      L("Lagre teksten du skriver", "Save the text you are writing"),
    ),
    shortcut(
      ["↑", "↓"],
      () => L("Forrige / neste scene", "Previous / next scene"),
      () => L("fokus i scenelisten", "focus in the scene list"),
    ),
    shortcut(
      ["⌥/Alt", "↑/↓"],
      () => L("Flytt scenen", "Move the scene"),
      () =>
        L(
          "scenelisten, med «Endre rekkefølge og synlighet» på",
          "the scene list, with “Change order and visibility” turned on",
        ),
    ),
  ]),
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
