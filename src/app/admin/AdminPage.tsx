/**
 * Adminsiden (DEC-0086, Mars 15.10.2026): alle brukerne (opprettet, sist aktiv, status, prosjekter, AI-forbruk),
 * blokkere og slette (låst i 30 dager, kan bare låses opp av administrator), gjøre andre til administrator,
 * gi låste prosjekter ny eier og fylle ut personvernerklæringen. Administrator ser aldri innholdet i
 * prosjektene, bare navnene. Alt kontrolleres på serveren.
 */
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Loader2, Search, ShieldCheck } from "lucide-react";
import { L, locale, tm } from "@/core";
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
    ? L("Aktiv", "Active")
    : s === "blocked"
      ? L("Blokkert", "Blocked")
      : s === "deleting"
        ? L("Låst for sletting", "Locked for deletion")
        : L("Slettet", "Deleted");

export const LOCK_LABEL = (l: string | null) =>
  l === "owner_blocked"
    ? L("Eieren er blokkert", "The owner is blocked")
    : l === "owner_deleting"
      ? L("Eieren har slettet kontoen (30 dager)", "The owner has deleted the account (30 days)")
      : l === "owner_deleted"
        ? L("Eieren er slettet", "The owner is deleted")
        : l === "no_owner"
          ? L("Ingen eier", "No owner")
          : L("Åpent", "Open");

const ROLE = (r: string) =>
  r === "owner"
    ? L("eier", "owner")
    : r === "editor"
      ? L("redaktør", "editor")
      : r === "commenter"
        ? L("kommentator", "commenter")
        : L("leser", "viewer");

export function AdminPage({ myId }: { myId: string }) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ADMIN_KEY,
    queryFn: () => fetchAdminOverview(),
    staleTime: 15_000,
  });
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
        {L("Henter brukerne …", "Fetching the users …")}
      </p>
    );
  if (!q.data?.ok)
    return (
      <main className="mx-auto max-w-[640px] px-6 py-10 text-center">
        <h1 className="text-lg font-semibold text-text-primary">
          {L("Administrasjon", "Administration")}
        </h1>
        <p className="mt-2 text-sm text-text-secondary">
          {tm(q.data?.message ?? L("Ingen tilgang.", "No access."))}
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
          {L("Administrasjon", "Administration")}
        </h1>
        <span className="text-xs text-text-tertiary">
          {L(
            `${counts.total} brukere · ${counts.admins} administratorer · ${counts.blocked} blokkert · ${counts.deleting} låst for sletting`,
            `${counts.total} users · ${counts.admins} administrators · ${counts.blocked} blocked · ${counts.deleting} locked for deletion`,
          )}
        </span>
      </div>
      {d.purged ? (
        <p className="text-xs text-text-secondary">
          {L(
            `${d.purged} konto(er) var låst i 30 dager og er nå slettet for godt (anonymisert).`,
            `${d.purged} account(s) had been locked for 30 days and are now deleted for good (anonymised).`,
          )}
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
            {L(`Låste prosjekter (${locked.length})`, `Locked projects (${locked.length})`)}
          </h2>
          <p className="text-xs text-text-tertiary">
            {L(
              "Medlemmene ser bare en melding om at prosjektet er låst. Gi prosjektet en ny eier for å åpne det igjen; tidligere eiere blir redaktører.",
              "The members only see a message that the project is locked. Give the project a new owner to open it again; former owners become editors.",
            )}
          </p>
          {locked.map((p) => (
            <LockedProject key={p.id} p={p} users={active} onDone={report} />
          ))}
        </section>
      ) : null}

      <section className="flex flex-col gap-2 rounded-md border border-border bg-surface-1 p-4">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-text-primary">{L("Brukere", "Users")}</h2>
          <label className="ml-auto flex items-center gap-1.5 rounded-sm border border-border-control bg-surface-3 px-2">
            <Search className="size-3.5 text-text-tertiary" aria-hidden />
            <input
              className="h-7 w-56 bg-transparent text-xs text-text-primary outline-none"
              placeholder={L("Søk på navn eller e-post", "Search by name or email")}
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              aria-label={L("Søk", "Search")}
            />
          </label>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs" data-testid="admin-users">
            <thead className="text-left text-text-tertiary">
              <tr>
                <th className="px-2 py-1">{L("Bruker", "User")}</th>
                <th className="px-2 py-1">{L("Laget", "Created")}</th>
                <th className="px-2 py-1">{L("Sist aktiv", "Last active")}</th>
                <th className="px-2 py-1">{L("Status", "Status")}</th>
                <th className="px-2 py-1">{L("Prosjekter", "Projects")}</th>
                <th className="px-2 py-1 text-right">{L("AI totalt", "AI total")}</th>
                <th className="px-2 py-1 text-right">{L("Siste 30 dager", "Last 30 days")}</th>
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

      <PrivacyAdmin
        onDone={(r) => {
          report(r);
          void qc.invalidateQueries({ queryKey: PRIVACY_KEY });
        }}
      />

      <details className="rounded-md border border-border bg-surface-1 p-4">
        <summary className="cursor-pointer text-sm font-semibold text-text-primary">
          {L(`Alle prosjekter (${d.projects.length})`, `All projects (${d.projects.length})`)}
        </summary>
        <table className="mt-2 w-full text-xs">
          <tbody>
            {d.projects.map((p) => (
              <tr key={p.id} className="border-t border-border/60">
                <td className="px-2 py-1 text-text-primary">{p.name}</td>
                <td className="px-2 py-1 text-text-secondary">
                  {p.owners.map((o) => o.name || L("(uten navn)", "(no name)")).join(", ") || "–"}
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
            {deleted ? L("Slettet bruker", "Deleted user") : u.displayName || u.email}
            {u.isAdmin ? (
              <ShieldCheck
                className="size-3.5 text-accent-brand"
                aria-label={
                  u.permanentAdmin
                    ? L("Fast administrator", "Permanent administrator")
                    : L("Administrator", "Administrator")
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
              {L(`slettes ${day(u.deleteAfter)}`, `deleted on ${day(u.deleteAfter)}`)}
            </div>
          ) : null}
          {u.reason ? <div className="text-text-tertiary">{u.reason}</div> : null}
        </td>
        <td className="px-2 py-1.5 text-text-secondary">
          {u.projects.length ? (
            <details>
              <summary className="cursor-pointer">
                {L(`${u.projects.length} prosjekter`, `${u.projects.length} projects`)}
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
          <div className="text-text-tertiary">{L(`${u.jobs} jobber`, `${u.jobs} jobs`)}</div>
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
                    {L("Blokker …", "Block …")}
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    className={btn}
                    disabled={busy}
                    onClick={() => setAsk("delete")}
                  >
                    {L("Slett …", "Delete …")}
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
                  {L("Opphev blokkering", "Unblock")}
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
                  {L("Lås opp", "Unlock")}
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
                    ? L("Fjern som admin", "Remove as admin")
                    : L("Gjør til admin", "Make admin")}
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
                  ? L(
                      "Blokker: brukeren kan ikke logge inn. Er hen eier, låses prosjektene for alle til blokkeringen oppheves eller prosjektet får ny eier.",
                      "Block: the user cannot sign in. If they are an owner, the projects are locked for everyone until the block is lifted or the project gets a new owner.",
                    )
                  : L(
                      "Slett: kontoen låses i 30 dager og anonymiseres deretter. Prosjektene brukeren eier, låses til de får ny eier.",
                      "Delete: the account is locked for 30 days and then anonymised. The projects the user owns are locked until they get a new owner.",
                    )}
              </span>
              <input
                className="h-7 min-w-[220px] flex-1 rounded-sm border border-border-control bg-surface-3 px-2 text-xs text-text-primary"
                placeholder={L("Begrunnelse (valgfri)", "Reason (optional)")}
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
                  ? L("Blokker", "Block")
                  : L("Slett (30 dager)", "Delete (30 days)")}
              </Button>
              <Button size="sm" variant="ghost" className={btn} onClick={() => setAsk(null)}>
                {L("Avbryt", "Cancel")}
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
          ? L(
              `Eier: ${p.owners.map((o) => o.name || "–").join(", ")}`,
              `Owner: ${p.owners.map((o) => o.name || "–").join(", ")}`,
            )
          : ""}
      </span>
      <select
        className="ml-auto h-7 rounded-sm border border-border-control bg-surface-3 px-2 text-xs text-text-primary"
        value={owner}
        onChange={(e) => setOwner(e.target.value)}
        aria-label={L("Ny eier", "New owner")}
      >
        <option value="">{L("Velg ny eier …", "Choose new owner …")}</option>
        {users.map((u) => (
          <option key={u.id} value={u.id}>
            {u.displayName ? `${u.displayName} (${u.email})` : u.email}
          </option>
        ))}
      </select>
      <Button size="sm" disabled={!owner || busy} onClick={() => void go()}>
        {L("Gi ny eier", "Give new owner")}
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
          {L("Personvernerklæringen", "The privacy statement")}
        </h2>
        <span className="text-xs text-text-tertiary">
          {p ? L(`Versjon ${p.version}`, `Version ${p.version}`) : ""}
        </span>
        <Link
          to="/personvern"
          className="ml-auto text-xs text-accent-brand underline-offset-2 hover:underline"
        >
          {L("Se erklæringen", "View the statement")}
        </Link>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {field(
          "controllerName",
          L("Behandlingsansvarlig (navn)", "Controller (name)"),
          L("f.eks. Diagonalen AS", "e.g. Diagonalen AS"),
          200,
        )}
        {field("orgNumber", L("Organisasjonsnummer", "Organisation number"), "123 456 789", 40)}
        {field(
          "address",
          L("Adresse", "Address"),
          L("Gate, postnummer og sted", "Street, postcode and town"),
          400,
        )}
        {field(
          "contactEmail",
          L("Kontakt-e-post for personvern", "Contact email for privacy"),
          "personvern@…",
          200,
        )}
        {field(
          "storageRegion",
          L("Lagringssted (Lovable Cloud-region)", "Storage location (Lovable Cloud region)"),
          L("f.eks. EU (Europa)", "e.g. EU (Europe)"),
          200,
        )}
      </div>
      <label className="flex flex-col gap-1 text-xs text-text-secondary">
        {L(
          "Mer informasjon (valgfritt, vises nederst)",
          "More information (optional, shown at the end)",
        )}
        <textarea
          className="min-h-[70px] rounded-sm border border-border-control bg-surface-3 px-2 py-1.5 text-[13px] text-text-primary"
          value={cur["note"] ?? ""}
          maxLength={4000}
          onChange={(e) => set("note", e.target.value)}
        />
      </label>
      <div className="flex items-center gap-3">
        <Button size="sm" disabled={!f || busy} onClick={() => void save()}>
          {L("Lagre som ny versjon", "Save as new version")}
        </Button>
        <span className="text-[11px] text-text-tertiary">
          {L(
            "Alle brukerne blir bedt om å lese erklæringen på nytt ved neste innlogging.",
            "All users are asked to read the statement again at their next sign-in.",
          )}
        </span>
      </div>
    </section>
  );
}
