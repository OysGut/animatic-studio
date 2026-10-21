/**
 * B-109 (migrasjon 0075): om tjenesten tar imot nye kontoer. Statusen gir bare `open` og en valgfri melding.
 * Før migrasjonen (eller ved feil) regnes registreringen som åpen; databasen håndhever uansett stengingen.
 */
import { db } from "./client";

export interface RegistrationStatus {
  readonly open: boolean;
  readonly message: string | null;
}

export interface RegistrationSettings extends RegistrationStatus {
  readonly changedAt: string | null;
  readonly changedByName: string | null;
}

const str = (v: unknown) => (typeof v === "string" && v.trim() ? v : null);

export async function fetchRegistrationStatus(): Promise<RegistrationStatus> {
  const { data, error } = await db.rpc("registration_status", {});
  if (error || !data || typeof data !== "object") return { open: true, message: null };
  const d = data as Record<string, unknown>;
  return { open: d["open"] !== false, message: d["open"] === false ? str(d["message"]) : null };
}

/** Bare for administrator. null = ukjent (før migrasjonen eller ingen tilgang). */
export async function fetchRegistrationSettings(): Promise<RegistrationSettings | null> {
  const { data, error } = await db.rpc("admin_registration_settings", {});
  if (error || !data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;
  return {
    open: d["open"] !== false,
    message: str(d["message"]),
    changedAt: str(d["changed_at"]),
    changedByName: str(d["changed_by_name"]),
  };
}

export async function setRegistrationOpen(open: boolean, message: string | null): Promise<boolean> {
  const { error } = await db.rpc("set_registration_open", { p_open: open, p_message: message });
  return !error;
}

/**
 * Sann når en innloggingsfeil skyldes stengt registrering: triggeren (SQLSTATE PTG01) gir «Database error
 * saving new user» fra innloggingstjenesten, og shouldCreateUser: false gir «Signups not allowed».
 */
export function isRegistrationClosedError(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes("registration_closed") ||
    m.includes("database error saving new user") ||
    m.includes("signups not allowed") ||
    m.includes("signup is disabled") ||
    m.includes("signups are disabled")
  );
}
