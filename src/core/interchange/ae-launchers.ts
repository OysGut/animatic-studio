/**
 * PTG3 «dobbeltklikk og åpne»: startfiler i After Effects-pakken. Rene tekster uten nettleser-API.
 * Windows: .bat som finner AfterFX.exe og kjører `AfterFX.exe -r "<full sti>\bygg-after-effects.jsx"`.
 * Mac: .command (kjørbar via unix-modus i ZIP-en) som finner nyeste «Adobe After Effects 20xx» og kjører
 * skriptet med osascript og `DoScriptFile`.
 */

// i18n-ignore: faste filnavn i pakkeformatet (oppdraget)
export const AE_LAUNCHER_WINDOWS = "Åpne i After Effects (Windows).bat";
// i18n-ignore: faste filnavn i pakkeformatet (oppdraget)
export const AE_LAUNCHER_MAC = "Åpne i After Effects (Mac).command";
/** Skriptet startfilene kjører (navnet sier hvilket program det er for). */
export const AE_JSX_FILE = "bygg-after-effects.jsx";
/** rwxr-xr-x for en vanlig fil. */
export const AE_LAUNCHER_MAC_MODE = 0o100755;

/** Første og siste årstall vi leter etter (nyeste først). */
const NEWEST = 2035;
const OLDEST = 2018;

/** Tegn som har egen betydning i cmd-`echo` fjernes, så meldingen alltid kan vises. */
const batSafe = (s: string) => s.replace(/[&<>|^()%!"]/g, "");
/** Doble anførselstegn og omvendte skråstreker fjernes for AppleScript/bash-strenger. */
const shSafe = (s: string) => s.replace(/["'\\$`]/g, "");

/** Innholdet i Windows-startfilen. `notFound`: meldingslinjer (f.eks. nb og en) når AE ikke finnes. */
export function aeWindowsLauncher(notFound: readonly string[]): string {
  const lines = [
    "@echo off",
    "chcp 65001 >nul",
    "setlocal",
    'set "JSX=%~dp0bygg-after-effects.jsx"',
    'set "AE="',
    'if defined PTG_AFTERFX if exist "%PTG_AFTERFX%" set "AE=%PTG_AFTERFX%"',
    `if not defined AE for /L %%Y in (${NEWEST},-1,${OLDEST}) do if not defined AE if exist "%ProgramFiles%\\Adobe\\Adobe After Effects %%Y\\Support Files\\AfterFX.exe" set "AE=%ProgramFiles%\\Adobe\\Adobe After Effects %%Y\\Support Files\\AfterFX.exe"`,
    `if not defined AE for /L %%Y in (${NEWEST},-1,${OLDEST}) do if not defined AE if exist "%ProgramFiles%\\Adobe\\Adobe After Effects CC %%Y\\Support Files\\AfterFX.exe" set "AE=%ProgramFiles%\\Adobe\\Adobe After Effects CC %%Y\\Support Files\\AfterFX.exe"`,
    "if not defined AE (",
    ...notFound.map(l => `  echo ${batSafe(l)}`),
    "  echo.",
    "  pause",
    "  exit /b 1",
    ")",
    'start "" "%AE%" -r "%JSX%"',
    "",
  ];
  return lines.join("\r\n");
}

/** Innholdet i Mac-startfilen. */
export function aeMacLauncher(notFound: readonly string[]): string {
  const msg = notFound.map(shSafe).join(" ");
  return [
    "#!/bin/bash",
    'DIR="$(cd "$(dirname "$0")" && pwd)"',
    'JSX="$DIR/bygg-after-effects.jsx"',
    'APP="${PTG_AFTERFX_APP:-}"',
    'if [ -z "$APP" ]; then',
    '  APP="$(ls -d "/Applications/Adobe After Effects 20"*/"Adobe After Effects 20"*.app 2>/dev/null | sort | tail -n 1)"',
    "fi",
    'if [ -z "$APP" ] || [ ! -d "$APP" ]; then',
    `  echo "${msg}"`,
    `  osascript -e 'display alert "From Pen to Glass" message "'"${msg}"'"' >/dev/null 2>&1`,
    "  exit 1",
    "fi",
    'NAME="$(basename "$APP" .app)"',
    'osascript -e "tell application \\"$NAME\\" to activate" -e "tell application \\"$NAME\\" to DoScriptFile \\"$JSX\\""',
    "",
  ].join("\n");
}
