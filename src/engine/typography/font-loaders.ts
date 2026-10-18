/**
 * Lat lasting av fontfilene (MTS §61). Generert fra FONT_CATALOG: bare latin og latin-ext, bare vektene i
 * katalogen. Hver import blir en egen liten CSS-del som Vite laster når den trengs.
 */
// i18n-ignore-file – filstier
export const FONT_LOADERS: Record<string, Record<number, () => Promise<unknown>>> = {
  "playfair-display": {
    400: () => Promise.all([import("@fontsource/playfair-display/latin-400.css"), import("@fontsource/playfair-display/latin-ext-400.css")]),
    700: () => Promise.all([import("@fontsource/playfair-display/latin-700.css"), import("@fontsource/playfair-display/latin-ext-700.css")]),
    900: () => Promise.all([import("@fontsource/playfair-display/latin-900.css"), import("@fontsource/playfair-display/latin-ext-900.css")]),
  },
  "cormorant-garamond": {
    300: () => Promise.all([import("@fontsource/cormorant-garamond/latin-300.css"), import("@fontsource/cormorant-garamond/latin-ext-300.css")]),
    400: () => Promise.all([import("@fontsource/cormorant-garamond/latin-400.css"), import("@fontsource/cormorant-garamond/latin-ext-400.css")]),
    700: () => Promise.all([import("@fontsource/cormorant-garamond/latin-700.css"), import("@fontsource/cormorant-garamond/latin-ext-700.css")]),
  },
  "cinzel": {
    400: () => Promise.all([import("@fontsource/cinzel/latin-400.css"), import("@fontsource/cinzel/latin-ext-400.css")]),
    700: () => Promise.all([import("@fontsource/cinzel/latin-700.css"), import("@fontsource/cinzel/latin-ext-700.css")]),
    900: () => Promise.all([import("@fontsource/cinzel/latin-900.css"), import("@fontsource/cinzel/latin-ext-900.css")]),
  },
  "bebas-neue": {
    400: () => Promise.all([import("@fontsource/bebas-neue/latin-400.css"), import("@fontsource/bebas-neue/latin-ext-400.css")]),
  },
  "oswald": {
    300: () => Promise.all([import("@fontsource/oswald/latin-300.css"), import("@fontsource/oswald/latin-ext-300.css")]),
    400: () => Promise.all([import("@fontsource/oswald/latin-400.css"), import("@fontsource/oswald/latin-ext-400.css")]),
    700: () => Promise.all([import("@fontsource/oswald/latin-700.css"), import("@fontsource/oswald/latin-ext-700.css")]),
  },
  "montserrat": {
    300: () => Promise.all([import("@fontsource/montserrat/latin-300.css"), import("@fontsource/montserrat/latin-ext-300.css")]),
    400: () => Promise.all([import("@fontsource/montserrat/latin-400.css"), import("@fontsource/montserrat/latin-ext-400.css")]),
    700: () => Promise.all([import("@fontsource/montserrat/latin-700.css"), import("@fontsource/montserrat/latin-ext-700.css")]),
    900: () => Promise.all([import("@fontsource/montserrat/latin-900.css"), import("@fontsource/montserrat/latin-ext-900.css")]),
  },
  "lora": {
    400: () => Promise.all([import("@fontsource/lora/latin-400.css"), import("@fontsource/lora/latin-ext-400.css")]),
    700: () => Promise.all([import("@fontsource/lora/latin-700.css"), import("@fontsource/lora/latin-ext-700.css")]),
  },
  "source-serif-4": {
    300: () => Promise.all([import("@fontsource/source-serif-4/latin-300.css"), import("@fontsource/source-serif-4/latin-ext-300.css")]),
    400: () => Promise.all([import("@fontsource/source-serif-4/latin-400.css"), import("@fontsource/source-serif-4/latin-ext-400.css")]),
    700: () => Promise.all([import("@fontsource/source-serif-4/latin-700.css"), import("@fontsource/source-serif-4/latin-ext-700.css")]),
    900: () => Promise.all([import("@fontsource/source-serif-4/latin-900.css"), import("@fontsource/source-serif-4/latin-ext-900.css")]),
  },
  "libre-baskerville": {
    400: () => Promise.all([import("@fontsource/libre-baskerville/latin-400.css"), import("@fontsource/libre-baskerville/latin-ext-400.css")]),
    700: () => Promise.all([import("@fontsource/libre-baskerville/latin-700.css"), import("@fontsource/libre-baskerville/latin-ext-700.css")]),
  },
  "raleway": {
    300: () => Promise.all([import("@fontsource/raleway/latin-300.css"), import("@fontsource/raleway/latin-ext-300.css")]),
    400: () => Promise.all([import("@fontsource/raleway/latin-400.css"), import("@fontsource/raleway/latin-ext-400.css")]),
    700: () => Promise.all([import("@fontsource/raleway/latin-700.css"), import("@fontsource/raleway/latin-ext-700.css")]),
    900: () => Promise.all([import("@fontsource/raleway/latin-900.css"), import("@fontsource/raleway/latin-ext-900.css")]),
  },
};

/** Ekte kursivfiler (400i og 700i) for fontene som har dem. */
export const FONT_ITALIC_LOADERS: Record<string, Record<number, () => Promise<unknown>>> = {
  "playfair-display": {
    400: () => Promise.all([import("@fontsource/playfair-display/latin-400-italic.css"), import("@fontsource/playfair-display/latin-ext-400-italic.css")]),
    700: () => Promise.all([import("@fontsource/playfair-display/latin-700-italic.css"), import("@fontsource/playfair-display/latin-ext-700-italic.css")]),
  },
  "cormorant-garamond": {
    400: () => Promise.all([import("@fontsource/cormorant-garamond/latin-400-italic.css"), import("@fontsource/cormorant-garamond/latin-ext-400-italic.css")]),
    700: () => Promise.all([import("@fontsource/cormorant-garamond/latin-700-italic.css"), import("@fontsource/cormorant-garamond/latin-ext-700-italic.css")]),
  },
  "montserrat": {
    400: () => Promise.all([import("@fontsource/montserrat/latin-400-italic.css"), import("@fontsource/montserrat/latin-ext-400-italic.css")]),
    700: () => Promise.all([import("@fontsource/montserrat/latin-700-italic.css"), import("@fontsource/montserrat/latin-ext-700-italic.css")]),
  },
  "lora": {
    400: () => Promise.all([import("@fontsource/lora/latin-400-italic.css"), import("@fontsource/lora/latin-ext-400-italic.css")]),
    700: () => Promise.all([import("@fontsource/lora/latin-700-italic.css"), import("@fontsource/lora/latin-ext-700-italic.css")]),
  },
  "source-serif-4": {
    400: () => Promise.all([import("@fontsource/source-serif-4/latin-400-italic.css"), import("@fontsource/source-serif-4/latin-ext-400-italic.css")]),
    700: () => Promise.all([import("@fontsource/source-serif-4/latin-700-italic.css"), import("@fontsource/source-serif-4/latin-ext-700-italic.css")]),
  },
  "libre-baskerville": {
    400: () => Promise.all([import("@fontsource/libre-baskerville/latin-400-italic.css"), import("@fontsource/libre-baskerville/latin-ext-400-italic.css")]),
    700: () => Promise.all([import("@fontsource/libre-baskerville/latin-700-italic.css"), import("@fontsource/libre-baskerville/latin-ext-700-italic.css")]),
  },
  "raleway": {
    400: () => Promise.all([import("@fontsource/raleway/latin-400-italic.css"), import("@fontsource/raleway/latin-ext-400-italic.css")]),
    700: () => Promise.all([import("@fontsource/raleway/latin-700-italic.css"), import("@fontsource/raleway/latin-ext-700-italic.css")]),
  },
};
