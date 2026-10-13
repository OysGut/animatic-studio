/**
 * Bakoverkompatibel inngang til nettleserklienten. Klienten bor i `src/adapters/browser/client.ts` (KI-181);
 * ny kode i `src/app` skal bruke funksjonene i `src/adapters/browser/` i stedet.
 */
export { db } from "@/adapters/browser/client";
