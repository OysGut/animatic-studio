/** KI-224: «Løst»-filter i notatpanelet – løste notater kan skjules og vises igjen. */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { NotesPanel } from "@/app/script/NotesPanel";
import type { Annotation, ProjectState } from "@/core";

afterEach(() => { cleanup(); document.body.replaceChildren(); });

const note = (id: string, text: string, resolved: boolean): Annotation => ({
  id: id as Annotation["id"],
  blockId: "b1" as Annotation["blockId"],
  variantId: null,
  kind: "note",
  start: 0,
  end: 3,
  quote: "Hei",
  text,
  authorName: "Mars",
  stampAt: "2026-10-01T10:00:00Z",
  editedByName: "",
  editedAt: "",
  removed: false,
  resolved,
});

const state = {
  blocks: { b1: { id: "b1", kind: "dialogue", text: "Hei verden", variantId: "v1" } },
  annotations: {},
} as unknown as ProjectState;

function setup(notes: Annotation[]) {
  return render(
    <NotesPanel
      state={state}
      notes={notes}
      editable={true}
      run={() => null}
      authorName="Mars"
      newTarget={null}
      newLabel="Nytt notat"
    />,
  );
}

describe("KI-224: vis eller skjul løste notater", () => {
  it("viser begge notatene fra starten, og bryteren skjuler de løste", () => {
    setup([note("a1", "Åpen merknad", false), note("a2", "Løst merknad", true)]);
    expect(screen.getByText("Åpen merknad")).toBeTruthy();
    expect(screen.getByText("Løst merknad")).toBeTruthy();
    const toggle = screen.getByTestId("notes-toggle-resolved");
    expect(toggle.textContent).toBe("Skjul løste notater");
    fireEvent.click(toggle);
    expect(screen.queryByText("Løst merknad")).toBeNull();
    expect(screen.getByText("Åpen merknad")).toBeTruthy();
    expect(screen.getByTestId("notes-toggle-resolved").textContent).toBe("Vis løste notater");
  });

  it("viser de løste igjen når bryteren slås tilbake", () => {
    setup([note("a1", "Åpen merknad", false), note("a2", "Løst merknad", true)]);
    const toggle = screen.getByTestId("notes-toggle-resolved");
    fireEvent.click(toggle);
    fireEvent.click(toggle);
    expect(screen.getByText("Løst merknad")).toBeTruthy();
  });

  it("har ingen bryter når ingen notater er løste", () => {
    setup([note("a1", "Åpen merknad", false)]);
    expect(screen.queryByTestId("notes-toggle-resolved")).toBeNull();
  });

  it("viser «Ingen notater» når alle er løste og skjult", () => {
    setup([note("a2", "Løst merknad", true)]);
    fireEvent.click(screen.getByTestId("notes-toggle-resolved"));
    expect(screen.getByText("Ingen notater.")).toBeTruthy();
  });
});
