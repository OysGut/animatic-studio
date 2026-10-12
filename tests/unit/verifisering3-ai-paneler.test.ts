/**
 * Verifisering av krav (DEC-0075) i panelene for AI-lyd og egne leverandører (jsdom, React Testing Library):
 * - REQ-0203: «Lag lyd …» – kostnaden vises og må bekreftes; resultatet legges inn som ny versjon av
 *   lydressursen med modell og beskrivelse (sporbarhet), og kan angres som en vanlig kommando.
 * - REQ-0566: brukeren velger leverandør, limer inn nøkkelen i et skjult felt og sender den én gang til
 *   serveren; nøkkelen vises ikke igjen.
 *
 * Serverfunksjonene er attrapper (ingen ekte tjeneste kalles); serverdelen er verifisert i
 * verifisering3-ai-server.test.ts.
 */
import { createElement, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { applyCommand, type Command, type ProjectState } from "@/core";
import { GenerateSoundPanel } from "@/app/library/GenerateSoundPanel";
import { ProvidersDialog } from "@/app/ai/ProvidersDialog";
import { envelope, mustApply, seedProject, tid } from "../helpers/fixtures";

const h = vi.hoisted(() => ({
  sound: null as unknown as Mock<(arg: unknown) => Promise<unknown>>,
  save: null as unknown as Mock<(arg: unknown) => Promise<unknown>>,
}));
h.sound = vi.fn();
h.save = vi.fn();

vi.mock("@/adapters/ai/sound.functions", () => ({
  generateSound: (arg: unknown) => h.sound(arg),
}));
vi.mock("@/adapters/ai/provider-keys.functions", () => ({
  saveProviderKey: (arg: unknown) => h.save(arg),
  testSavedProviderKey: vi.fn(),
  removeProviderKey: vi.fn(),
  setAccountCap: vi.fn(),
}));
vi.mock("@/app/ai/use-project-providers", () => ({
  useProjectProviders: () => ({
    data: { providers: ["lovable", "elevenlabs"], missing: false },
    isLoading: false,
  }),
}));
vi.mock("@/app/ai/use-providers", () => ({
  accountAiKey: (userId: string) => ["account-ai", userId],
  useAccountAi: () => ({
    data: { keys: [], capUsd: null, usedUsd: 0, missing: false },
    isLoading: false,
    isError: false,
  }),
}));
vi.mock("@/app/library/asset-images", () => ({
  signedUrls: async () => ({}),
  useImageUrls: () => ({ data: {} }),
}));

beforeEach(() => {
  h.sound.mockReset();
  h.save.mockReset();
});
afterEach(() => cleanup());

function soundProject() {
  const { state } = seedProject(1);
  const assetId = tid<"asset">();
  const variantId = tid<"asset_variant">();
  let s = mustApply(state, {
    type: "CreateAssets",
    assets: [
      {
        assetId,
        fields: { kind: "sound", name: "Vind", names: [], description: "", category: "", tags: [] },
      },
    ],
  });
  s = mustApply(s, {
    type: "CreateAssetVariant",
    variantId,
    assetId,
    fields: { name: "Ute", style: "other", appearance: "" },
  });
  return { s, assetId, variantId };
}

function Harness({
  initial,
  ran,
  onState,
}: {
  initial: ProjectState;
  ran: Command[];
  onState: (s: ProjectState) => void;
}) {
  const [state, setState] = useState(initial);
  const asset = Object.values(state.assets).find((a) => a.kind === "sound")!;
  const variant = Object.values(state.assetVariants).find((v) => v.assetId === asset.id)!;
  const cmds = {
    runAndWait: async (c: Command) => {
      ran.push(c);
      const r = applyCommand(state, envelope(c));
      if (!r.ok) return { error: r.error.message };
      setState(r.state);
      onState(r.state);
      return { error: null, commandId: "x" };
    },
  };
  return createElement(GenerateSoundPanel, {
    projectId: state.project.id,
    asset,
    variant,
    cmds: cmds as never,
    onClose: () => undefined,
  });
}

describe("REQ-0203 – lyd lages etter godkjent kostnad og lagres som lydressurs med sporbarhet", () => {
  it("REQ-0203: ingenting sendes før kostnaden er bekreftet; lyden blir ny versjon med modell og beskrivelse", async () => {
    const { s, variantId } = soundProject();
    const versionId = tid<"asset_version">();
    h.sound.mockResolvedValue({
      ok: true,
      versionId,
      model: "elevenlabs/eleven_text_to_sound_v2",
      media: {
        path: `${s.project.id}/a/${versionId}/ai-lyd.mp3`,
        mimeType: "audio/mpeg",
        width: null,
        height: null,
        byteSize: 1234,
        sha256: "c".repeat(64),
      },
    });
    const ran: Command[] = [];
    let latest = s;
    render(
      createElement(
        QueryClientProvider,
        { client: new QueryClient() },
        createElement(Harness, { initial: s, ran, onState: (x: ProjectState) => (latest = x) }),
      ),
    );
    const region = screen.getByRole("region", { name: "Lag lyd med AI" });
    fireEvent.change(within(region).getByRole("textbox"), {
      target: { value: "Wind howling over the mountain" },
    });
    fireEvent.change(within(region).getByRole("combobox", { name: "Lengde på lyden" }), {
      target: { value: "5" },
    });
    fireEvent.click(within(region).getByRole("button", { name: /Lag lyd/ }));
    const confirm = within(region).getByRole("alertdialog", { name: "Bekreft generering" });
    // ElevenLabs lydeffekter: 0,012 USD/s × 5 s
    expect(confirm.textContent).toMatch(/ElevenLabs-kontoen til prosjektets eier/);
    expect(confirm.textContent).toMatch(/\$0\.06/);
    expect(h.sound).not.toHaveBeenCalled();
    fireEvent.click(within(confirm).getByRole("button", { name: /Ja, lag lyden/ }));
    await screen.findByText(/Lyden er lagt inn som ny versjon/);
    expect(h.sound).toHaveBeenCalledWith({
      data: expect.objectContaining({
        provider: "elevenlabs",
        model: "eleven_text_to_sound_v2",
        prompt: "Wind howling over the mountain",
        seconds: 5,
        approved: true,
      }),
    });
    expect(ran.map((c) => c.type)).toEqual(["AddAssetVersion"]);
    const v = latest.assetVersions[versionId]!;
    expect(v.variantId).toBe(variantId);
    expect(v.mediaPath).toBe(`${s.project.id}/a/${versionId}/ai-lyd.mp3`);
    expect(v.note).toMatch(/Generert med AI \(elevenlabs\/eleven_text_to_sound_v2\): Wind howling/);
    // Godkjennes ikke automatisk
    expect(latest.assetVariants[variantId]!.approvedVersionId ?? null).toBe(null);
  });

  it("REQ-0203: et avslag fra serveren (f.eks. kostnadstaket) vises, og ingen versjon lages", async () => {
    const { s } = soundProject();
    h.sound.mockResolvedValue({ ok: false, message: "Kostnadstaket for nøkkelen er nådd." });
    const ran: Command[] = [];
    render(
      createElement(
        QueryClientProvider,
        { client: new QueryClient() },
        createElement(Harness, { initial: s, ran, onState: () => undefined }),
      ),
    );
    fireEvent.click(screen.getByRole("button", { name: /Lag lyd/ }));
    fireEvent.click(screen.getByRole("button", { name: /Ja, lag lyden/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/Kostnadstaket/);
    expect(ran).toEqual([]);
  });
});

describe("REQ-0566 – brukeren velger leverandør og legger inn egen nøkkel på en sikker måte", () => {
  it("REQ-0566: nøkkelen limes inn i et skjult felt, sendes én gang, og feltet tømmes etter lagring", async () => {
    h.save.mockResolvedValue({ ok: true, status: "ok", message: null });
    render(
      createElement(
        QueryClientProvider,
        { client: new QueryClient() },
        createElement(ProvidersDialog, { open: true, onOpenChange: () => undefined, userId: "u1" }),
      ),
    );
    const list = screen.getByRole("list", { name: "Leverandører" });
    for (const name of ["OpenAI", "Google Gemini", "fal.ai", "Runway", "ElevenLabs"])
      expect(within(list).getByText(name)).toBeInTheDocument();
    fireEvent.click(within(list).getByText("Runway"));
    // Veiledning med lenker til leverandøren
    expect(screen.getByRole("link", { name: /Hent API-nøkkel/ })).toHaveAttribute(
      "href",
      "https://dev.runwayml.com/",
    );
    const input = screen.getByLabelText("API-nøkkel for Runway") as HTMLInputElement;
    expect(input.type).toBe("password");
    expect(input.autocomplete).toBe("off");
    const key = "key_" + "Z".repeat(30);
    fireEvent.change(input, { target: { value: key } });
    fireEvent.click(screen.getByRole("button", { name: /Prøv og lagre/ }));
    await screen.findByText(/lagret kryptert/);
    expect(h.save).toHaveBeenCalledTimes(1);
    expect(h.save).toHaveBeenCalledWith({ data: { provider: "runway", key, label: "" } });
    expect(input.value).toBe("");
    expect(document.body.textContent).not.toContain(key);
  });

  it("REQ-0566: en nøkkel med mellomrom stoppes før den sendes", () => {
    render(
      createElement(
        QueryClientProvider,
        { client: new QueryClient() },
        createElement(ProvidersDialog, { open: true, onOpenChange: () => undefined, userId: "u1" }),
      ),
    );
    fireEvent.click(screen.getByText("OpenAI"));
    fireEvent.change(screen.getByLabelText("API-nøkkel for OpenAI"), {
      target: { value: "sk-abc def ghi jkl mno" },
    });
    expect(screen.getByText(/kan ikke inneholde mellomrom/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Prøv og lagre/ })).toBeDisabled();
    expect(h.save).not.toHaveBeenCalled();
  });
});
