/**
 * Panel-UI med vanlig DOM og Spectrum UXP-knapper (`sp-button`). Bare visning: all logikk er i controller.ts.
 * Tekst settes med textContent (aldri som HTML), så navn fra prosjektet kan ikke kjøre kode.
 */
import type { PremierePlugin } from "./controller";

function el(doc: Document, tag: string, attrs: Record<string, string> = {}, text?: string): HTMLElement {
  const e = doc.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (text !== undefined) e.textContent = text;
  return e;
}

export function render(root: HTMLElement, p: PremierePlugin) {
  const d = root.ownerDocument, s = p.state;
  root.replaceChildren(el(d, "h1", { class: "ptg-title" }, p.t("title")));
  const btn = (label: string, id: string, onClick: () => void, disabled = false) => {
    const b = el(d, "sp-button", { id, variant: "primary", ...(disabled || s.busy ? { disabled: "" } : {}) }, label);
    b.addEventListener("click", onClick);
    return b;
  };
  if (!s.signedIn) {
    root.append(btn(p.t("signIn"), "ptg-sign-in", () => void p.beginSignIn()));
    if (s.awaitingPaste) {
      const input = el(d, "input", { id: "ptg-paste", type: "text", "aria-label": p.t("pasteHint") }) as HTMLInputElement;
      root.append(el(d, "p", {}, p.t("pasteHint")), input, btn(p.t("finish"), "ptg-finish", () => void p.finishSignIn(input.value)));
    }
    root.append(btn(p.t("useCode"), "ptg-device", () => void p.deviceSignIn()));
    if (s.deviceCode) root.append(el(d, "p", { id: "ptg-device-code" }, p.t("codeShown", { code: s.deviceCode.code, uri: s.deviceCode.uri })));
  } else {
    const dl = el(d, "dl");
    dl.append(el(d, "dt", {}, p.t("project")), el(d, "dd", { dir: "auto" }, s.projectName ?? "—"), el(d, "dt", {}, p.t("panels")), el(d, "dd", {}, String(s.panelCount)));
    root.append(dl, el(d, "p", { class: "ptg-notes" }, p.t("importHint")));
    root.append(btn(p.t("importPackage"), "ptg-import", () => void p.importPackage()));
    root.append(btn(p.t("sendBack"), "ptg-send", () => void p.sendBack()));
    root.append(btn(p.t("signOut"), "ptg-sign-out", () => void p.signOut()));
  }
  if (s.message) root.append(el(d, "p", { id: "ptg-message", role: s.message.kind === "error" ? "alert" : "status" }, s.message.text));
}
