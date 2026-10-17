/**
 * «AI-leverandører» (DEC-0069, REQ-0566): de mest brukte leverandørene, hva de kan, og en veiviser for
 * hver – opprette konto og betaling, hente API-nøkkel, lime den inn. Nøkkelen sendes én gang til serveren,
 * prøves, krypteres og vises aldri igjen (bare de fire siste tegnene). Øverst: overordnet kostnadstak per
 * måned for alle prosjekter som bruker nøklene.
 */
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
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
  catalogSettings,
  customModelsOf,
  isModelEnabled,
  isProviderEnabled,
  checkKeyFormat,
  formatUsd,
  CAPABILITY_LABEL,
  type ProviderInfo,
  L,
  tm,
  TEXT_PREFS_KEY,
  TEXT_TASK_GROUPS,
  TEXT_TASK_GROUP_LABEL,
  isTextPrefs,
  providerInfo,
  textModelsOf,
  type TextChoice,
  type TextPrefs,
} from "@/core";
import {
  listTextChoices,
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
import { useAiModelSettings } from "./use-ai-model-settings";
import { useUiPref } from "@/app/account/ui-prefs";

const ctl =
  "h-8 rounded-sm border border-border-control bg-surface-3 px-2 text-[13px] text-text-primary disabled:opacity-50";

/** Leverandøren er slått av for alle brukere på adminsiden (DEC-0088). */
function AdminOffNote() {
  return (
    <p role="note" className="text-[13px] text-status-uncertain">
      {L(
        "Administrator har slått av denne leverandøren for alle brukere. Den vises ikke i valglistene og kan ikke brukes før den slås på igjen.",
        "The administrator has switched off this provider for all users. It is not shown in the lists and cannot be used until it is switched on again.",
      )}
    </p>
  );
}

function StatusBadge({ row, builtIn }: { row: ProviderKeyRow | undefined; builtIn: boolean }) {
  if (builtIn)
    return (
      <span className="flex shrink-0 items-center gap-1 whitespace-nowrap text-xs text-text-secondary">
        <CheckCircle2 className="size-3.5 text-status-success" aria-hidden />{" "}
        {L("Innebygd", "Built-in")}
      </span>
    );
  if (!row)
    return (
      <span className="flex shrink-0 items-center gap-1 whitespace-nowrap text-xs text-text-tertiary">
        <CircleDashed className="size-3.5" aria-hidden /> {L("Ikke koblet til", "Not connected")}
      </span>
    );
  if (row.status === "failed")
    return (
      <span className="flex shrink-0 items-center gap-1 whitespace-nowrap text-xs text-status-danger">
        <CircleAlert className="size-3.5" aria-hidden />{" "}
        {L(`Nøkkelen virker ikke (${row.key_hint})`, `The key does not work (${row.key_hint})`)}
      </span>
    );
  return (
    <span className="flex shrink-0 items-center gap-1 whitespace-nowrap text-xs text-status-success">
      <CheckCircle2 className="size-3.5" aria-hidden />{" "}
      {L(`Tilkoblet (${row.key_hint})`, `Connected (${row.key_hint})`)}
      {row.status === "untested" ? (
        <span className="text-text-tertiary">{L(" · ikke prøvd", " · not tested")}</span>
      ) : null}
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
              ? L(
                  `Nøkkelen virker og er lagret kryptert.${r.message ? ` ${tm(r.message)}` : ""}`,
                  `The key works and is saved encrypted.${r.message ? ` ${tm(r.message)}` : ""}`,
                )
              : L(
                  `Nøkkelen er lagret kryptert. ${tm(r.message ?? "Den kunne ikke prøves nå.")}`,
                  `The key is saved encrypted. ${tm(r.message ?? "It could not be tested now.")}`,
                ),
        });
      } else setMsg({ kind: "error", text: tm(r.message) });
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
          ? { kind: "ok", text: tm(r.message ?? L("Nøkkelen virker.", "The key works.")) }
          : { kind: "error", text: tm(r.message) },
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
          ? {
              kind: "ok",
              text: L(
                "Nøkkelen er slettet fra Animatic Studio.",
                "The key has been deleted from Animatic Studio.",
              ),
            }
          : {
              kind: "error",
              text: tm(r.message ?? L("Kunne ikke fjerne nøkkelen.", "Could not remove the key.")),
            },
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
        <ArrowLeft className="size-3.5" aria-hidden /> {L("Alle leverandører", "All providers")}
      </button>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-text-primary">{p.name}</h3>
          <p className="mt-0.5 text-[13px] text-text-secondary">{p.description}</p>
          <p className="mt-1 text-xs text-text-tertiary">
            {L("Kan lage:", "Can make:")}{" "}
            {p.capabilities.map((c) => CAPABILITY_LABEL[c]).join(", ")} ·{" "}
            {L("modeller:", "models:")}{" "}
            {[...p.models, ...customModelsOf(p.id)]
              .filter((m) => !m.retired && isModelEnabled(catalogSettings(), p.id, m.id))
              .map((m) => m.label)
              .join(", ") || "–"}
          </p>
        </div>
        <StatusBadge row={row} builtIn={p.builtIn} />
      </div>
      {!isProviderEnabled(catalogSettings(), p.id) ? <AdminOffNote /> : null}
      {p.builtIn ? (
        <p className="text-[13px] text-text-secondary">
          {L(
            "Denne er alltid tilgjengelig og bruker kredittene i Lovable-arbeidsområdet. Prosjektets AI-budsjett gjelder.",
            "This is always available and uses the credits in the Lovable workspace. The project's AI budget applies.",
          )}
        </p>
      ) : (
        <>
          <section aria-labelledby="steps-title">
            <h4
              id="steps-title"
              className="mb-1.5 text-[11px] font-medium uppercase tracking-[0.04em] text-text-tertiary"
            >
              {L("Slik kobler du til", "How to connect")}
            </h4>
            <ol className="ml-4 flex list-decimal flex-col gap-1 text-[13px] text-text-primary">
              {p.keySteps.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ol>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
              <Link2 href={p.links.signup}>{L("Opprett konto", "Create account")}</Link2>
              <Link2 href={p.links.billing}>{L("Betaling og kreditt", "Billing and credit")}</Link2>
              <Link2 href={p.links.apiKeys}>{L("Hent API-nøkkel", "Get API key")}</Link2>
              <Link2 href={p.links.pricing}>{L("Priser", "Pricing")}</Link2>
            </div>
          </section>
          <section
            aria-labelledby="key-title"
            className="flex flex-col gap-2 rounded-sm border border-border bg-surface-2 p-3"
          >
            <h4 id="key-title" className="flex items-center gap-1.5 text-[13px] font-medium">
              <KeyRound className="size-4" aria-hidden />
              {row
                ? L("Bytt nøkkel", "Change key")
                : L("Lim inn API-nøkkelen", "Paste the API key")}
            </h4>
            <input
              type="password"
              autoComplete="off"
              spellCheck={false}
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder={
                row
                  ? L(`Nåværende: ${row.key_hint}`, `Current: ${row.key_hint}`)
                  : L("Lim inn nøkkelen her", "Paste the key here")
              }
              aria-label={L(`API-nøkkel for ${p.name}`, `API key for ${p.name}`)}
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
                {L("Prøv og lagre", "Test and save")}
              </Button>
              {row ? (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => void test()}
                  disabled={busy !== null}
                >
                  {busy === "test" ? <Loader2 className="animate-spin" /> : <CheckCircle2 />}
                  {L("Prøv nøkkelen igjen", "Test the key again")}
                </Button>
              ) : null}
              {row && !confirmRemove ? (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setConfirmRemove(true)}
                  disabled={busy !== null}
                >
                  <Trash2 /> {L("Fjern", "Remove")}
                </Button>
              ) : null}
              {confirmRemove ? (
                <span className="flex items-center gap-2 text-xs text-text-secondary">
                  {L(
                    "Slette nøkkelen fra Animatic Studio?",
                    "Delete the key from Animatic Studio?",
                  )}
                  <Button size="sm" variant="destructive" onClick={() => void remove()}>
                    {L("Slett", "Delete")}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setConfirmRemove(false)}>
                    {L("Avbryt", "Cancel")}
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
              {L(
                `Nøkkelen sendes kryptert til serveren, prøves hos ${p.name} og lagres kryptert. Den vises aldri igjen – bare de fire siste tegnene. Den brukes bare når du eller andre i prosjektene dine ber om en generering (alltid med bekreftelse), innenfor kostnadstaket. Fjerner du den her, slettes den. Slett den også hos ${p.name} hvis du tror den er kommet på avveie.`,
                `The key is sent encrypted to the server, tested with ${p.name} and saved encrypted. It is never shown again – only the last four characters. It is only used when you or others in your projects ask for a generation (always with confirmation), within the cost limit. If you remove it here, it is deleted. Also delete it at ${p.name} if you think it has been compromised.`,
              )}
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
        {L("Kostnadstak for egne nøkler", "Cost limit for own keys")}
      </h3>
      <div className="flex flex-wrap items-center gap-2 text-[13px] text-text-secondary">
        <label className="flex items-center gap-2">
          {L("Høyst per måned (USD)", "Maximum per month (USD)")}
          <input
            inputMode="decimal"
            value={value}
            onChange={(e) => setText(e.target.value)}
            placeholder={L("Ingen tak", "No limit")}
            aria-label={L("Kostnadstak per måned i USD", "Cost limit per month in USD")}
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
              if (!r.ok) setErr(tm(r.message ?? ""));
              else setText(null);
            } finally {
              setBusy(false);
              void qc.invalidateQueries({ queryKey: accountAiKey(userId) });
            }
          }}
        >
          {L("Lagre", "Save")}
        </Button>
        <span className="tabular text-xs text-text-tertiary">
          {L("Brukt denne måneden:", "Used this month:")} ~{formatUsd(usedUsd)}
          {remaining !== null
            ? L(` · igjen ~${formatUsd(remaining)}`, ` · remaining ~${formatUsd(remaining)}`)
            : ""}
        </span>
      </div>
      <p className="text-[11px] text-text-tertiary">
        {L(
          "Gjelder alle prosjekter som bruker nøklene dine, i tillegg til hvert prosjekts eget budsjett. Beløpene er anslag ut fra leverandørenes prislister; den faktiske regningen kommer fra leverandøren. Sett også gjerne en grense hos leverandøren.",
          "Applies to all projects that use your keys, in addition to each project's own budget. The amounts are estimates based on the providers' price lists; the actual bill comes from the provider. You may also want to set a limit with the provider.",
        )}
      </p>
      {err ? (
        <p role="alert" className="text-xs text-status-danger">
          {err}
        </p>
      ) : null}
    </section>
  );
}

const LOVABLE_TEXT = "lovable";

/**
 * «Tekst-AI» (T1): leverandør og modell per oppgavegruppe. Lagres på kontoen (profiles.ui_prefs → aiText).
 * «Automatisk» = ingen rad: serveren velger første leverandør med gyldig nøkkel, ellers innebygd AI.
 */
function TextAiSection({ open }: { open: boolean }) {
  const list = useServerFn(listTextChoices);
  const choices = useQuery({
    queryKey: ["text-ai-choices"],
    enabled: open,
    queryFn: () => list(),
  });
  const [prefs, setPrefs] = useUiPref<TextPrefs>(TEXT_PREFS_KEY, {}, isTextPrefs);
  const settings = catalogSettings();
  const providers = (choices.data?.providers ?? []).filter((p) =>
    isProviderEnabled(settings, p.provider),
  );
  const modelsFor = (provider: string): string[] =>
    provider === LOVABLE_TEXT
      ? []
      : (() => {
          const a = providers.find((p) => p.provider === provider);
          return a ? textModelsOf(a).filter((m) => isModelEnabled(settings, provider, m)) : [];
        })();
  const update = (group: (typeof TEXT_TASK_GROUPS)[number], next: TextChoice | null) => {
    const copy: TextPrefs = { ...prefs };
    if (next) copy[group] = next;
    else delete copy[group];
    setPrefs(copy);
  };
  return (
    <section
      aria-labelledby="text-ai-title"
      className="flex flex-col gap-2 rounded-sm border border-border bg-surface-1 p-3"
    >
      <h3 id="text-ai-title" className="text-[13px] font-medium text-text-primary">
        {L("Tekst-AI", "Text AI")}
      </h3>
      <p className="text-xs text-text-tertiary">
        {L(
          "Velg leverandør og modell for hver type tekstoppgave. «Automatisk» bruker den første leverandøren du har en gyldig nøkkel til, ellers den innebygde AI-en.",
          "Choose the provider and model for each kind of text task. “Automatic” uses the first provider you have a valid key for, otherwise the built-in AI.",
        )}
      </p>
      {choices.isLoading ? (
        <Loader2 className="size-4 animate-spin text-text-tertiary" aria-hidden />
      ) : (
        <div className="grid grid-cols-[auto_1fr_1fr] items-center gap-2">
          {TEXT_TASK_GROUPS.map((g) => {
            const cur = prefs[g];
            const models = cur ? modelsFor(cur.provider) : [];
            return (
              <div key={g} className="contents">
                <span className="text-[13px] text-text-secondary">{TEXT_TASK_GROUP_LABEL[g]}</span>
                <select
                  className={ctl}
                  aria-label={L(
                    `Leverandør for ${TEXT_TASK_GROUP_LABEL[g]}`,
                    `Provider for ${TEXT_TASK_GROUP_LABEL[g]}`,
                  )}
                  value={cur?.provider ?? ""}
                  onChange={(e) => {
                    const p = e.target.value;
                    if (!p) return update(g, null);
                    if (p === LOVABLE_TEXT)
                      return update(g, { provider: "lovable", model: "auto" });
                    const first = modelsFor(p)[0];
                    if (first) update(g, { provider: p as TextChoice["provider"], model: first });
                  }}
                >
                  <option value="">{L("Automatisk", "Automatic")}</option>
                  {providers.map((p) => (
                    <option key={p.provider} value={p.provider}>
                      {providerInfo(p.provider)?.name ?? p.provider}
                    </option>
                  ))}
                  <option value={LOVABLE_TEXT}>{L("Innebygd AI", "Built-in AI")}</option>
                </select>
                <select
                  className={ctl}
                  aria-label={L(
                    `Modell for ${TEXT_TASK_GROUP_LABEL[g]}`,
                    `Model for ${TEXT_TASK_GROUP_LABEL[g]}`,
                  )}
                  value={cur && cur.provider !== "lovable" ? cur.model : ""}
                  disabled={!cur || cur.provider === "lovable"}
                  onChange={(e) =>
                    cur && update(g, { provider: cur.provider, model: e.target.value })
                  }
                >
                  {!cur || cur.provider === "lovable" ? (
                    <option value="">{L("Velges automatisk", "Chosen automatically")}</option>
                  ) : (
                    (models.includes(cur.model) ? models : [cur.model, ...models]).map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))
                  )}
                </select>
              </div>
            );
          })}
        </div>
      )}
      {!choices.isLoading && providers.length === 0 ? (
        <p className="text-xs text-text-tertiary">
          {L(
            "Du har ingen egne tekstleverandører ennå. Koble til Claude, ChatGPT, Grok eller Gemini nedenfor.",
            "You have no text providers of your own yet. Connect Claude, ChatGPT, Grok or Gemini below.",
          )}
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
  // Administratorens av/på (DEC-0088): avslåtte leverandører merkes, avslåtte modeller vises ikke
  useAiModelSettings(open);
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
          <DialogTitle>{L("AI-leverandører", "AI providers")}</DialogTitle>
          <DialogDescription>
            {L(
              "Koble til tjenestene du vil bruke for bilder, video og lyd. De du kobler til, blir tilgjengelige i alle prosjektene du eier.",
              "Connect the services you want to use for images, video and audio. Those you connect become available in all the projects you own.",
            )}
          </DialogDescription>
        </DialogHeader>
        {ai.isLoading ? (
          <Loader2 className="size-5 animate-spin text-text-tertiary" aria-hidden />
        ) : ai.data?.missing ? (
          <p role="alert" className="text-[13px] text-status-uncertain">
            {L(
              "Databasen er ikke oppdatert for egne AI-leverandører ennå. Lim inn meldingen i LOVABLE_SYNC.md i Lovable (migrasjon 0024).",
              "The database is not yet updated for your own AI providers. Paste the message into LOVABLE_SYNC.md in Lovable (migration 0024).",
            )}
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
            <TextAiSection open={open} />
            <ul className="flex flex-col gap-1.5" aria-label={L("Leverandører", "Providers")}>
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
                    {isProviderEnabled(catalogSettings(), p.id) ? (
                      <StatusBadge row={rows.get(p.id)} builtIn={p.builtIn} />
                    ) : (
                      <span className="shrink-0 whitespace-nowrap text-xs text-text-tertiary">
                        {L("Slått av av administrator", "Switched off by the administrator")}
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
            {ai.isError ? (
              <p role="alert" className="text-xs text-status-danger">
                {tm((ai.error as Error).message)}
              </p>
            ) : null}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
