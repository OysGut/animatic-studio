import "@testing-library/jest-dom/vitest";
import { denyTestNetwork } from "../../tests/helpers/network-guard";
import { beforeEach } from 'vitest';
import { setLanguage } from '../core/i18n';
// Historical tests assert Norwegian copy explicitly; production defaults to English (B-111).
beforeEach(() => setLanguage('nb'));

// DV4: vi.stubGlobal('fetch', mock) replaces this guard for each test; restoring returns to denial.
globalThis.fetch = denyTestNetwork;

// Tester i node-miljø (src/core, tests/invariants) har ikke window.
if (typeof window !== "undefined") {
  Object.defineProperty(window, "scrollTo", {
    writable: true,
    value: () => {},
  });

  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => {},
    }),
  });
}
