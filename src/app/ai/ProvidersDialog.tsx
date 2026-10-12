/**
 * «AI-leverandører» (DEC-0069, REQ-0566): de mest brukte leverandørene, hva de kan, og en veiviser for
 * hver – opprette konto og betaling, hente API-nøkkel, lime den inn. Nøkkelen sendes én gang til serveren,
 * prøves, krypteres og vises aldri igjen (bare de fire siste tegnene). Øverst: overordnet kostnadstak per
 * måned for alle prosjekter som bruker nøklene.
 */
import { useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  CheckCircle2,
  CircleAlert,
  CircleDashed,
  ExternalLink,
  KeyRound,
  Loader2,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { useState } from "react";
import {
  PROVIDERS,
  capRemaining,
  checkKeyFormat,
  formatUsd,
  CAPABILITY_LABEL,
  type ProviderInfo,
} from "@/core";
import {
  removeProviderKey,
  saveProviderKey,
  setAccountCap,
  testSavedProviderKey,
} from "@/adapters/ai/provider-keys.functions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { accountAiKey, useAccountAi, type ProviderKeyRow } from "./use-providers";

const ctl =
  "h-8 rounded-sm border border-border-control bg-surface-3 px-2 text-[13px] text-text-primary disabled:opacity-50";

function StatusBadge({ row, builtIn }: { row: ProviderKeyRow | undefined; builtIn: boolean }) {
  if (builtIn)
    return (
      <span className="flex shrink-0 items-center gap-1 whitespace-nowrap text-xs text-text-secondary">
        <CheckCircle2 className="size-3.5 text-status-success" aria-hidden /> Innebygd
      </span>
    );
  if (!row)
    return (
      <span className="flex shrink-0 items-center gap-1 whitespace-nowrap text-xs text-text-tertiary">
        <CircleDashed className="size-3.5" aria-hidden /> Ikke koblet til
      </span>
    );
  if (row.status === "failed")
    return (
      <span className="flex shrink-0 items-center gap-1 whitespace-nowrap text-xs text-status-danger">
        <CircleAlert className="size-3.5" aria-hidden /> Nøkkelen virker ikke ({row.key_hint})
      </span>
    );
  return (
    <span className="flex shrink-0 items-center gap-1 whitespace-nowrap text-xs text-status-success">
      <CheckCircle2 className="size-3.5" aria-hidden /> Tilkoblet ({row.key_hint})
      {row.status === "untested" ? <span className="text-text-tertiary"> · ikke prøvd</span> : null}
    </span>
  );
}

function Link2({ href, children }: { href: string | undefined; children: React.ReactNode }) {
  if (!href) return null;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 text-[13px] text-accent-brand hover:underline"
    >
      {children}
      <ExternalLink className="size-3" aria-hidden />
    </a>
  );
}

function ProviderDetail({
  p,
  row,
  userId,
  onBack,
}: {
  p: ProviderInfo;
  row: ProviderKeyRow | undefined;
  userId: string;
  onBack: () => void;
}) {
  const qc = useQueryClient();
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState<"save" | "test" | "remove" | null>(null);
  const [msg, setMsg] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const fmt = key ? checkKeyFormat(p.id, key) : { error: null, warning: null };
  const refresh = () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: accountAiKey(userId) }),
      qc.invalidateQueries({ queryKey: ["project-ai-providers"] }),
    ]);

  async function save() {
    setBusy("save");
    setMsg(null);
    try {
      const r = await saveProviderKey({ data: { provider: p.id, key, label: "" } });
      if (r.ok) {
        setKey("");
        setMsg({
          kind: "ok",
          text:
            r.status === "ok"
              ? `Nøkkelen virker og er lagret kryptert.${r.message ? ` ${r.message}` : ""}`
              : `Nøkkelen er lagret kryptert. ${r.message ?? "Den kunne ikke prøves nå."}`,
        });
      } else setMsg({ kind: "error", text: r.message });
    } catch (e) {
      setMsg({ kind: "error", text: (e as Error).message });
    } finally {
      setBusy(null);
      void refresh();
    }
  }
  async function test() {
    setBusy("test");
    setMsg(null);
    try {
      const r = await testSavedProviderKey({ data: { provider: p.id } });
      setMsg(
        r.ok
          ? { kind: "ok", text: r.message ?? "Nøkkelen virker." }
          : { kind: "error", text: r.message },
      );
    } catch (e) {
      setMsg({ kind: "error", text: (e as Error).message });
    } finally {
      setBusy(null);
      void refresh();
    }
  }
  async function remove() {
    setBusy("remove");
    setMsg(null);
    try {
      const r = await removeProviderKey({ data: { provider: p.id } });
      setMsg(
        r.ok
          ? { kind: "ok", text: "Nøkkelen er slettet fra Animatic Studio." }
          : { kind: "error", text: r.message ?? "Kunne ikke fjerne nøkkelen." },
      );
    } finally {
      setBusy(null);
      setConfirmRemove(false);
      void refresh();
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <button
        type="button"
        onClick={onBack}
        className="flex items-center gap-1 self-start text-xs text-text-secondary hover:text-text-primary"
      >
        <ArrowLeft className="size-3.5" aria-hidden /> Alle leverandører
      </button>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-text-primary">{p.name}</h3>
          <p className="mt-0.5 text-[13px] text-text-secondary">{p.description}</p>
          <p className="mt-1 text-xs text-text-tertiary">
            Kan lage: {p.capabilities.map((c) => CAPABILITY_LABEL[c]).join(", ")} · modeller:{" "}
            {p.models.map((m) => m.label).join(", ")}
          </p>
        </div>
        <StatusBadge row={row} builtIn={p.builtIn} />
      </div>
      {p.builtIn ? (
        <p className="text-[13px] text-text-secondary">
          Denne er alltid tilgjengelig og bruker kredittene i Lovable-arbeidsområdet. Prosjektets
          AI-budsjett gjelder.
        </p>
      ) : (
        <>
          <section aria-labelledby="steps-title">
            <h4
              id="steps-title"
              className="mb-1.5 text-[11px] font-medium uppercase tracking-[0.04em] text-text-tertiary"
            >
              Slik kobler du til
            </h4>
            <ol className="ml-4 flex list-decimal flex-col gap-1 text-[13px] text-text-primary">
              {p.keySteps.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ol>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
              <Link2 href={p.links.signup}>Opprett konto</Link2>
              <Link2 href={p.links.billing}>Betaling og kreditt</Link2>
              <Link2 href={p.links.apiKeys}>Hent API-nøkkel</Link2>
              <Link2 href={p.links.pricing}>Priser</Link2>
            </div>
          </section>
          <section
            aria-labelledby="key-title"
            className="flex flex-col gap-2 rounded-sm border border-border bg-surface-2 p-3"
          >
            <h4 id="key-title" className="flex items-center gap-1.5 text-[13px] font-medium">
              <KeyRound className="size-4" aria-hidden />
              {row ? "Bytt nøkkel" : "Lim inn API-nøkkelen"}
            </h4>
            <input
              type="password"
              autoComplete="off"
              spellCheck={false}
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder={row ? `Nåværende: ${row.key_hint}` : "Lim inn nøkkelen her"}
              aria-label={`API-nøkkel for ${p.name}`}
              className={ctl + " w-full font-mono"}
              disabled={busy !== null}
            />
            {fmt.error ? <p className="text-xs text-status-danger">{fmt.error}</p> : null}
            {fmt.warning ? <p className="text-xs text-status-uncertain">{fmt.warning}</p> : null}
            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                onClick={() => void save()}
                disabled={!key.trim() || !!fmt.error || busy !== null}
              >
                {busy === "save" ? <Loader2 className="animate-spin" /> : <ShieldCheck />}
                Prøv og lagre
              </Button>
              {row ? (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => void test()}
                  disabled={busy !== null}
                >
                  {busy === "test" ? <Loader2 className="animate-spin" /> : <CheckCircle2 />}
                  Prøv nøkkelen igjen
                </Button>
              ) : null}
              {row && !confirmRemove ? (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setConfirmRemove(true)}
                  disabled={busy !== null}
                >
                  <Trash2 /> Fjern
                </Button>
              ) : null}
              {confirmRemove ? (
                <span className="flex items-center gap-2 text-xs text-text-secondary">
                  Slette nøkkelen fra Animatic Studio?
                  <Button size="sm" variant="destructive" onClick={() => void remove()}>
                    Slett
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setConfirmRemove(false)}>
                    Avbryt
                  </Button>
                </span>
              ) : null}
            </div>
            {row?.status_message && !msg ? (
              <p className="text-xs text-text-tertiary">{row.status_message}</p>
            ) : null}
            {msg ? (
              <p
                role={msg.kind === "error" ? "alert" : "status"}
                className={
                  "text-xs " + (msg.kind === "error" ? "text-status-danger" : "text-status-success")
                }
              >
                {msg.text}
              </p>
            ) : null}
            <p className="text-[11px] text-text-tertiary">
              Nøkkelen sendes kryptert til serveren, prøves hos {p.name} og lagres kryptert. Den
              vises aldri igjen – bare de fire siste tegnene. Den brukes bare når du eller andre i
              prosjektene dine ber om en generering (alltid med bekreftelse), innenfor
              kostnadstaket. Fjerner du den her, slettes den. Slett den også hos {p.name} hvis du
              tror den er kommet på avveie.
            </p>
          </section>
        </>
      )}
    </div>
  );
}

function CapSection({
  userId,
  capUsd,
  usedUsd,
}: {
  userId: string;
  capUsd: number | null;
  usedUsd: number;
}) {
  const qc = useQueryClient();
  const [text, setText] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const value = text ?? (capUsd === null ? "" : String(capUsd));
  const parsed = value.trim() === "" ? null : Number(value.replace(",", "."));
  const invalid = parsed !== null && (!Number.isFinite(parsed) || parsed < 0 || parsed > 100000);
  const remaining = capRemaining(capUsd, usedUsd);
  return (
    <section
      aria-labelledby="cap-title"
      className="flex flex-col gap-2 rounded-sm border border-border bg-surface-1 p-3"
    >
      <h3 id="cap-title" className="text-[13px] font-medium text-text-primary">
        Kostnadstak for egne nøkler
      </h3>
      <div className="flex flex-wrap items-center gap-2 text-[13px] text-text-secondary">
        <label className="flex items-center gap-2">
          Høyst per måned (USD)
          <input
            inputMode="decimal"
            value={value}
            onChange={(e) => setText(e.target.value)}
            placeholder="Ingen tak"
            aria-label="Kostnadstak per måned i USD"
            aria-invalid={invalid || undefined}
            className={ctl + " w-28 text-right tabular"}
          />
        </label>
        <Button
          size="sm"
          variant="secondary"
          disabled={busy || invalid || text === null}
          onClick={async () => {
            setBusy(true);
            setErr(null);
            try {
              const r = await setAccountCap({ data: { capUsd: parsed } });
              if (!r.ok) setErr(r.message);
              else setText(null);
            } finally {
              setBusy(false);
              void qc.invalidateQueries({ queryKey: accountAiKey(userId) });
            }
          }}
        >
          Lagre
        </Button>
        <span className="tabular text-xs text-text-tertiary">
          Brukt denne måneden: ~{formatUsd(usedUsd)}
          {remaining !== null ? ` · igjen ~${formatUsd(remaining)}` : ""}
        </span>
      </div>
      <p className="text-[11px] text-text-tertiary">
        Gjelder alle prosjekter som bruker nøklene dine, i tillegg til hvert prosjekts eget
        budsjett. Beløpene er anslag ut fra leverandørenes prislister; den faktiske regningen kommer
        fra leverandøren. Sett også gjerne en grense hos leverandøren.
      </p>
      {err ? (
        <p role="alert" className="text-xs text-status-danger">
          {err}
        </p>
      ) : null}
    </section>
  );
}

export function ProvidersDialog({
  open,
  onOpenChange,
  userId,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  userId: string;
}) {
  const ai = useAccountAi(userId, open);
  const [selected, setSelected] = useState<string | null>(null);
  const rows = new Map((ai.data?.keys ?? []).map((k) => [k.provider, k]));
  const sel = PROVIDERS.find((p) => p.id === selected);
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) setSelected(null);
      }}
    >
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto border-border bg-surface-2">
        <DialogHeader>
          <DialogTitle>AI-leverandører</DialogTitle>
          <DialogDescription>
            Koble til tjenestene du vil bruke for bilder, video og lyd. De du kobler til, blir
            tilgjengelige i alle prosjektene du eier.
          </DialogDescription>
        </DialogHeader>
        {ai.isLoading ? (
          <Loader2 className="size-5 animate-spin text-text-tertiary" aria-hidden />
        ) : ai.data?.missing ? (
          <p role="alert" className="text-[13px] text-status-uncertain">
            Databasen er ikke oppdatert for egne AI-leverandører ennå. Lim inn meldingen i
            LOVABLE_SYNC.md i Lovable (migrasjon 0024).
          </p>
        ) : sel ? (
          <ProviderDetail
            p={sel}
            row={rows.get(sel.id)}
            userId={userId}
            onBack={() => setSelected(null)}
          />
        ) : (
          <div className="flex flex-col gap-3">
            <CapSection
              userId={userId}
              capUsd={ai.data?.capUsd ?? null}
              usedUsd={ai.data?.usedUsd ?? 0}
            />
            <ul className="flex flex-col gap-1.5" aria-label="Leverandører">
              {PROVIDERS.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => setSelected(p.id)}
                    className="flex w-full items-center justify-between gap-3 rounded-sm border border-border bg-surface-1 px-3 py-2 text-left hover:bg-surface-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <span className="min-w-0">
                      <span className="block text-[13px] font-medium text-text-primary">
                        {p.name}
                      </span>
                      <span className="block truncate text-xs text-text-tertiary">
                        {p.capabilities.map((c) => CAPABILITY_LABEL[c]).join(" · ")}
                      </span>
                    </span>
                    <StatusBadge row={rows.get(p.id)} builtIn={p.builtIn} />
                  </button>
                </li>
              ))}
            </ul>
            {ai.isError ? (
              <p role="alert" className="text-xs text-status-danger">
                {(ai.error as Error).message}
              </p>
            ) : null}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
