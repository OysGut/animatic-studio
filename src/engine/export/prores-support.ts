/** P7: tiny support probe kept apart from the encoder, so dialogs can check it without loading ProRes code. */
export function supportsProRes(): boolean {
  return typeof Worker !== "undefined" && typeof Blob !== "undefined" && typeof document !== "undefined";
}
