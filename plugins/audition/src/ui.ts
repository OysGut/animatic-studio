/**
 * Panel-UI med vanlig DOM (CEP er Chromium). Bare visning: all logikk er i controller.ts.
 * Tekst settes med textContent (aldri som HTML), så navn fra prosjektet kan ikke kjøre kode.
 */
import type { AuditionPlugin } from "./controller";

function el(doc: Document, tag: string, attrs: Record<string, string> = {}, text?: string): HTMLElement {
  const e = doc.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (text !== undefined) e.textContent = text;
  return e;
}

export function render(root: HTMLElement, p: AuditionPlugin) {
  const d = root.ownerDocument, s = p.state;
  root.replaceChildren(el(d, "h1", { class: "ptg-title" }, p.t("title")));
  const btn = (label: string, id: string, onClick: () => void) => {
    const b = el(d, "button", { id, type: "button", ...(s.busy ? { disabled: "" } : {}) }, label);
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
    dl.append(el(d, "dt", {}, p.t("project")), el(d, "dd", { dir: "auto" }, s.projectName ?? "—"));
    root.append(dl);
    const scene = el(d, "select", { id: "ptg-scene", "aria-label": p.t("scene") }) as HTMLSelectElement;
    for (const sc of s.scenes) { const o = el(d, "option", { value: sc.occurrenceId }, sc.label) as HTMLOptionElement; o.selected = sc.occurrenceId === s.occurrenceId; scene.append(o); }
    scene.addEventListener("change", () => p.choose(scene.value, null));
    const panel = el(d, "select", { id: "ptg-panel", "aria-label": p.t("panel") }) as HTMLSelectElement;
    panel.append(el(d, "option", { value: "" }, p.t("wholeScene")));
    for (const pn of s.scenes.find(x => x.occurrenceId === s.occurrenceId)?.panels ?? []) { const o = el(d, "option", { value: pn.id, dir: "auto" }, pn.name || pn.id.slice(0, 8)) as HTMLOptionElement; o.selected = pn.id === s.panelId; panel.append(o); }
    panel.addEventListener("change", () => p.choose(s.occurrenceId, panel.value || null));
    root.append(el(d, "label", { for: "ptg-scene" }, p.t("scene")), scene, el(d, "label", { for: "ptg-panel" }, p.t("panel")), panel);
    root.append(btn(p.t("exportAudio"), "ptg-export", () => void p.exportAudio()));
    root.append(btn(p.t("sendBack"), "ptg-send", () => void p.sendBack()));
    if (s.conflict) {
      root.append(el(d, "p", { role: "alert" }, p.t("conflict")),
        btn(p.t("keepBoth"), "ptg-keep-both", () => void p.resolve("keep_both")),
        btn(p.t("useCurrent"), "ptg-use-current", () => void p.resolve("choose_current")),
        btn(p.t("useMine"), "ptg-use-mine", () => void p.resolve("choose_incoming")));
    }
    root.append(btn(p.t("signOut"), "ptg-sign-out", () => void p.signOut()));
  }
  if (s.message) root.append(el(d, "p", { id: "ptg-message", role: s.message.kind === "error" ? "alert" : "status" }, s.message.text));
}
