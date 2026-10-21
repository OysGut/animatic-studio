
import { t } from "@/core/i18n/keyed";

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
  group("alle", () => t("app-shortcuts-shortcut-list.shortcut-groups.group.4a0fe4864f0e"), [
    shortcut(["⌘/Ctrl", "Z"], () => t("app-shortcuts-shortcut-list.shortcut-groups.shortcut.672fece39828")),
    shortcut(["⇧", "⌘/Ctrl", "Z"], () => t("app-shortcuts-shortcut-list.shortcut-groups.shortcut.0a517bf7a43f")),
    shortcut(
      [SHORTCUT_HELP_KEY],
      () => t("app-shortcuts-shortcut-list.shortcut-groups.shortcut.b8c21a5b3b5d"),
      () => t("app-shortcuts-shortcut-list.shortcut-groups.shortcut.347d8951a527"),
    ),
    shortcut(["Esc"], () => t("app-shortcuts-shortcut-list.shortcut-groups.shortcut.3e9fe2e71960")),
    shortcut(["⌘/Ctrl", "⇧", "F"], () => t("app-shortcuts-shortcut-list.shortcut-groups.shortcut.05522d505d90")),
  ]),
  group("montering", () => t("app-shortcuts-shortcut-list.shortcut-groups.group.ee161e61156f"), [
    shortcut(
      () => [t("app-shortcuts-shortcut-list.shortcut-groups.shortcut.e4cb52284a42")],
      () => t("app-shortcuts-shortcut-list.shortcut-groups.shortcut.379bfc38382c"),
    ),
    shortcut(["K"], () => t("app-shortcuts-shortcut-list.shortcut-groups.shortcut.379bfc38382c.2")),
    shortcut(["←", "→"], () => t("app-shortcuts-shortcut-list.shortcut-groups.shortcut.c2fc9f6cd1bb")),
    shortcut(["⇧", "←/→"], () => t("app-shortcuts-shortcut-list.shortcut-groups.shortcut.2bca7bf47cad")),
    shortcut(["↑"], () =>
      t("app-shortcuts-shortcut-list.shortcut-groups.shortcut.48b8b9c2a394"),
    ),
    shortcut(["↓"], () => t("app-shortcuts-shortcut-list.shortcut-groups.shortcut.7afaa200d59c")),
    shortcut(["Home"], () => t("app-shortcuts-shortcut-list.shortcut-groups.shortcut.1298e8686626")),
    shortcut(["End"], () => t("app-shortcuts-shortcut-list.shortcut-groups.shortcut.478d69ac346d")),
    shortcut(
      ["⌥/Alt", "←/→"],
      () => t("app-shortcuts-shortcut-list.shortcut-groups.shortcut.da8984442944"),
      () => t("app-shortcuts-shortcut-list.shortcut-groups.shortcut.86270d47db2d"),
    ),
    shortcut(["S"], () =>
      t("app-shortcuts-shortcut-list.shortcut-groups.shortcut.f87ce5770352"),
    ),
    shortcut(
      ["T"],
      () =>
        t("app-shortcuts-shortcut-list.shortcut-groups.shortcut.e4696fac3886"),
      () => t("app-shortcuts-shortcut-list.shortcut-groups.shortcut.34791d02cc98"),
    ),
    shortcut(["Enter"], () =>
      t("app-shortcuts-shortcut-list.shortcut-groups.shortcut.d5a28a93fc67"),
    ),
    shortcut(["Delete"], () => t("app-shortcuts-shortcut-list.shortcut-groups.shortcut.41919e9e8c8e")),
  ]),
  group("sceneeditor", () => t("app-shortcuts-shortcut-list.shortcut-groups.group.4b7bf6dc0072"), [
    shortcut(
      () => [t("app-shortcuts-shortcut-list.shortcut-groups.shortcut.e4cb52284a42.2")],
      () => t("app-shortcuts-shortcut-list.shortcut-groups.shortcut.379bfc38382c.3"),
    ),
    shortcut(
      ["←", "→"],
      () => t("app-shortcuts-shortcut-list.shortcut-groups.shortcut.c2fc9f6cd1bb.2"),
      () => t("app-shortcuts-shortcut-list.shortcut-groups.shortcut.52dbd1e448c4"),
    ),
    shortcut(
      ["⇧", "←/→"],
      () => t("app-shortcuts-shortcut-list.shortcut-groups.shortcut.340ebb34b657"),
      () => t("app-shortcuts-shortcut-list.shortcut-groups.shortcut.52dbd1e448c4.2"),
    ),
    shortcut(
      ["Home", "End"],
      () => t("app-shortcuts-shortcut-list.shortcut-groups.shortcut.a707f7e5d53d"),
      () => t("app-shortcuts-shortcut-list.shortcut-groups.shortcut.52dbd1e448c4.3"),
    ),
    shortcut(
      ["Delete"],
      () => t("app-shortcuts-shortcut-list.shortcut-groups.shortcut.ee943e1daaad"),
      () => t("app-shortcuts-shortcut-list.shortcut-groups.shortcut.52dbd1e448c4.4"),
    ),
    shortcut(
      () => [t("app-shortcuts-shortcut-list.shortcut-groups.shortcut.0ebfb0514109")],
      () =>
        t("app-shortcuts-shortcut-list.shortcut-groups.shortcut.249a5a94e40c"),
      () => t("app-shortcuts-shortcut-list.shortcut-groups.shortcut.d11ef1468a0d"),
    ),
    shortcut(
      ["Delete"],
      () => t("app-shortcuts-shortcut-list.shortcut-groups.shortcut.61f8a55ad6ab"),
      () => t("app-shortcuts-shortcut-list.shortcut-groups.shortcut.d11ef1468a0d.2"),
    ),
    shortcut(
      () => [t("app-shortcuts-shortcut-list.shortcut-groups.shortcut.e4cb52284a42.3"), t("app-shortcuts-shortcut-list.shortcut-groups.shortcut.258ae7bc2644")],
      () => t("app-shortcuts-shortcut-list.shortcut-groups.shortcut.e65cb72da1c6"),
      () => t("app-shortcuts-shortcut-list.shortcut-groups.shortcut.d11ef1468a0d.3"),
    ),
    shortcut(["Esc"], () =>
      t("app-shortcuts-shortcut-list.shortcut-groups.shortcut.b657f94a7795"),
    ),
  ]),
  group("manus", () => t("app-shortcuts-shortcut-list.shortcut-groups.group.85cdc9f27401"), [
    shortcut(
      ["↑", "↓"],
      () => t("app-shortcuts-shortcut-list.shortcut-groups.shortcut.301156308449"),
      () => t("app-shortcuts-shortcut-list.shortcut-groups.shortcut.e68923e2b5c4"),
    ),
    shortcut(
      ["Enter"],
      () => t("app-shortcuts-shortcut-list.shortcut-groups.shortcut.4f3eef032509"),
      () => t("app-shortcuts-shortcut-list.shortcut-groups.shortcut.e68923e2b5c4.2"),
    ),
    shortcut(["⌘/Ctrl", "Enter"], () =>
      t("app-shortcuts-shortcut-list.shortcut-groups.shortcut.19f45e3c83ab"),
    ),
    shortcut(
      ["↑", "↓"],
      () => t("app-shortcuts-shortcut-list.shortcut-groups.shortcut.9d89cc71bd58"),
      () => t("app-shortcuts-shortcut-list.shortcut-groups.shortcut.cda78a8c5566"),
    ),
    shortcut(
      ["⌥/Alt", "↑/↓"],
      () => t("app-shortcuts-shortcut-list.shortcut-groups.shortcut.46cf3fd99e27"),
      () =>
        t("app-shortcuts-shortcut-list.shortcut-groups.shortcut.958943b6b4cc"),
    ),
    shortcut(
      ["⌥/Alt", "⇧", "R"],
      () => t("app-shortcuts-shortcut-list.shortcut-groups.shortcut.8e3a233bffb7"),
      () => t("app-shortcuts-shortcut-list.shortcut-groups.shortcut.e68923e2b5c4.3"),
    ),
    shortcut(
      ["⌥/Alt", "⇧", "N"],
      () => t("app-shortcuts-shortcut-list.shortcut-groups.shortcut.c23db520d8dc"),
      () => t("app-shortcuts-shortcut-list.shortcut-groups.shortcut.e68923e2b5c4.4"),
    ),
    shortcut(
      ["⌥/Alt", "⇧", "F"],
      () => t("app-shortcuts-shortcut-list.shortcut-groups.shortcut.1169c9d07875"),
      () => t("app-shortcuts-shortcut-list.shortcut-groups.shortcut.e68923e2b5c4.5"),
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
