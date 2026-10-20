/**
 * Adminsiden (DEC-0086, Mars 15.10.2026): alle brukerne (opprettet, sist aktiv, status, prosjekter, AI-forbruk),
 * blokkere og slette (låst i 30 dager, kan bare låses opp av administrator), gjøre andre til administrator,
 * gi låste prosjekter ny eier og fylle ut personvernerklæringen. Administrator ser aldri innholdet i
 * prosjektene, bare navnene. Alt kontrolleres på serveren.
 * DEC-0088 (Mars 15.10.2026): AI-tilkoblinger (slå leverandører og modeller av og på, legge til modeller, be om
 * nye leverandører) og når bakgrunnsjobben sist kjørte – se AiConnectionsAdmin.tsx.
 */
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Loader2, Search, ShieldCheck } from "lucide-react";
import { locale, tm } from "@/core";
import {
  adminReassignProject,
  adminSavePrivacy,
  adminSetAdmin,
  adminSetUserStatus,
  fetchAdminOverview,
  type AdminProject,
  type AdminUser,
} from "@/adapters/account/admin.functions";
import { Button } from "@/components/ui/button";
import { PRIVACY_KEY, usePrivacyPolicy } from "@/app/account/use-account";
import { AiConnectionsAdmin, CronStatusLine, useAiAdmin } from "./AiConnectionsAdmin";
import { t } from "@/core/i18n/keyed";

export const ADMIN_KEY = ["admin-overview"] as const;

const day = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleDateString(locale(), {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : "–";
const usd = (n: number) =>
  `${n.toLocaleString(locale(), { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD`;

export const STATUS_LABEL = (s: AdminUser["status"]) =>
  s === "active"
    ? t("app-admin-admin-page.status-label.message.3005b09235d1")
    : s === "blocked"
      ? t("app-admin-admin-page.status-label.message.4d66d8f3924e")
      : s === "deleting"
        ? t("app-admin-admin-page.status-label.message.c871f437464f")
        : t("app-admin-admin-page.status-label.message.206bb82b7e7f");

export const LOCK_LABEL = (l: string | null) =>
  l === "owner_blocked"
    ? t("app-admin-admin-page.lock-label.message.ca356997515f")
    : l === "owner_deleting"
      ? t("app-admin-admin-page.lock-label.message.c4561b5891e8")
      : l === "owner_deleted"
        ? t("app-admin-admin-page.lock-label.message.2ff1c8869e6d")
        : l === "no_owner"
          ? t("app-admin-admin-page.lock-label.message.7ae247ff81a8")
          : t("app-admin-admin-page.lock-label.message.9e87f490421f");

const ROLE = (r: string) =>
  r === "owner"
    ? t("app-admin-admin-page.role.message.df84d28482ad")
    : r === "editor"
      ? t("app-admin-admin-page.role.message.e25b204fd065")
      : r === "commenter"
        ? t("app-admin-admin-page.role.message.521dbbacf178")
        : t("app-admin-admin-page.role.message.348741ee89a8");

export function AdminPage({ myId }: { myId: string }) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ADMIN_KEY,
    queryFn: () => fetchAdminOverview(),
    staleTime: 15_000,
  });
  const ai = useAiAdmin();
  const [filter, setFilter] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const refresh = () => void qc.invalidateQueries({ queryKey: ADMIN_KEY });
  const report = (r: { ok: boolean; message: string }) => {
    setMsg({ ok: r.ok, text: tm(r.message) });
    refresh();
  };

  const users = useMemo(() => {
    const f = filter.trim().toLowerCase();
    const all = q.data?.users ?? [];
    return f
      ? all.filter(
          (u) => u.email.toLowerCase().includes(f) || u.displayName.toLowerCase().includes(f),
        )
      : all;
  }, [q.data, filter]);

  if (q.isLoading)
    return (
      <p className="m-8 flex items-center gap-2 text-sm text-text-tertiary">
        <Loader2 className="size-4 animate-spin" aria-hidden />
        {t("app-admin-admin-page.admin-page.p.c9f9e0fc0c12")}
      </p>
    );
  if (!q.data?.ok)
    return (
      <main className="mx-auto max-w-[640px] px-6 py-10 text-center">
        <h1 className="text-lg font-semibold text-text-primary">
          {t("app-admin-admin-page.admin-page.h1.c31a2370fb06")}
        </h1>
        <p className="mt-2 text-sm text-text-secondary">
          {tm(q.data?.message ?? t("app-admin-admin-page.admin-page.p.9dc3db4e207e"))}
        </p>
      </main>
    );
  const d = q.data;
  const locked = d.projects.filter((p) => p.lock);
  const active = d.users.filter((u) => u.status === "active");
  const counts = {
    total: d.users.length,
    blocked: d.users.filter((u) => u.status === "blocked").length,
    deleting: d.users.filter((u) => u.status === "deleting").length,
    admins: d.users.filter((u) => u.isAdmin).length,
  };
  return (
    <main
      className="mx-auto flex w-full max-w-[1200px] flex-col gap-5 px-6 py-6"
      data-testid="admin-page"
    >
      <div className="flex flex-wrap items-baseline gap-3">
        <h1 className="text-lg font-semibold text-text-primary">
          {t("app-admin-admin-page.admin-page.h1.c31a2370fb06.2")}
        </h1>
        <span className="text-xs text-text-tertiary">
          {t("app-admin-admin-page.admin-page.span.f0f0d620cbb8", { total: String(counts.total), admins: String(counts.admins), blocked: String(counts.blocked), deleting: String(counts.deleting) })}
        </span>
      </div>
      <CronStatusLine data={ai.data} />
      {d.purged ? (
        <p className="text-xs text-text-secondary">
          {t("app-admin-admin-page.admin-page.p.c03358df5eb2", { purged: String(d.purged) })}
        </p>
      ) : null}
      {msg ? (
        <p
          className={"text-xs " + (msg.ok ? "text-status-success" : "text-status-danger")}
          role="status"
        >
          {msg.text}
        </p>
      ) : null}

      {locked.length ? (
        <section
          className="flex flex-col gap-2 rounded-md border border-status-discrepancy/50 bg-surface-1 p-4"
          data-testid="admin-locked"
        >
          <h2 className="text-sm font-semibold text-text-primary">
            {t("app-admin-admin-page.admin-page.h2.06305ce350de", { length: String(locked.length) })}
          </h2>
          <p className="text-xs text-text-tertiary">
            {t("app-admin-admin-page.admin-page.p.9da1ccc31370")}
          </p>
          {locked.map((p) => (
            <LockedProject key={p.id} p={p} users={active} onDone={report} />
          ))}
        </section>
      ) : null}

      <section className="flex flex-col gap-2 rounded-md border border-border bg-surface-1 p-4">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-text-primary">{t("app-admin-admin-page.admin-page.h2.89e04d89f8fc")}</h2>
          <label className="ml-auto flex items-center gap-1.5 rounded-sm border border-border-control bg-surface-3 px-2">
            <Search className="size-3.5 text-text-tertiary" aria-hidden />
            <input
              className="h-7 w-56 bg-transparent text-xs text-text-primary outline-none"
              placeholder={t("app-admin-admin-page.admin-page.placeholder.7909773c3a75")}
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              aria-label={t("app-admin-admin-page.admin-page.aria-label.25f6a8737929")}
            />
          </label>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs" data-testid="admin-users">
            <thead className="text-left text-text-tertiary">
              <tr>
                <th className="px-2 py-1">{t("app-admin-admin-page.admin-page.th.0f9fd2c60917")}</th>
                <th className="px-2 py-1">{t("app-admin-admin-page.admin-page.th.44988da3f7a8")}</th>
                <th className="px-2 py-1">{t("app-admin-admin-page.admin-page.th.3fbb21c899fa")}</th>
                <th className="px-2 py-1">{t("app-admin-admin-page.admin-page.th.20e10a7b2643")}</th>
                <th className="px-2 py-1">{t("app-admin-admin-page.admin-page.th.e20a386237c9")}</th>
                <th className="px-2 py-1 text-right">{t("app-admin-admin-page.admin-page.th.3e4e0008e278")}</th>
                <th className="px-2 py-1 text-right">{t("app-admin-admin-page.admin-page.th.f3d57d96435f")}</th>
                <th className="px-2 py-1" />
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <UserRow key={u.id} u={u} me={u.id === myId} onDone={report} />
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <AiConnectionsAdmin />

      <PrivacyAdmin
        onDone={(r) => {
          report(r);
          void qc.invalidateQueries({ queryKey: PRIVACY_KEY });
        }}
      />

      <details className="rounded-md border border-border bg-surface-1 p-4">
        <summary className="cursor-pointer text-sm font-semibold text-text-primary">
          {t("app-admin-admin-page.admin-page.summary.0b5e6de839a1", { length: String(d.projects.length) })}
        </summary>
        <table className="mt-2 w-full text-xs">
          <tbody>
            {d.projects.map((p) => (
              <tr key={p.id} className="border-t border-border/60">
                <td className="px-2 py-1 text-text-primary">{p.name}</td>
                <td className="px-2 py-1 text-text-secondary">
                  {p.owners.map((o) => o.name || t("app-admin-admin-page.admin-page.p-owners-map.6b27b8a87422")).join(", ") || "–"}
                </td>
                <td className="px-2 py-1 text-text-tertiary">{day(p.createdAt)}</td>
                <td
                  className={"px-2 py-1 " + (p.lock ? "text-status-danger" : "text-text-tertiary")}
                >
                  {LOCK_LABEL(p.lock)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </main>
  );
}

function UserRow({
  u,
  me,
  onDone,
}: {
  u: AdminUser;
  me: boolean;
  onDone: (r: { ok: boolean; message: string }) => void;
}) {
  const [ask, setAsk] = useState<"block" | "delete" | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  async function act(action: "block" | "unblock" | "delete" | "unlock") {
    setBusy(true);
    try {
      onDone(await adminSetUserStatus({ data: { userId: u.id, action, reason } }));
      setAsk(null);
      setReason("");
    } finally {
      setBusy(false);
    }
  }
  async function admin(on: boolean) {
    setBusy(true);
    try {
      onDone(await adminSetAdmin({ data: { userId: u.id, on } }));
    } finally {
      setBusy(false);
    }
  }
  const btn = "h-6 px-2 text-[11px]";
  const deleted = u.status === "deleted";
  return (
    <>
      <tr className="border-t border-border/60 align-top" data-testid="admin-user">
        <td className="px-2 py-1.5">
          <div className="flex items-center gap-1 text-text-primary">
            {deleted ? t("app-admin-admin-page.user-row.div.f5649f3f9ab8") : u.displayName || u.email}
            {u.isAdmin ? (
              <ShieldCheck
                className="size-3.5 text-accent-brand"
                aria-label={
                  u.permanentAdmin
                    ? t("app-admin-admin-page.user-row.aria-label.93cd0b1f3adf")
                    : t("app-admin-admin-page.user-row.aria-label.d2afaa70c2f7")
                }
              />
            ) : null}
          </div>
          {!deleted && u.displayName ? <div className="text-text-tertiary">{u.email}</div> : null}
        </td>
        <td className="whitespace-nowrap px-2 py-1.5 text-text-secondary">{day(u.createdAt)}</td>
        <td className="whitespace-nowrap px-2 py-1.5 text-text-secondary">
          {day(u.lastActiveAt ?? u.lastSignInAt)}
        </td>
        <td className="px-2 py-1.5">
          <span className={u.status === "active" ? "text-status-success" : "text-status-danger"}>
            {STATUS_LABEL(u.status)}
          </span>
          {u.status === "deleting" ? (
            <div className="text-text-tertiary">
              {t("app-admin-admin-page.user-row.div.968f3528e774", { value1: String(day(u.deleteAfter)) })}
            </div>
          ) : null}
          {u.reason ? <div className="text-text-tertiary">{u.reason}</div> : null}
        </td>
        <td className="px-2 py-1.5 text-text-secondary">
          {u.projects.length ? (
            <details>
              <summary className="cursor-pointer">
                {t("app-admin-admin-page.user-row.summary.d15fbb3c3e67", { length: String(u.projects.length) })}
              </summary>
              <ul className="mt-1">
                {u.projects.map((p) => (
                  <li key={p.id}>
                    {p.name} <span className="text-text-tertiary">({ROLE(p.role)})</span>
                  </li>
                ))}
              </ul>
            </details>
          ) : (
            "–"
          )}
        </td>
        <td className="whitespace-nowrap px-2 py-1.5 text-right text-text-secondary">
          {usd(u.spendUsd)}
          <div className="text-text-tertiary">{t("app-admin-admin-page.user-row.div.7c6ac8d95edb", { jobs: String(u.jobs) })}</div>
        </td>
        <td className="whitespace-nowrap px-2 py-1.5 text-right text-text-secondary">
          {usd(u.spend30Usd)}
        </td>
        <td className="px-2 py-1.5">
          {deleted ? null : (
            <div className="flex flex-wrap justify-end gap-1">
              {u.status === "active" && !u.permanentAdmin && !me ? (
                <>
                  <Button
                    size="sm"
                    variant="secondary"
                    className={btn}
                    disabled={busy}
                    onClick={() => setAsk("block")}
                  >
                    {t("app-admin-admin-page.user-row.button.b6ab829d744f")}
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    className={btn}
                    disabled={busy}
                    onClick={() => setAsk("delete")}
                  >
                    {t("app-admin-admin-page.user-row.button.cb769d080c0b")}
                  </Button>
                </>
              ) : null}
              {u.status === "blocked" ? (
                <Button
                  size="sm"
                  variant="secondary"
                  className={btn}
                  disabled={busy}
                  onClick={() => void act("unblock")}
                >
                  {t("app-admin-admin-page.user-row.button.4df65aa68db3")}
                </Button>
              ) : null}
              {u.status === "deleting" ? (
                <Button
                  size="sm"
                  variant="secondary"
                  className={btn}
                  disabled={busy}
                  onClick={() => void act("unlock")}
                >
                  {t("app-admin-admin-page.user-row.button.68c8209ac8bf")}
                </Button>
              ) : null}
              {u.status === "active" && !u.permanentAdmin ? (
                <Button
                  size="sm"
                  variant="ghost"
                  className={btn}
                  disabled={busy}
                  onClick={() => void admin(!u.isAdmin)}
                >
                  {u.isAdmin
                    ? t("app-admin-admin-page.user-row.button.db04b71d2910")
                    : t("app-admin-admin-page.user-row.button.526696b6d467")}
                </Button>
              ) : null}
            </div>
          )}
        </td>
      </tr>
      {ask ? (
        <tr>
          <td colSpan={8} className="bg-surface-2 px-2 py-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-text-primary">
                {ask === "block"
                  ? t("app-admin-admin-page.user-row.span.8502946aecd1")
                  : t("app-admin-admin-page.user-row.span.3dcd54e05365")}
              </span>
              <input
                className="h-7 min-w-[220px] flex-1 rounded-sm border border-border-control bg-surface-3 px-2 text-xs text-text-primary"
                placeholder={t("app-admin-admin-page.user-row.placeholder.f511fee39a87")}
                value={reason}
                maxLength={500}
                onChange={(e) => setReason(e.target.value)}
              />
              <Button
                size="sm"
                variant="destructive"
                className={btn}
                disabled={busy}
                onClick={() => void act(ask)}
              >
                {ask === "block"
                  ? t("app-admin-admin-page.user-row.button.5781720b249a")
                  : t("app-admin-admin-page.user-row.button.2681a9925e30")}
              </Button>
              <Button size="sm" variant="ghost" className={btn} onClick={() => setAsk(null)}>
                {t("app-admin-admin-page.user-row.button.2638f1efa4a4")}
              </Button>
            </div>
          </td>
        </tr>
      ) : null}
    </>
  );
}

function LockedProject({
  p,
  users,
  onDone,
}: {
  p: AdminProject;
  users: readonly AdminUser[];
  onDone: (r: { ok: boolean; message: string }) => void;
}) {
  const [owner, setOwner] = useState("");
  const [busy, setBusy] = useState(false);
  async function go() {
    setBusy(true);
    try {
      onDone(await adminReassignProject({ data: { projectId: p.id, newOwnerId: owner } }));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="flex flex-wrap items-center gap-2 border-t border-border/60 pt-2 text-xs">
      <span className="min-w-[180px] font-medium text-text-primary">{p.name}</span>
      <span className="text-status-danger">{LOCK_LABEL(p.lock)}</span>
      <span className="text-text-tertiary">
        {p.owners.length
          ? t("app-admin-admin-page.locked-project.span.82c6d58b4834", { value1: String(p.owners.map((o) => o.name || "–").join(", ")) })
          : ""}
      </span>
      <select
        className="ml-auto h-7 rounded-sm border border-border-control bg-surface-3 px-2 text-xs text-text-primary"
        value={owner}
        onChange={(e) => setOwner(e.target.value)}
        aria-label={t("app-admin-admin-page.locked-project.aria-label.cddf3e254116")}
      >
        <option value="">{t("app-admin-admin-page.locked-project.option.09fba6744c76")}</option>
        {users.map((u) => (
          <option key={u.id} value={u.id}>
            {u.displayName ? `${u.displayName} (${u.email})` : u.email}
          </option>
        ))}
      </select>
      <Button size="sm" disabled={!owner || busy} onClick={() => void go()}>
        {t("app-admin-admin-page.locked-project.button.677727d39088")}
      </Button>
    </div>
  );
}

function PrivacyAdmin({ onDone }: { onDone: (r: { ok: boolean; message: string }) => void }) {
  const policy = usePrivacyPolicy();
  const p = policy.data;
  const [f, setF] = useState<Record<string, string> | null>(null);
  const [busy, setBusy] = useState(false);
  const cur = f ?? {
    controllerName: p?.controllerName ?? "",
    orgNumber: p?.orgNumber ?? "",
    address: p?.address ?? "",
    contactEmail: p?.contactEmail ?? "",
    storageRegion: p?.storageRegion ?? "",
    note: p?.note ?? "",
  };
  const set = (k: string, v: string) => setF({ ...cur, [k]: v });
  const field = (k: string, label: string, ph: string, max: number) => (
    <label className="flex flex-col gap-1 text-xs text-text-secondary">
      {label}
      <input
        className="h-8 rounded-sm border border-border-control bg-surface-3 px-2 text-[13px] text-text-primary"
        value={cur[k] ?? ""}
        placeholder={ph}
        maxLength={max}
        onChange={(e) => set(k, e.target.value)}
      />
    </label>
  );
  async function save() {
    setBusy(true);
    try {
      const r = await adminSavePrivacy({ data: cur });
      onDone(r);
      if (r.ok) setF(null);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      className="flex flex-col gap-3 rounded-md border border-border bg-surface-1 p-4"
      data-testid="admin-privacy"
    >
      <div className="flex items-baseline gap-2">
        <h2 className="text-sm font-semibold text-text-primary">
          {t("app-admin-admin-page.privacy-admin.h2.83f00283bf55")}
        </h2>
        <span className="text-xs text-text-tertiary">
          {p ? t("app-admin-admin-page.privacy-admin.span.5b5f920144eb", { version: String(p.version) }) : ""}
        </span>
        <Link
          to="/personvern"
          className="ml-auto text-xs text-accent-brand underline-offset-2 hover:underline"
        >
          {t("app-admin-admin-page.privacy-admin.link.5678f4294d88")}
        </Link>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {field(
          "controllerName",
          t("app-admin-admin-page.privacy-admin.field.b0b933fa56ec"),
          t("app-admin-admin-page.privacy-admin.field.d57b35cd2237"),
          200,
        )}
        {field("orgNumber", t("app-admin-admin-page.privacy-admin.field.c4ba7c3fb7b2"), "123 456 789", 40)}
        {field(
          "address",
          t("app-admin-admin-page.privacy-admin.field.c5ea01529e3d"),
          t("app-admin-admin-page.privacy-admin.field.358c7b1c8cc3"),
          400,
        )}
        {field(
          "contactEmail",
          t("app-admin-admin-page.privacy-admin.field.534b4d72fdab"),
          "personvern@…",
          200,
        )}
        {field(
          "storageRegion",
          t("app-admin-admin-page.privacy-admin.field.0001604ca29a"),
          t("app-admin-admin-page.privacy-admin.field.53824a104508"),
          200,
        )}
      </div>
      <label className="flex flex-col gap-1 text-xs text-text-secondary">
        {t("app-admin-admin-page.privacy-admin.label.14ad85b60799")}
        <textarea
          className="min-h-[70px] rounded-sm border border-border-control bg-surface-3 px-2 py-1.5 text-[13px] text-text-primary"
          value={cur["note"] ?? ""}
          maxLength={4000}
          onChange={(e) => set("note", e.target.value)}
        />
      </label>
      <div className="flex items-center gap-3">
        <Button size="sm" disabled={!f || busy} onClick={() => void save()}>
          {t("app-admin-admin-page.privacy-admin.button.b9d1e1700d6f")}
        </Button>
        <span className="text-[11px] text-text-tertiary">
          {t("app-admin-admin-page.privacy-admin.span.a9f0baada789")}
        </span>
      </div>
    </section>
  );
}
