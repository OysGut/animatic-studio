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
import { PROVIDERS, capRemaining, catalogSettings, customModelsOf, isModelEnabled, isProviderEnabled, checkKeyFormat, formatUsd, CAPABILITY_LABEL, type ProviderInfo, tm, TEXT_PREFS_KEY, TEXT_TASK_GROUPS, TEXT_TASK_GROUP_LABEL, isTextPrefs, providerInfo, textModelsOf, type TextChoice, type TextPrefs } from "@/core";
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
import { t } from "@/core/i18n/keyed";

const ctl =
  "h-8 rounded-sm border border-border-control bg-surface-3 px-2 text-[13px] text-text-primary disabled:opacity-50";

/** Leverandøren er slått av for alle brukere på adminsiden (DEC-0088). */
function AdminOffNote() {
  return (
    <p role="note" className="text-[13px] text-status-uncertain">
      {t("app-ai-providers-dialog.admin-off-note.p.8c5dbc59b7bc")}
    </p>
  );
}

function StatusBadge({ row, builtIn }: { row: ProviderKeyRow | undefined; builtIn: boolean }) {
  if (builtIn)
    return (
      <span className="flex shrink-0 items-center gap-1 whitespace-nowrap text-xs text-text-secondary">
        <CheckCircle2 className="size-3.5 text-status-success" aria-hidden />{" "}
        {t("app-ai-providers-dialog.status-badge.span.224d42c78711")}
      </span>
    );
  if (!row)
    return (
      <span className="flex shrink-0 items-center gap-1 whitespace-nowrap text-xs text-text-tertiary">
        <CircleDashed className="size-3.5" aria-hidden /> {t("app-ai-providers-dialog.status-badge.span.707ab5215032")}
      </span>
    );
  if (row.status === "failed")
    return (
      <span className="flex shrink-0 items-center gap-1 whitespace-nowrap text-xs text-status-danger">
        <CircleAlert className="size-3.5" aria-hidden />{" "}
        {t("app-ai-providers-dialog.status-badge.span.fb1c3c1e4e13", { key_hint: String(row.key_hint) })}
      </span>
    );
  return (
    <span className="flex shrink-0 items-center gap-1 whitespace-nowrap text-xs text-status-success">
      <CheckCircle2 className="size-3.5" aria-hidden />{" "}
      {t("app-ai-providers-dialog.status-badge.span.61ecf5f930b9", { key_hint: String(row.key_hint) })}
      {row.status === "untested" ? (
        <span className="text-text-tertiary">{t("app-ai-providers-dialog.status-badge.span.2ac592b164f3")}</span>
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
              ? t("app-ai-providers-dialog.text.text.dd4c5d90b477", { value1: String(r.message ? ` ${tm(r.message)}` : "") })
              : t("app-ai-providers-dialog.key-saved-encrypted", { message: r.message ? tm(r.message) : t("app-ai-providers-dialog.key-not-tested") }),
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
          ? { kind: "ok", text: tm(r.message ?? t("app-ai-providers-dialog.text.text.2556fd645036")) }
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
              text: t("app-ai-providers-dialog.text.text.74fba41561c8"),
            }
          : {
              kind: "error",
              text: tm(r.message ?? t("app-ai-providers-dialog.text.text.f1727b86443d")),
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
        <ArrowLeft className="size-3.5" aria-hidden /> {t("app-ai-providers-dialog.provider-detail.button.ce207dab41a6")}
      </button>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-text-primary">{p.name}</h3>
          <p className="mt-0.5 text-[13px] text-text-secondary">{p.description}</p>
          <p className="mt-1 text-xs text-text-tertiary">
            {t("app-ai-providers-dialog.provider-detail.p.61c2d829e075")}{" "}
            {p.capabilities.map((c) => CAPABILITY_LABEL[c]).join(", ")} ·{" "}
            {t("app-ai-providers-dialog.provider-detail.p.aee47d2a8c80")}{" "}
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
          {t("app-ai-providers-dialog.provider-detail.p.e74e02c953df")}
        </p>
      ) : (
        <>
          <section aria-labelledby="steps-title">
            <h4
              id="steps-title"
              className="mb-1.5 text-chrome-label font-medium uppercase tracking-[0.04em] text-text-tertiary"
            >
              {t("app-ai-providers-dialog.provider-detail.h4.38ebf8428398")}
            </h4>
            <ol className="ml-4 flex list-decimal flex-col gap-1 text-[13px] text-text-primary">
              {p.keySteps.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ol>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
              <Link2 href={p.links.signup}>{t("app-ai-providers-dialog.provider-detail.link2.68fc8e36ed68")}</Link2>
              <Link2 href={p.links.billing}>{t("app-ai-providers-dialog.provider-detail.link2.365d69e023a0")}</Link2>
              <Link2 href={p.links.apiKeys}>{t("app-ai-providers-dialog.provider-detail.link2.869dac22c8be")}</Link2>
              <Link2 href={p.links.pricing}>{t("app-ai-providers-dialog.provider-detail.link2.83480500e7e0")}</Link2>
            </div>
          </section>
          <section
            aria-labelledby="key-title"
            className="flex flex-col gap-2 rounded-sm border border-border bg-surface-2 p-3"
          >
            <h4 id="key-title" className="flex items-center gap-1.5 text-[13px] font-medium">
              <KeyRound className="size-4" aria-hidden />
              {row
                ? t("app-ai-providers-dialog.provider-detail.h4.223a339f93d2")
                : t("app-ai-providers-dialog.provider-detail.h4.d7388f0c6428")}
            </h4>
            <input
              type="password"
              autoComplete="off"
              spellCheck={false}
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder={
                row
                  ? t("app-ai-providers-dialog.provider-detail.placeholder.ac0c19dcca57", { key_hint: String(row.key_hint) })
                  : t("app-ai-providers-dialog.provider-detail.placeholder.986493436d94")
              }
              aria-label={t("app-ai-providers-dialog.provider-detail.aria-label.9db0473550a8", { name: String(p.name) })}
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
                {t("app-ai-providers-dialog.provider-detail.button.56574c96b4dc")}
              </Button>
              {row ? (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => void test()}
                  disabled={busy !== null}
                >
                  {busy === "test" ? <Loader2 className="animate-spin" /> : <CheckCircle2 />}
                  {t("app-ai-providers-dialog.provider-detail.button.237e69ee7013")}
                </Button>
              ) : null}
              {row && !confirmRemove ? (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setConfirmRemove(true)}
                  disabled={busy !== null}
                >
                  <Trash2 /> {t("app-ai-providers-dialog.provider-detail.button.53168064bca8")}
                </Button>
              ) : null}
              {confirmRemove ? (
                <span className="flex items-center gap-2 text-xs text-text-secondary">
                  {t("app-ai-providers-dialog.provider-detail.span.2a522c3a0c1e")}
                  <Button size="sm" variant="destructive" onClick={() => void remove()}>
                    {t("app-ai-providers-dialog.provider-detail.button.fc90b6eada1b")}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setConfirmRemove(false)}>
                    {t("app-ai-providers-dialog.provider-detail.button.d869b1dd94e1")}
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
              {t("app-ai-providers-dialog.key-handling", { provider: p.name })}
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
        {t("app-ai-providers-dialog.cap-section.h3.cdefe66f2823")}
      </h3>
      <div className="flex flex-wrap items-center gap-2 text-[13px] text-text-secondary">
        <label className="flex items-center gap-2">
          {t("app-ai-providers-dialog.cap-section.label.dae56024a178")}
          <input
            inputMode="decimal"
            value={value}
            onChange={(e) => setText(e.target.value)}
            placeholder={t("app-ai-providers-dialog.cap-section.placeholder.ff1b9bf382ab")}
            aria-label={t("app-ai-providers-dialog.cap-section.aria-label.d1a95c3820c7")}
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
          {t("app-ai-providers-dialog.cap-section.button.a7b5bb51d444")}
        </Button>
        <span className="tabular text-xs text-text-tertiary">
          {t("app-ai-providers-dialog.cap-section.span.bd5edbbfaffc")} ~{formatUsd(usedUsd)}
          {remaining !== null
            ? t("app-ai-providers-dialog.cap-section.span.3671ec1fb91a", { value1: String(formatUsd(remaining)) })
            : ""}
        </span>
      </div>
      <p className="text-[11px] text-text-tertiary">
        {t("app-ai-providers-dialog.cap-section.p.423354479f86")}
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
        {t("app-ai-providers-dialog.text-ai-section.h3.0c7abb774554")}
      </h3>
      <p className="text-xs text-text-tertiary">
        {t("app-ai-providers-dialog.text-ai-section.p.36980d550912")}
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
                  aria-label={t("app-ai-providers-dialog.text-ai-section.aria-label.bb00b77db626", { value1: String(TEXT_TASK_GROUP_LABEL[g]) })}
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
                  <option value="">{t("app-ai-providers-dialog.text-ai-section.option.9ce269f4a98c")}</option>
                  {providers.map((p) => (
                    <option key={p.provider} value={p.provider}>
                      {providerInfo(p.provider)?.name ?? p.provider}
                    </option>
                  ))}
                  <option value={LOVABLE_TEXT}>{t("app-ai-providers-dialog.text-ai-section.option.c22b9db65c4d")}</option>
                </select>
                <select
                  className={ctl}
                  aria-label={t("app-ai-providers-dialog.text-ai-section.aria-label.30dcefe21caa", { value1: String(TEXT_TASK_GROUP_LABEL[g]) })}
                  value={cur && cur.provider !== "lovable" ? cur.model : ""}
                  disabled={!cur || cur.provider === "lovable"}
                  onChange={(e) =>
                    cur && update(g, { provider: cur.provider, model: e.target.value })
                  }
                >
                  {!cur || cur.provider === "lovable" ? (
                    <option value="">{t("app-ai-providers-dialog.text-ai-section.option.9d0ccf79fa6a")}</option>
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
          {t("app-ai-providers-dialog.text-ai-section.p.05cf8a2e14ac")}
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
          <DialogTitle>{t("app-ai-providers-dialog.providers-dialog.dialog-title.a684c382a7a6")}</DialogTitle>
          <DialogDescription>
            {t("app-ai-providers-dialog.providers-dialog.dialog-description.f5764fdb18ba")}
          </DialogDescription>
        </DialogHeader>
        {ai.isLoading ? (
          <Loader2 className="size-5 animate-spin text-text-tertiary" aria-hidden />
        ) : ai.data?.missing ? (
          <p role="alert" className="text-[13px] text-status-uncertain">
            {t("app-ai-providers-dialog.providers-dialog.p.208bfd9a66c1")}
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
            <ul className="flex flex-col gap-1.5" aria-label={t("app-ai-providers-dialog.providers-dialog.aria-label.c504d5dd202a")}>
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
                        {t("app-ai-providers-dialog.providers-dialog.span.8d349a2870d2")}
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
