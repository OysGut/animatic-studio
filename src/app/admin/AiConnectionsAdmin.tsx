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
import { t } from "@/core/i18n/keyed";

export const AI_ADMIN_KEY = ["admin-ai"] as const;

type Report = (r: { ok: boolean; message: string }) => void;

const KIND_LABEL = (k: ModelKind) =>
  k === "image"
    ? t("app-admin-ai-connections-admin.kind-label.message.9a18abfb4d7d")
    : k === "video"
      ? t("app-admin-ai-connections-admin.kind-label.message.f398947a7a6f")
      : k === "sound"
        ? t("app-admin-ai-connections-admin.kind-label.message.b6de91fc1aba")
        : t("app-admin-ai-connections-admin.kind-label.message.1ebfa38059d9");

const UNIT_LABEL = (u: string) =>
  u === "image"
    ? t("app-admin-ai-connections-admin.unit-label.message.f2a5828f6f0d")
    : u === "second"
      ? t("app-admin-ai-connections-admin.unit-label.message.60907cb754e7")
      : u === "character"
        ? t("app-admin-ai-connections-admin.unit-label.message.6c75bc38ff8d")
        : t("app-admin-ai-connections-admin.unit-label.message.54ff4b676dd7");

const STATUS_LABEL = (s: ProviderRequest["status"]) =>
  s === "open" ? t("app-admin-ai-connections-admin.status-label.message.633d8ff6da76") : s === "done" ? t("app-admin-ai-connections-admin.status-label.message.0cfcf74a0634") : t("app-admin-ai-connections-admin.status-label.message.7953ba35f50d");

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
        {t("app-admin-ai-connections-admin.cron-status-line.p.3f1974e5a0ea")}
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
          {t("app-admin-ai-connections-admin.cron-status-line.p.8dc7cfb4c6c1", { error: String(s.error) })}
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
          {t("app-admin-ai-connections-admin.ai-connections-admin.h2.c716664a2ff0")}
        </h2>
        <span className="text-xs text-text-tertiary">
          {t("app-admin-ai-connections-admin.ai-connections-admin.span.68c07c1eef88")}
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
          {t("app-admin-ai-connections-admin.ai-connections-admin.button.93fab67d265a")}
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
          {t("app-admin-ai-connections-admin.ai-connections-admin.p.66afa263d9a2")}
        </p>
      ) : q.isError || !d ? (
        <p className="text-xs text-status-danger" role="alert">
          {t("app-admin-ai-connections-admin.ai-connections-admin.p.7e478e2636bb")}
        </p>
      ) : !d.ok ? (
        <p className="text-xs text-status-danger">{tm(d.message ?? "")}</p>
      ) : !d.ready ? (
        <p className="text-xs text-status-uncertain" role="alert" data-testid="admin-ai-missing">
          {tm(
            d.message ??
              t("app-admin-ai-connections-admin.ai-connections-admin.p.b24a1bdacb73"),
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
        {t("app-admin-ai-connections-admin.ai-connections.p.d0a5a7034ad3")}
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
                ? t("app-admin-ai-connections-admin.ai-connections.label.d07ba4d88564")
                : t("app-admin-ai-connections-admin.ai-connections.label.3a8d163c2802")}
              <Switch
                checked={p.enabled}
                disabled={busy !== null}
                onCheckedChange={(on) => void toggle(p.id, "*", on)}
                aria-label={t("app-admin-ai-connections-admin.ai-connections.aria-label.10c96c996fde", { name: String(p.name) })}
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
                <th className="px-2 py-1 font-normal">{t("app-admin-ai-connections-admin.ai-connections.th.4c8e24376f67")}</th>
                <th className="px-2 py-1 font-normal">{t("app-admin-ai-connections-admin.ai-connections.th.23e8b38d536a")}</th>
                <th className="px-2 py-1 font-normal">{t("app-admin-ai-connections-admin.ai-connections.th.3f85891d2b10")}</th>
                <th className="px-2 py-1 font-normal">{t("app-admin-ai-connections-admin.ai-connections.th.1650b76803f4")}</th>
                <th className="px-2 py-1 text-right font-normal">{t("app-admin-ai-connections-admin.ai-connections.th.ebd4b70f28b9")}</th>
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
              ? t("app-admin-ai-connections-admin.model-row.div.dc18abc7793b")
              : t("app-admin-ai-connections-admin.model-row.div.f6f9438cc790")}
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
                  {t("app-admin-ai-connections-admin.model-row.button.5e4c5ad020b6")}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 px-2 text-[11px]"
                  onClick={() => setAsk(false)}
                >
                  {t("app-admin-ai-connections-admin.model-row.button.6f0707929bbb")}
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
                {t("app-admin-ai-connections-admin.model-row.button.6b0ba4aa9467")}
              </Button>
            )
          ) : null}
          <Switch
            checked={m.enabled}
            disabled={busy}
            onCheckedChange={onToggle}
            aria-label={t("app-admin-ai-connections-admin.model-row.aria-label.b2d42ee1e8bb", { label: String(m.label) })}
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
          {t("app-admin-ai-connections-admin.add-model-form.button.646c07f8a446")}
        </Button>
      </div>
    );
  return (
    <div
      className="flex flex-col gap-3 rounded-sm border border-border/70 bg-surface-2 p-3"
      data-testid="admin-ai-add-form"
    >
      <h3 className="text-[13px] font-semibold text-text-primary">
        {t("app-admin-ai-connections-admin.add-model-form.h3.646c07f8a446")}
      </h3>
      <p className="text-xs text-text-tertiary">
        {t("app-admin-ai-connections-admin.add-model-form.p.ea91262cd1eb")}
      </p>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="flex flex-col gap-1 text-xs text-text-secondary">
          {t("app-admin-ai-connections-admin.add-model-form.label.452bbe3f193b")}
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
          {t("app-admin-ai-connections-admin.add-model-form.label.4703e723783f")}
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
          {t("app-admin-ai-connections-admin.add-model-form.label.fb114bb521fd")}
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
          {t("app-admin-ai-connections-admin.add-model-form.label.fec74b9ea098")}
          <input
            className={ctl}
            value={label}
            maxLength={120}
            placeholder={t("app-admin-ai-connections-admin.add-model-form.placeholder.26d800137d95")}
            onChange={(e) => setLabel(e.target.value)}
            data-testid="admin-ai-add-label"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-text-secondary">
          {t("app-admin-ai-connections-admin.add-model-form.label.1797a6eddd30")}
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
          {t("app-admin-ai-connections-admin.add-model-form.label.be647b070339")}
          <select className={ctl} value={unit} disabled aria-readonly>
            <option value={unit}>{UNIT_LABEL(unit)}</option>
          </select>
        </label>
      </div>
      <label className="flex flex-col gap-1 text-xs text-text-secondary">
        {t("app-admin-ai-connections-admin.add-model-form.label.82efd2cea02a")}
        <input
          className={ctl}
          value={note}
          maxLength={500}
          onChange={(e) => setNote(e.target.value)}
        />
      </label>
      <p className="text-[11px] text-text-tertiary">
        {examples.length
          ? t("app-admin-ai-connections-admin.add-model-form.p.5319dca1b322", { value1: String(KIND_LABEL(k).toLowerCase()), value2: String(providerInfo(provider)?.name ?? provider), value3: String(examples.join(", ")) })
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
          {t("app-admin-ai-connections-admin.add-model-form.button.c38d85154f17")}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
          {t("app-admin-ai-connections-admin.add-model-form.button.5ed27011dafe")}
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
      setError(t("app-admin-ai-connections-admin.send.set-error.c335ddaa3c3f"));
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
        {t("app-admin-ai-connections-admin.provider-requests.h3.e09b8920084c")}
      </h3>
      <p className="text-xs text-text-tertiary">
        {t("app-admin-ai-connections-admin.provider-requests.p.0c72ebb13dfb")}
      </p>
      <div className="grid gap-3 sm:grid-cols-3">
        {field("name", t("app-admin-ai-connections-admin.provider-requests.field.b1afb1e30080"), t("app-admin-ai-connections-admin.provider-requests.field.1412f19c5dad"), 120)}
        {field("website", t("app-admin-ai-connections-admin.provider-requests.field.ab8c9deb6193"), "https://…", 400)}
        {field("docsUrl", t("app-admin-ai-connections-admin.provider-requests.field.35e2b0fc81ae"), "https://…", 400)}
      </div>
      <label className="flex flex-col gap-1 text-xs text-text-secondary">
        {t("app-admin-ai-connections-admin.provider-requests.label.c3fd39476ecd")}
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
          {t("app-admin-ai-connections-admin.provider-requests.button.0f2b86034247")}
        </Button>
      </div>
      {requests.length ? (
        <table className="w-full text-xs" data-testid="admin-ai-request-list">
          <thead className="text-left text-text-tertiary">
            <tr>
              <th className="px-2 py-1 font-normal">{t("app-admin-ai-connections-admin.provider-requests.th.4154477001de")}</th>
              <th className="px-2 py-1 font-normal">{t("app-admin-ai-connections-admin.provider-requests.th.3b9d05c88038")}</th>
              <th className="px-2 py-1 font-normal">{t("app-admin-ai-connections-admin.provider-requests.th.0e2529fc5e2c")}</th>
              <th className="px-2 py-1 font-normal">{t("app-admin-ai-connections-admin.provider-requests.th.c25e9a0d5335")}</th>
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
                      {t("app-admin-ai-connections-admin.provider-requests.a.ab8c9deb6193")}
                    </a>
                  ) : null}
                  {r.docsUrl ? (
                    <a
                      href={r.docsUrl}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="block text-accent-brand underline-offset-2 hover:underline"
                    >
                      {t("app-admin-ai-connections-admin.provider-requests.a.63ea418b9bd9")}
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
                    aria-label={t("app-admin-ai-connections-admin.provider-requests.aria-label.14bf549fe45a", { name: String(r.name) })}
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
        <p className="text-xs text-text-tertiary">{t("app-admin-ai-connections-admin.provider-requests.p.9a2fd15177c9")}</p>
      )}
    </div>
  );
}
