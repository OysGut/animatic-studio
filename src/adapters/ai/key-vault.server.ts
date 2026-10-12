/**
 * Kryptering av brukernes API-nøkler (DEC-0069, REQ-0413, secure-development). BARE PÅ SERVEREN – importeres
 * dynamisk inne i serverfunksjonene, aldri fra nettleserkode.
 *
 * - AES-256-GCM (WebCrypto) med tilfeldig 96-biters IV per nøkkel og autentiseringsmerke.
 * - Tilleggsdata (AAD) binder chifferet til raden: bruker, leverandør og rad-ID. Et chiffer kan derfor ikke
 *   flyttes til en annen bruker eller leverandør.
 * - Hovednøkkelen: hemmeligheten ANIMATIC_KEY_ENCRYPTION_KEY (32 byte, base64) hvis den finnes i Lovable
 *   Cloud (versjon 2). Ellers avledes en nøkkel med HKDF-SHA-256 fra SUPABASE_SERVICE_ROLE_KEY, som allerede
 *   er en serverhemmelighet (versjon 1). Byttes hovednøkkelen, må nøklene legges inn på nytt.
 * - Klartekstnøkkelen returneres aldri til nettleseren, logges aldri og lagres ikke andre steder.
 */

const enc = new TextEncoder();

function b64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000)
    s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

function unb64(s: string): Uint8Array {
  return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
}

/** Hovednøkkelen for en versjon, eller en feilmelding. */
async function masterKey(version: number): Promise<CryptoKey> {
  if (version === 2) {
    const raw = process.env["ANIMATIC_KEY_ENCRYPTION_KEY"];
    if (!raw) throw new Error("Hovednøkkelen (ANIMATIC_KEY_ENCRYPTION_KEY) mangler på serveren.");
    const bytes = unb64(raw.trim());
    if (bytes.length !== 32)
      throw new Error("ANIMATIC_KEY_ENCRYPTION_KEY må være 32 byte (base64).");
    return crypto.subtle.importKey("raw", bytes as unknown as ArrayBuffer, "AES-GCM", false, [
      "encrypt",
      "decrypt",
    ]);
  }
  if (version === 1) {
    const secret = process.env["SUPABASE_SERVICE_ROLE_KEY"];
    if (!secret) throw new Error("Serverhemmeligheten mangler.");
    const base = await crypto.subtle.importKey("raw", enc.encode(secret), "HKDF", false, [
      "deriveKey",
    ]);
    return crypto.subtle.deriveKey(
      {
        name: "HKDF",
        hash: "SHA-256",
        salt: enc.encode("animatic-studio/provider-keys"),
        info: enc.encode("v1"),
      },
      base,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"],
    );
  }
  throw new Error("Ukjent nøkkelversjon.");
}

/** Versjonen nye nøkler krypteres med. */
export function currentKeyVersion(): number {
  return process.env["ANIMATIC_KEY_ENCRYPTION_KEY"] ? 2 : 1;
}

const aad = (userId: string, provider: string, rowId: string) =>
  enc.encode(`animatic-provider-key|${userId}|${provider}|${rowId}`);

export async function encryptKey(
  plain: string,
  ctx: { userId: string; provider: string; rowId: string },
): Promise<{ ciphertext: string; iv: string; version: number }> {
  const version = currentKeyVersion();
  const key = await masterKey(version);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: aad(ctx.userId, ctx.provider, ctx.rowId) },
    key,
    enc.encode(plain),
  );
  return { ciphertext: b64(new Uint8Array(ct)), iv: b64(iv), version };
}

export async function decryptKey(
  row: { ciphertext: string; iv: string; key_version: number },
  ctx: { userId: string; provider: string; rowId: string },
): Promise<string> {
  const key = await masterKey(row.key_version);
  try {
    const pt = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: unb64(row.iv) as unknown as ArrayBuffer,
        additionalData: aad(ctx.userId, ctx.provider, ctx.rowId),
      },
      key,
      unb64(row.ciphertext) as unknown as ArrayBuffer,
    );
    return new TextDecoder().decode(pt);
  } catch {
    // Ikke detaljer (ingen hjelp til en angriper); brukeren legger inn nøkkelen på nytt
    throw new Error(
      "Nøkkelen kunne ikke låses opp (hovednøkkelen på serveren er byttet). Legg inn nøkkelen på nytt.",
    );
  }
}
