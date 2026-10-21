/**
 * ML2a: stabile feilkoder fra serveren. Serveren lager fortsatt meldingen på norsk (så gamle klienter og
 * `tm` virker), men feilen bærer også `code` og navngitte `params`. Klienten viser den med
 * `serverErrorText`, som slår opp nøkkelen `server.error.<code>` på valgt språk. Gamle rene tekstmeldinger
 * kjennes igjen mot de norske malene, og ellers brukes `tm` som før.
 * Ren TypeScript uten avhengigheter.
 */
import { type MessageParameters } from "./messages";
import { getUiLanguage, tm } from "./index";
import { t } from './keyed';

/** Kode → [norsk mal, engelsk mal]. Koder endres eller gjenbrukes aldri. */
export const SERVER_ERRORS = {
  invalid_request: ["Ugyldig forespørsel", "Invalid request"], // i18n-ignore: nb/en-par i feilkatalogen
  invalid_project_id: ["Ugyldig prosjekt-ID", "Invalid project ID"], // i18n-ignore: nb/en-par i feilkatalogen
  invalid_command: ["Ugyldig kommando", "Invalid command"], // i18n-ignore: nb/en-par i feilkatalogen
  invalid_revisions: ["Ugyldige revisjoner", "Invalid revisions"], // i18n-ignore: nb/en-par i feilkatalogen
  change_too_large: ["Endringen er for stor", "The change is too large"], // i18n-ignore: nb/en-par i feilkatalogen
  invalid_command_id: ["Ugyldig kommando-ID", "Invalid command ID"], // i18n-ignore: nb/en-par i feilkatalogen
  no_workspace_access: ["Ingen tilgang til gruppen", "No access to the workspace"], // i18n-ignore: nb/en-par i feilkatalogen
  asset_missing: ["Ressursen finnes ikke", "The asset does not exist"], // i18n-ignore: nb/en-par i feilkatalogen
  storage_no_response: ["Lagringen svarte ikke", "The storage did not respond"], // i18n-ignore: nb/en-par i feilkatalogen
  invalid_storage_path: ["Ugyldig lagringssti", "Invalid storage path"], // i18n-ignore: nb/en-par i feilkatalogen
  invalid_script_revision: ["Ugyldig manusrevisjon", "Invalid script revision"], // i18n-ignore: nb/en-par i feilkatalogen
  text_too_long: ["Teksten er for lang (maks {max} tegn)", "The text is too long (max {max} characters)"], // i18n-ignore: nb/en-par i feilkatalogen
} as const satisfies Record<string, readonly [string, string]>;

export type ServerErrorCode = keyof typeof SERVER_ERRORS;

export const serverErrorKey = (code: ServerErrorCode) => `server.error.${code}`;
const ERROR_KEYS = {
  invalid_request: 'server.error.invalid_request', invalid_project_id: 'server.error.invalid_project_id',
  invalid_command: 'server.error.invalid_command', invalid_revisions: 'server.error.invalid_revisions',
  change_too_large: 'server.error.change_too_large', invalid_command_id: 'server.error.invalid_command_id',
  no_workspace_access: 'server.error.no_workspace_access', asset_missing: 'server.error.asset_missing',
  storage_no_response: 'server.error.storage_no_response', invalid_storage_path: 'server.error.invalid_storage_path',
  invalid_script_revision: 'server.error.invalid_script_revision', text_too_long: 'server.error.text_too_long',
} as const satisfies Record<ServerErrorCode, string>;

function tr(code: ServerErrorCode, params: MessageParameters, lang: string) {
  const key = ERROR_KEYS[code];
  return t(key, params, lang);
}

/** Feil med stabil kode. `message` er norsk, slik serveren alltid har svart. */
export class CodedError extends Error {
  constructor(
    readonly code: ServerErrorCode,
    readonly params: MessageParameters = {},
  ) {
    super(tr(code, params, "nb"));
    this.name = "CodedError";
  }
}

/**
 * Gi en eksisterende feil en stabil kode uten å endre teksten (så tekstinventaret og `tm` er uendret).
 * Bruk denne der meldingen allerede står som `L(...)`.
 */
export function withCode<E extends Error>(error: E, code: ServerErrorCode, params: MessageParameters = {}): E & { code: ServerErrorCode; params: MessageParameters } {
  return Object.assign(error, { code, params });
}

/** Lag en feil med stabil kode (kastes på serveren). */
export function serverError(code: ServerErrorCode, params: MessageParameters = {}): CodedError {
  return new CodedError(code, params);
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Finn kode og parametere i en ren norsk melding (gamle svar og feil som har mistet feltene). */
export function decodeServerError(message: string): { code: ServerErrorCode; params: Record<string, string> } | null {
  for (const [code, [n]] of Object.entries(SERVER_ERRORS)) {
    const names: string[] = [];
    const re = new RegExp(
      "^" + escape(n).replace(/\\\{([A-Za-z_]\w*)\\\}/g, (_, name: string) => (names.push(name), "([\\s\\S]+?)")) + "\\.?$",
    );
    const hit = re.exec(message);
    if (hit) return { code: code as ServerErrorCode, params: Object.fromEntries(names.map((name, i) => [name, hit[i + 1] ?? ""])) };
  }
  return null;
}

/** Feilen på valgt språk: kode først, så norsk mal, så `tm` som før. */
export function serverErrorText(error: unknown, lang: string = getUiLanguage()): string {
  const e = error as { code?: unknown; params?: unknown; message?: unknown } | null;
  if (e && typeof e.code === "string" && e.code in SERVER_ERRORS) {
    try {
      return tr(e.code as ServerErrorCode, (e.params ?? {}) as MessageParameters, lang);
    } catch {
      // feil parametere: fall tilbake til meldingen
    }
  }
  const message = typeof e?.message === "string" ? e.message : typeof error === "string" ? error : "";
  const decoded = decodeServerError(message);
  if (decoded) return tr(decoded.code, decoded.params, lang);
  return tm(message);
}
