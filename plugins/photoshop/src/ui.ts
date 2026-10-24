/**
 * Panel-UI med vanlig DOM og Spectrum UXP-knapper (`sp-button`). Bare visning: all logikk er i controller.ts.
 * Tekst settes med textContent (aldri innerHTML), så navn og notater fra prosjektet kan ikke kjøre kode.
 */
import type { PhotoshopPlugin } from "./controller";

type El = HTMLElement;
function el(doc: Document, tag: string, attrs: Record<string, string> = {}, text?: string): El {
  const e = doc.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (text !== undefined) e.textContent = text;
  return e;
}

export function render(root: El, p: PhotoshopPlugin): void {
  const d = root.ownerDocument, s = p.state;
  root.replaceChildren();
  root.setAttribute("aria-busy", String(s.busy));
  root.append(el(d, "h1", { class: "ptg-title" }, p.t("title")));
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
    const dl = el(d, "dl", { class: "ptg-info" });
    const row = (k: string, v: string) => dl.append(el(d, "dt", {}, k), el(d, "dd", { dir: "auto" }, v));
    row(p.t("project"), s.projectName ?? "—");
    if (s.link) { row(p.t("asset"), s.link.assetName); row(p.t("version"), `v${s.link.baseNumber}`); }
    if (s.docInfo) row(p.t("status"), p.t("docInfo", { w: s.docInfo.width, h: s.docInfo.height, dpi: Math.round(s.docInfo.resolution), profile: s.docInfo.colorProfile ?? p.t("noProfile") }));
    root.append(dl);

    const assets = el(d, "select", { id: "ptg-asset", "aria-label": p.t("asset") }) as HTMLSelectElement;
    assets.append(el(d, "option", { value: "" }, "—"));
    for (const a of s.assets) { const o = el(d, "option", { value: a.id }, a.name) as HTMLOptionElement; if (a.id === s.selectedAssetId) o.selected = true; assets.append(o); }
    assets.addEventListener("change", () => { if (assets.value) void p.selectAsset(assets.value); });
    root.append(el(d, "label", { for: "ptg-asset" }, p.t("asset")), assets);

    const list = el(d, "ul", { id: "ptg-versions", "aria-label": p.t("version") });
    for (const v of s.versions) {
      const li = el(d, "li", {}, `v${v.number} · ${v.approved ? p.t("approved") : p.t("candidate")} `);
      li.append(btn(p.t("open"), `ptg-open-${v.id}`, () => void p.openVersion(v.id)));
      list.append(li);
    }
    root.append(list);

    const section = (title: string, items: readonly { id: string; name: string; notes: readonly string[] }[], id: string) => {
      if (!items.length) return;
      const ul = el(d, "ul", { id, "aria-label": title });
      for (const i of items.slice(0, 200)) {
        const li = el(d, "li", { dir: "auto" }, i.name);
        if (i.notes.length) li.append(el(d, "p", { class: "ptg-notes", "aria-label": p.t("notes") }, i.notes.join(" · ")));
        ul.append(li);
      }
      root.append(el(d, "h2", {}, title), ul);
    };
    section(p.t("scene"), s.scenes, "ptg-scenes");
    section(p.t("panel"), s.panels, "ptg-panels");

    root.append(btn(p.t("sendBack"), "ptg-send", () => void p.sendBack(), !s.link));
    if (s.progress) root.append(el(d, "p", { role: "status" }, p.t("progress", s.progress)));
    if (s.conflict) {
      const box = el(d, "div", { id: "ptg-conflict", role: "group", "aria-label": p.t("conflict") });
      box.append(el(d, "p", {}, p.t("conflict")),
        btn(p.t("keepBoth"), "ptg-keep-both", () => void p.resolve("keep_both")),
        btn(p.t("keepCurrent"), "ptg-keep-current", () => void p.resolve("choose_current")),
        btn(p.t("useMine"), "ptg-use-mine", () => void p.resolve("choose_incoming")));
      root.append(box);
    }
    root.append(btn(p.t("signOut"), "ptg-sign-out", () => void p.signOut()));
  }
  if (s.message) root.append(el(d, "p", { id: "ptg-message", role: s.message.kind === "error" ? "alert" : "status" }, s.message.text));
}
