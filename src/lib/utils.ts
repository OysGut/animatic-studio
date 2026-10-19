import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/** Prosjektets egne tokens (U2): skriftstørrelser og sperring, så de ikke slås sammen bort som farger. */
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [{ text: ["chrome", "chrome-label"] }],
      tracking: [{ tracking: ["label"] }],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
