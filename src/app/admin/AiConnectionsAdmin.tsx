/**
 * AI-tilkoblinger på adminsiden (Mars 15.10.2026, DEC-0088, migrasjon 0034): «Administrer AI-tilkoblinger»
 * (alle leverandører og modeller med pris og hva de kan, slå av og på for alle brukere), «Legg til ny modell»
 * hos leverandører vi allerede støtter, og «Be om ny leverandør» (krever en kobling i koden). Øverst på siden:
 * når bakgrunnsjobben sist kjørte. Alt kontrolleres på serveren (bare administrator).
 */
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ChevronDown, ChevronRight, Clock, Loader2, Plus } from "lucide-react";
import {
  CAPABILITY_LABEL,
  CUSTOM_MODEL_RULES,
  L,
  customKinds,
  customProviders,
  locale,
  priceUnitFor,
  providerInfo,
  tm,
  validateCustomModel,
  type ModelKind,
} from "@/core";
import { adminCatalog, priceText, type CatalogModelRow } from "@/core/generation/ai-catalog";
import { builtInModel } from "@/core/generation/providers";
import {
  adminAddProviderRequest,
  adminRemoveCustomModel,
  adminSaveCustomModel,
  adminSetModelEnabled,
  adminSetProviderRequestStatus,
  fetchAiAdmin,
  type AiAdminOverview,
} from "@/adapters/account/admin.functions";
import type { ProviderRequest } from "@/adapters/account/ai-models.server";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { AI_MODEL_SETTINGS_KEY } from "@/app/ai/use-ai-model-settings";
import { cronSummary } from "./cron-status";

export const AI_ADMIN_KEY = ["admin-ai"] as const;

type Report = (r: { ok: boolean; message: string }) => void;

const KIND_LABEL = (k: ModelKind) =>
  k === "image"
    ? L("Bilde", "Image")
    : k === "video"
      ? L("Video", "Video")
      : k === "sound"
        ? L("Lyd", "Sound")
        : L("Tekst", "Text");

const UNIT_LABEL = (u: string) =>
  u === "image"
    ? L("per bilde", "per image")
    : u === "second"
      ? L("per sekund", "per second")
      : u === "character"
        ? L("per tegn", "per character")
        : L("per kall", "per call");

const STATUS_LABEL = (s: ProviderRequest["status"]) =>
  s === "open" ? L("Åpen", "Open") : s === "done" ? L("Ferdig", "Done") : L("Avvist", "Rejected");

const ctl =
  "h-8 rounded-sm border border-border-control bg-surface-3 px-2 text-[13px] text-text-primary disabled:opacity-50";

export function useAiAdmin() {
  return useQuery({
    queryKey: AI_ADMIN_KEY,
    queryFn: () => fetchAiAdmin(),
    staleTime: 15_000,
    retry: false,
  });
}

/** «Bakgrunnsjobb: sist kjørt kl. …», med advarsel når den ikke har kjørt de siste 10 minuttene. */
export function CronStatusLine({ data }: { data: AiAdminOverview | undefined }) {
  if (!data?.ok) return null;
  if (!data.ready)
    return (
      <p className="flex items-center gap-1.5 text-xs text-text-tertiary" data-testid="admin-cron">
        <Clock className="size-3.5" aria-hidden />
        {L(
          "Bakgrunnsjobb: status vises når databasen er oppdatert (migrasjon 0034).",
          "Background job: the status is shown when the database is updated (migration 0034).",
        )}
      </p>
    );
  const s = cronSummary(data.cron);
  return (
    <div className="flex flex-col gap-1 text-xs" data-testid="admin-cron">
      <p className="flex items-center gap-1.5 text-text-secondary">
        <Clock className="size-3.5 text-text-tertiary" aria-hidden />
        {s.text}
      </p>
      {s.warning ? (
        <p
          className="flex items-center gap-1.5 text-status-uncertain"
          role="alert"
          data-testid="admin-cron-warning"
        >
          <AlertTriangle className="size-3.5" aria-hidden />
          {s.warning}
        </p>
      ) : null}
      {s.error ? (
        <p className="text-status-danger">
          {L(`Siste kjøring feilet: ${s.error}`, `The last run failed: ${s.error}`)}
        </p>
      ) : null}
    </div>
  );
}

export function AiConnectionsAdmin() {
  const qc = useQueryClient();
  const q = useAiAdmin();
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const report: Report = (r) => {
    setMsg({ ok: r.ok, text: tm(r.message) });
    void qc.invalidateQueries({ queryKey: AI_ADMIN_KEY });
    // Valglistene i appen henter innstillingene på nytt
    void qc.invalidateQueries({ queryKey: AI_MODEL_SETTINGS_KEY });
  };
  const d = q.data;
  return (
    <section
      className="flex flex-col gap-3 rounded-md border border-border bg-surface-1 p-4"
      data-testid="admin-ai"
    >
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-sm font-semibold text-text-primary">
          {L("AI-tilkoblinger", "AI connections")}
        </h2>
        <span className="text-xs text-text-tertiary">
          {L(
            "Hvilke AI-leverandører og modeller alle brukerne kan velge, og hva de koster.",
            "Which AI providers and models all users can choose, and what they cost.",
          )}
        </span>
        <Button
          size="sm"
          variant={open ? "secondary" : "default"}
          className="ml-auto"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          data-testid="admin-ai-toggle"
        >
          {open ? (
            <ChevronDown className="size-3.5" aria-hidden />
          ) : (
            <ChevronRight className="size-3.5" aria-hidden />
          )}
          {L("Administrer AI-tilkoblinger", "Manage AI connections")}
        </Button>
      </div>
      {open && msg ? (
        <p
          className={"text-xs " + (msg.ok ? "text-status-success" : "text-status-danger")}
          role="status"
          data-testid="admin-ai-message"
        >
          {msg.text}
        </p>
      ) : null}
      {!open ? null : q.isLoading ? (
        <p className="flex items-center gap-2 text-xs text-text-tertiary">
          <Loader2 className="size-3.5 animate-spin" aria-hidden />
          {L("Henter AI-tilkoblingene …", "Fetching the AI connections …")}
        </p>
      ) : q.isError || !d ? (
        <p className="text-xs text-status-danger" role="alert">
          {L("AI-tilkoblingene kunne ikke hentes.", "The AI connections could not be fetched.")}
        </p>
      ) : !d.ok ? (
        <p className="text-xs text-status-danger">{tm(d.message ?? "")}</p>
      ) : !d.ready ? (
        <p className="text-xs text-status-uncertain" role="alert" data-testid="admin-ai-missing">
          {tm(
            d.message ??
              L(
                "Databasen må oppdateres (migrasjon 0034).",
                "The database must be updated (migration 0034).",
              ),
          )}
        </p>
      ) : (
        <AiConnections data={d} onDone={report} />
      )}
    </section>
  );
}

function AiConnections({ data, onDone }: { data: AiAdminOverview; onDone: Report }) {
  const catalog = adminCatalog(data.settings);
  const [busy, setBusy] = useState<string | null>(null);
  async function toggle(provider: string, model: string, enabled: boolean) {
    setBusy(`${provider}|${model}`);
    try {
      onDone(await adminSetModelEnabled({ data: { provider, model, enabled } }));
    } finally {
      setBusy(null);
    }
  }
  async function remove(provider: string, model: string) {
    setBusy(`${provider}|${model}`);
    try {
      onDone(await adminRemoveCustomModel({ data: { provider, model } }));
    } finally {
      setBusy(null);
    }
  }
  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-text-tertiary">
        {L(
          "Det som er slått av, vises ikke i valglistene i appen og avvises på serveren. Prisene er anslag fra leverandørenes prislister (eller det administrator har oppgitt). Hver bruker trenger fortsatt sin egen nøkkel hos leverandøren.",
          "What is switched off is not shown in the lists in the app and is refused on the server. The prices are estimates from the providers' price lists (or what the administrator has entered). Each user still needs their own key with the provider.",
        )}
      </p>
      {catalog.map((p) => (
        <div
          key={p.id}
          className="rounded-sm border border-border/70 bg-surface-2 p-3"
          data-testid="admin-ai-provider"
          data-provider={p.id}
        >
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[13px] font-medium text-text-primary">{p.name}</span>
            <span className="text-xs text-text-tertiary">
              {p.capabilities.map((c) => CAPABILITY_LABEL[c]).join(" · ")}
            </span>
            <label className="ml-auto flex items-center gap-2 text-xs text-text-secondary">
              {p.enabled
                ? L("Leverandøren er på", "The provider is on")
                : L("Leverandøren er av", "The provider is off")}
              <Switch
                checked={p.enabled}
                disabled={busy !== null}
                onCheckedChange={(on) => void toggle(p.id, "*", on)}
                aria-label={L(`Slå ${p.name} av eller på`, `Switch ${p.name} off or on`)}
              />
            </label>
          </div>
          <table className="mt-2 w-full table-fixed text-xs">
            <colgroup>
              <col className="w-[30%]" />
              <col className="w-[13%]" />
              <col className="w-[15%]" />
              <col />
              <col className="w-[120px]" />
            </colgroup>
            <thead className="text-left text-text-tertiary">
              <tr>
                <th className="px-2 py-1 font-normal">{L("Modell", "Model")}</th>
                <th className="px-2 py-1 font-normal">{L("Lager", "Makes")}</th>
                <th className="px-2 py-1 font-normal">{L("Pris (anslag)", "Price (estimate)")}</th>
                <th className="px-2 py-1 font-normal">{L("Kan", "Can")}</th>
                <th className="px-2 py-1 text-right font-normal">{L("På", "On")}</th>
              </tr>
            </thead>
            <tbody>
              {p.models.map((m) => (
                <ModelRow
                  key={m.id}
                  m={m}
                  providerOn={p.enabled}
                  busy={busy !== null}
                  onToggle={(on) => void toggle(p.id, m.id, on)}
                  onRemove={() => void remove(p.id, m.id)}
                />
              ))}
            </tbody>
          </table>
        </div>
      ))}
      <AddModelForm onDone={onDone} />
      <ProviderRequests requests={data.requests} onDone={onDone} />
    </div>
  );
}

function ModelRow({
  m,
  providerOn,
  busy,
  onToggle,
  onRemove,
}: {
  m: CatalogModelRow;
  providerOn: boolean;
  busy: boolean;
  onToggle: (on: boolean) => void;
  onRemove: () => void;
}) {
  const [ask, setAsk] = useState(false);
  const dim = !providerOn || !m.enabled;
  return (
    <tr
      className={"border-t border-border/50 align-top " + (dim ? "opacity-60" : "")}
      data-testid="admin-ai-model"
      data-model={m.id}
    >
      <td className="px-2 py-1.5">
        <div className="text-text-primary">{m.label}</div>
        <div className="break-all font-mono text-[11px] text-text-tertiary">{m.id}</div>
        {m.custom ? (
          <div className="text-[11px] text-accent-brand">
            {m.broken
              ? L(
                  "Lagt til av administrator – kan ikke brukes (ID-en passer ikke lenger)",
                  "Added by administrator – cannot be used (the ID no longer fits)",
                )
              : L("Lagt til av administrator", "Added by administrator")}
          </div>
        ) : null}
        {m.note ? <div className="text-[11px] text-text-tertiary">{m.note}</div> : null}
      </td>
      <td className="px-2 py-1.5 text-text-secondary">
        {m.capability ? CAPABILITY_LABEL[m.capability] : m.kind ? KIND_LABEL(m.kind) : "–"}
      </td>
      <td className="px-2 py-1.5 text-text-secondary">{priceText(m.priceUsd, m.priceUnit)}</td>
      <td className="px-2 py-1.5 text-text-tertiary">{m.features.join(" · ") || "–"}</td>
      <td className="px-2 py-1.5">
        <div className="flex items-center justify-end gap-2">
          {m.custom ? (
            ask ? (
              <>
                <Button
                  size="sm"
                  variant="destructive"
                  className="h-6 px-2 text-[11px]"
                  disabled={busy}
                  onClick={onRemove}
                >
                  {L("Fjern", "Remove")}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 px-2 text-[11px]"
                  onClick={() => setAsk(false)}
                >
                  {L("Avbryt", "Cancel")}
                </Button>
              </>
            ) : (
              <Button
                size="sm"
                variant="ghost"
                className="h-6 px-2 text-[11px]"
                disabled={busy}
                onClick={() => setAsk(true)}
              >
                {L("Fjern …", "Remove …")}
              </Button>
            )
          ) : null}
          <Switch
            checked={m.enabled}
            disabled={busy}
            onCheckedChange={onToggle}
            aria-label={L(`Slå ${m.label} av eller på`, `Switch ${m.label} off or on`)}
          />
        </div>
      </td>
    </tr>
  );
}

function AddModelForm({ onDone }: { onDone: Report }) {
  const [open, setOpen] = useState(false);
  const providers = customProviders();
  const [provider, setProvider] = useState<string>(providers[0] ?? "fal");
  const kinds = customKinds(provider);
  const [kind, setKind] = useState<ModelKind>(kinds[0] ?? "image");
  const k: ModelKind = kinds.includes(kind) ? kind : (kinds[0] ?? "image");
  const [model, setModel] = useState("");
  const [label, setLabel] = useState("");
  const [price, setPrice] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const unit = priceUnitFor(k);
  const examples = CUSTOM_MODEL_RULES.filter((r) => r.provider === provider && r.kind === k).map(
    (r) => r.example,
  );
  const input = {
    provider,
    kind: k,
    model: model.trim(),
    label: label.trim(),
    priceUsd: price.trim() === "" ? Number.NaN : Number(price.replace(",", ".")),
    priceUnit: unit,
    note: note.trim(),
  };
  async function save() {
    // Samme kontroll som serveren, så feilen vises før noe sendes
    const v = validateCustomModel(input, (p, m) => !!builtInModel(p, m));
    if (!v.ok) {
      setError(v.error);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const r = await adminSaveCustomModel({ data: v.value });
      onDone(r);
      if (r.ok) {
        setModel("");
        setLabel("");
        setPrice("");
        setNote("");
        setOpen(false);
      } else setError(tm(r.message));
    } finally {
      setBusy(false);
    }
  }
  if (!open)
    return (
      <div>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => setOpen(true)}
          data-testid="admin-ai-add"
        >
          <Plus className="size-3.5" aria-hidden />
          {L("Legg til ny modell", "Add a new model")}
        </Button>
      </div>
    );
  return (
    <div
      className="flex flex-col gap-3 rounded-sm border border-border/70 bg-surface-2 p-3"
      data-testid="admin-ai-add-form"
    >
      <h3 className="text-[13px] font-semibold text-text-primary">
        {L("Legg til ny modell", "Add a new model")}
      </h3>
      <p className="text-xs text-text-tertiary">
        {L(
          "Hos leverandører vi allerede støtter kan en ny modell legges til uten ny kode – men bare modeller i samme familie som de innebygde, fordi programmet sender de samme feltene. Den nye modellen arver lengder, startbilde og andre tekniske egenskaper fra den innebygde modellen i familien. Prisen du oppgir, brukes i kostnadsanslaget.",
          "With providers we already support, a new model can be added without new code – but only models in the same family as the built-in ones, because the program sends the same fields. The new model inherits lengths, start image and other technical properties from the built-in model in the family. The price you enter is used in the cost estimate.",
        )}
      </p>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="flex flex-col gap-1 text-xs text-text-secondary">
          {L("Leverandør", "Provider")}
          <select
            className={ctl}
            value={provider}
            onChange={(e) => setProvider(e.target.value)}
            data-testid="admin-ai-add-provider"
          >
            {providers.map((p) => (
              <option key={p} value={p}>
                {providerInfo(p)?.name ?? p}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-text-secondary">
          {L("Type", "Type")}
          <select
            className={ctl}
            value={k}
            onChange={(e) => setKind(e.target.value as ModelKind)}
            data-testid="admin-ai-add-kind"
          >
            {kinds.map((x) => (
              <option key={x} value={x}>
                {KIND_LABEL(x)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-text-secondary">
          {L("Modell-ID hos leverandøren", "Model ID at the provider")}
          <input
            className={ctl + " font-mono"}
            value={model}
            maxLength={120}
            placeholder={examples[0] ?? ""}
            onChange={(e) => setModel(e.target.value)}
            data-testid="admin-ai-add-model"
            spellCheck={false}
            autoCapitalize="off"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-text-secondary">
          {L("Navn i valglistene", "Name in the lists")}
          <input
            className={ctl}
            value={label}
            maxLength={120}
            placeholder={L("f.eks. Seedream 5", "e.g. Seedream 5")}
            onChange={(e) => setLabel(e.target.value)}
            data-testid="admin-ai-add-label"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-text-secondary">
          {L("Pris i USD", "Price in USD")}
          <input
            className={ctl}
            value={price}
            inputMode="decimal"
            placeholder="0.04"
            onChange={(e) => setPrice(e.target.value)}
            data-testid="admin-ai-add-price"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-text-secondary">
          {L("Enhet", "Unit")}
          <select className={ctl} value={unit} disabled aria-readonly>
            <option value={unit}>{UNIT_LABEL(unit)}</option>
          </select>
        </label>
      </div>
      <label className="flex flex-col gap-1 text-xs text-text-secondary">
        {L("Merknad (valgfri)", "Note (optional)")}
        <input
          className={ctl}
          value={note}
          maxLength={500}
          onChange={(e) => setNote(e.target.value)}
        />
      </label>
      <p className="text-[11px] text-text-tertiary">
        {examples.length
          ? L(
              `Modell-ID-er som virker for ${KIND_LABEL(k).toLowerCase()} hos ${providerInfo(provider)?.name ?? provider}, f.eks.: ${examples.join(", ")}. Bare små bokstaver, tall og . _ / -.`,
              `Model IDs that work for ${KIND_LABEL(k).toLowerCase()} with ${providerInfo(provider)?.name ?? provider}, e.g.: ${examples.join(", ")}. Only lower-case letters, digits and . _ / -.`,
            )
          : null}
      </p>
      {error ? (
        <p className="text-xs text-status-danger" role="alert" data-testid="admin-ai-add-error">
          {error}
        </p>
      ) : null}
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          disabled={busy}
          onClick={() => void save()}
          data-testid="admin-ai-add-save"
        >
          {L("Legg til modellen", "Add the model")}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
          {L("Avbryt", "Cancel")}
        </Button>
      </div>
    </div>
  );
}

function ProviderRequests({
  requests,
  onDone,
}: {
  requests: readonly ProviderRequest[];
  onDone: Report;
}) {
  const [f, setF] = useState({ name: "", website: "", docsUrl: "", note: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function send() {
    if (!f.name.trim()) {
      setError(L("Skriv navnet på leverandøren.", "Enter the name of the provider."));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const r = await adminAddProviderRequest({ data: f });
      onDone(r);
      if (r.ok) setF({ name: "", website: "", docsUrl: "", note: "" });
      else setError(tm(r.message));
    } finally {
      setBusy(false);
    }
  }
  async function status(id: string, s: ProviderRequest["status"]) {
    onDone(await adminSetProviderRequestStatus({ data: { id, status: s } }));
  }
  const field = (k: keyof typeof f, label: string, ph: string, max: number) => (
    <label className="flex flex-col gap-1 text-xs text-text-secondary">
      {label}
      <input
        className={ctl}
        value={f[k]}
        placeholder={ph}
        maxLength={max}
        onChange={(e) => setF({ ...f, [k]: e.target.value })}
        data-testid={`admin-ai-request-${k}`}
      />
    </label>
  );
  return (
    <div
      className="flex flex-col gap-3 rounded-sm border border-border/70 bg-surface-2 p-3"
      data-testid="admin-ai-requests"
    >
      <h3 className="text-[13px] font-semibold text-text-primary">
        {L("Be om ny leverandør", "Request a new provider")}
      </h3>
      <p className="text-xs text-text-tertiary">
        {L(
          "En helt ny leverandør (for eksempel Midjourney eller Luma) krever en kobling i koden som utvikleren lager: hvordan nøkkelen sjekkes, hvilke felt som sendes og hvordan resultatet hentes. Fyll ut ønsket her, så ligger det i listen til det er ferdig eller avvist.",
          "A completely new provider (for example Midjourney or Luma) needs a connection in the code that the developer builds: how the key is checked, which fields are sent and how the result is fetched. Fill in the request here, and it stays in the list until it is done or rejected.",
        )}
      </p>
      <div className="grid gap-3 sm:grid-cols-3">
        {field("name", L("Navn", "Name"), L("f.eks. Luma AI", "e.g. Luma AI"), 120)}
        {field("website", L("Nettside", "Website"), "https://…", 400)}
        {field("docsUrl", L("Dokumentasjon (API)", "Documentation (API)"), "https://…", 400)}
      </div>
      <label className="flex flex-col gap-1 text-xs text-text-secondary">
        {L("Merknad (hva skal den brukes til?)", "Note (what should it be used for?)")}
        <textarea
          className="min-h-[56px] rounded-sm border border-border-control bg-surface-3 px-2 py-1.5 text-[13px] text-text-primary"
          value={f.note}
          maxLength={2000}
          onChange={(e) => setF({ ...f, note: e.target.value })}
          data-testid="admin-ai-request-note"
        />
      </label>
      {error ? (
        <p className="text-xs text-status-danger" role="alert">
          {error}
        </p>
      ) : null}
      <div>
        <Button
          size="sm"
          variant="secondary"
          disabled={busy}
          onClick={() => void send()}
          data-testid="admin-ai-request-send"
        >
          {L("Send ønsket", "Send the request")}
        </Button>
      </div>
      {requests.length ? (
        <table className="w-full text-xs" data-testid="admin-ai-request-list">
          <thead className="text-left text-text-tertiary">
            <tr>
              <th className="px-2 py-1 font-normal">{L("Leverandør", "Provider")}</th>
              <th className="px-2 py-1 font-normal">{L("Merknad", "Note")}</th>
              <th className="px-2 py-1 font-normal">{L("Sendt", "Sent")}</th>
              <th className="px-2 py-1 font-normal">{L("Status", "Status")}</th>
            </tr>
          </thead>
          <tbody>
            {requests.map((r) => (
              <tr key={r.id} className="border-t border-border/50 align-top">
                <td className="px-2 py-1.5">
                  <div className="text-text-primary">{r.name}</div>
                  {r.website ? (
                    <a
                      href={r.website}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="block text-accent-brand underline-offset-2 hover:underline"
                    >
                      {L("Nettside", "Website")}
                    </a>
                  ) : null}
                  {r.docsUrl ? (
                    <a
                      href={r.docsUrl}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="block text-accent-brand underline-offset-2 hover:underline"
                    >
                      {L("Dokumentasjon", "Documentation")}
                    </a>
                  ) : null}
                </td>
                <td className="whitespace-pre-wrap px-2 py-1.5 text-text-secondary">
                  {r.note || "–"}
                </td>
                <td className="whitespace-nowrap px-2 py-1.5 text-text-tertiary">
                  {r.createdAt
                    ? new Date(r.createdAt).toLocaleDateString(locale(), {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })
                    : "–"}
                </td>
                <td className="px-2 py-1.5">
                  <select
                    className={ctl + " h-7 text-xs"}
                    value={r.status}
                    onChange={(e) => void status(r.id, e.target.value as ProviderRequest["status"])}
                    aria-label={L(`Status for ${r.name}`, `Status for ${r.name}`)}
                    data-testid="admin-ai-request-status"
                  >
                    {(["open", "done", "rejected"] as const).map((s) => (
                      <option key={s} value={s}>
                        {STATUS_LABEL(s)}
                      </option>
                    ))}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="text-xs text-text-tertiary">{L("Ingen ønsker ennå.", "No requests yet.")}</p>
      )}
    </div>
  );
}
