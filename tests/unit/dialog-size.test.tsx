/**
 * Øystein 23.10: store dialoger kan endres i størrelse, og størrelsen huskes. Grenser, lagring og
 * gjenoppretting, tilbakestilling, tastatur og smal skjerm.
 */
import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clampDialogSize,
  dragDialogSize,
  isResizableViewport,
  keyDialogSize,
  maxDialogSize,
  validStoredDialogSize,
} from "@/app/shared/dialog-size";

// Visningsvalget (nettleser + konto) erstattes med et minnelager
const store = new Map<string, unknown>();
vi.mock("@/app/account/ui-prefs", async () => {
  const React = await import("react");
  return {
    useUiPref: <T,>(key: string, fallback: T) => {
      const [v, setV] = React.useState<T>(store.has(key) ? (store.get(key) as T) : fallback);
      return [v, (n: T) => (store.set(key, n), setV(n))];
    },
  };
});

const { Dialog, DialogTitle, DialogDescription } = await import("@/components/ui/dialog");
const { ResizableDialogContent } = await import("@/app/shared/ResizableDialogContent");

function setViewport(w: number, h: number) {
  Object.defineProperty(window, "innerWidth", { value: w, configurable: true });
  Object.defineProperty(window, "innerHeight", { value: h, configurable: true });
}

function Box() {
  return (
    <Dialog open>
      <ResizableDialogContent sizeKey="test" minWidth={500} minHeight={300}>
        <DialogTitle>X</DialogTitle>
        <DialogDescription>Y</DialogDescription>
      </ResizableDialogContent>
    </Dialog>
  );
}
const content = () => document.querySelector<HTMLElement>('[data-dialog-size="test"]')!;

describe("grenser", () => {
  const vp = { w: 1280, h: 800 };
  it("minimum per dialog og maks lik vinduet minus marg", () => {
    expect(maxDialogSize(vp)).toEqual({ w: 1232, h: 752 });
    expect(clampDialogSize({ w: 100, h: 100 }, { w: 500, h: 300 }, vp)).toEqual({ w: 500, h: 300 });
    expect(clampDialogSize({ w: 5000, h: 5000 }, { w: 500, h: 300 }, vp)).toEqual({ w: 1232, h: 752 });
  });
  it("krymper vinduet, krymper dialogen, også under minimum", () => {
    expect(clampDialogSize({ w: 1000, h: 700 }, { w: 500, h: 300 }, { w: 800, h: 400 })).toEqual({ w: 752, h: 352 });
  });
  it("dra holder dialogen sentrert: kanten følger markøren", () => {
    expect(dragDialogSize({ w: 600, h: 400 }, "right", 50, 30)).toEqual({ w: 700, h: 400 });
    expect(dragDialogSize({ w: 600, h: 400 }, "bottom", 50, 30)).toEqual({ w: 600, h: 460 });
    expect(dragDialogSize({ w: 600, h: 400 }, "corner", 50, 30)).toEqual({ w: 700, h: 460 });
  });
  it("Shift + piltaster endrer størrelsen, uten Shift ingenting", () => {
    expect(keyDialogSize({ w: 600, h: 400 }, "ArrowRight", true)).toEqual({ w: 620, h: 400 });
    expect(keyDialogSize({ w: 600, h: 400 }, "ArrowUp", true)).toEqual({ w: 600, h: 380 });
    expect(keyDialogSize({ w: 600, h: 400 }, "ArrowRight", false)).toBeNull();
  });
  it("smal skjerm endres ikke; ødelagte lagrede verdier avvises", () => {
    expect(isResizableViewport(767)).toBe(false);
    expect(isResizableViewport(768)).toBe(true);
    expect(validStoredDialogSize(null)).toBe(true);
    expect(validStoredDialogSize({ w: 700, h: 500 })).toBe(true);
    expect(validStoredDialogSize({ w: "700", h: 500 })).toBe(false);
    expect(validStoredDialogSize({ w: Number.NaN, h: 500 })).toBe(false);
  });
});

describe("ResizableDialogContent", () => {
  beforeEach(() => {
    store.clear();
    setViewport(1280, 800);
  });

  it("gjenoppretter lagret størrelse per dialogtype", () => {
    store.set("dialogSize.test", { w: 900, h: 600 });
    render(<Box />);
    expect(content().style.width).toBe("900px");
    expect(content().style.height).toBe("600px");
  });

  it("lagret størrelse som er større enn vinduet, krymper til vinduet minus marg", () => {
    store.set("dialogSize.test", { w: 3000, h: 3000 });
    render(<Box />);
    expect(content().style.width).toBe("1232px");
  });

  it("Shift + pil på grepet lagrer ny størrelse; dobbeltklikk tilbakestiller", () => {
    store.set("dialogSize.test", { w: 900, h: 600 });
    render(<Box />);
    const grip = screen.getByTestId("dialog-size-grip");
    expect(grip.getAttribute("aria-label")).toBeTruthy();
    fireEvent.keyDown(grip, { key: "ArrowRight", shiftKey: true });
    expect(store.get("dialogSize.test")).toEqual({ w: 920, h: 600 });
    expect(content().style.width).toBe("920px");
    act(() => {
      fireEvent.doubleClick(grip);
    });
    expect(store.get("dialogSize.test")).toBeNull();
    expect(content().style.width).toBe("");
  });

  it("knappen «Standardstørrelse» tilbakestiller også", () => {
    store.set("dialogSize.test", { w: 900, h: 600 });
    render(<Box />);
    fireEvent.click(screen.getByTestId("dialog-size-reset"));
    expect(store.get("dialogSize.test")).toBeNull();
  });

  it("smal skjerm: ingen grep og ingen egen størrelse", () => {
    setViewport(600, 800);
    store.set("dialogSize.test", { w: 900, h: 600 });
    render(<Box />);
    expect(screen.queryByTestId("dialog-size-grip")).toBeNull();
    expect(content().style.width).toBe("");
  });
});
