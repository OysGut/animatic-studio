/** B-110: en header fra gjeldende forespørsel (bare i serverfunksjoner). */
// i18n-ignore-file
import { getRequestHeader } from "@tanstack/react-start/server";

export function requestHeader(name: string): string | undefined {
  return getRequestHeader(name) ?? undefined;
}
