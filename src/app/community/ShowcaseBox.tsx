/**
 * B-116: boksen på prosjektlisten for innloggede (bak bryteren community.public): del én ting fra et
 * eget prosjekt, med forhåndsvisning som er nøyaktig lik karusellkortet før noe publiseres.
 * Profilredigeringen (handle, bio, avatar, offentlig profil) ligger bak community.profiles.
 */
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Share2 } from "lucide-react";
import { useFeature } from "./use-feature";
import { ShowcaseCard } from "./ShowcaseCard";
import {
  listAssetCandidates,
  listSceneCandidates,
  listDialogueCandidates,
  saveMyPublicProfile,
  uploadAvatar,
  type ShowcaseCandidate,
} from "@/adapters/browser/showcase";
import { useServerFn } from "@tanstack/react-start";
import { createShowcaseItem, getMyShowcaseProfile, prepareAvatarUpload } from "@/adapters/community/showcase.functions";
import { createSignedUrls, ASSET_BUCKET } from "@/adapters/browser/storage-files";
import {
  SHOWCASE_KINDS,
  showcaseDefaultExpires,
  showcaseDraftError,
  type ShowcaseKind,
} from "@/core/community";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { t } from "@/core/i18n/keyed";

const kindLabel = (kind: ShowcaseKind): string => ({
  character: t("b116.kind.character"),
  asset: t("b116.kind.asset"),
  scene: t("b116.kind.scene"),
  script: t("b116.kind.script"),
  audio: t("b116.kind.audio"),
})[kind];

const EXPIRES_CHOICES = [7, 14, 30, 90] as const;
const expiresLabel = (days: number): string => ({
  7: t("b116.expires.7"),
  14: t("b116.expires.14"),
  30: t("b116.expires.30"),
  90: t("b116.expires.90"),
} as Record<number, string>)[days] ?? "";

export interface ShowcaseProject {
  readonly id: string;
  readonly name: string;
  readonly role: string;
}

export function ShowcaseBox({ projects }: { projects: readonly ShowcaseProject[] }) {
  const enabled = useFeature("community.public");
  const profiles = useFeature("community.profiles");
  const [createOpen, setCreateOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  if (!enabled) return null;
  const editable = projects.filter((p) => p.role === "owner" || p.role === "editor");
  return (
    <section data-testid="showcase-box" className="mb-6 flex flex-col gap-2 rounded-md border border-border bg-surface-1 p-4">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-text-primary">
        <Share2 className="size-4 text-accent-brand" aria-hidden />
        {t("b116.box.title")}
      </h2>
      <p className="text-xs text-text-secondary">{t("b116.box.hint")}</p>
      <div className="mt-1 flex flex-wrap gap-2">
        <Button size="sm" data-testid="showcase-share-open" disabled={!editable.length} onClick={() => setCreateOpen(true)}>
          {t("b116.box.share")}
        </Button>
        <Button size="sm" variant="secondary" asChild>
          <Link to="/delinger" data-testid="showcase-mine-link">{t("b116.box.mine")}</Link>
        </Button>
        {profiles ? (
          <Button size="sm" variant="ghost" data-testid="showcase-profile-open" onClick={() => setProfileOpen(true)}>
            {t("b116.box.profile")}
          </Button>
        ) : null}
      </div>
      <CreateDialog projects={editable} open={createOpen} onOpenChange={setCreateOpen} />
      {profiles ? <ProfileDialog open={profileOpen} onOpenChange={setProfileOpen} /> : null}
    </section>
  );
}

function CreateDialog({ projects, open, onOpenChange }: { projects: readonly ShowcaseProject[]; open: boolean; onOpenChange: (o: boolean) => void }) {
  const qc = useQueryClient();
  const [projectId, setProjectId] = useState("");
  const [kind, setKind] = useState<ShowcaseKind>("character");
  const [candidate, setCandidate] = useState<ShowcaseCandidate | null>(null);
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [lineIds, setLineIds] = useState<string[]>([]);
  const createItem = useServerFn(createShowcaseItem);
  const dialogue = useQuery({ queryKey: ["showcase-dialogue", projectId], enabled: open && !!projectId && kind === "script", queryFn: () => listDialogueCandidates(projectId) });
  const excerpt = lineIds.map(id => dialogue.data?.find(line => line.id === id)?.text ?? "").join("\n\n");
  const [days, setDays] = useState<number>(7);
  const [preview, setPreview] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  const candidates = useQuery({
    queryKey: ["showcase-candidates", projectId, kind],
    enabled: open && !!projectId && kind !== "script",
    queryFn: async (): Promise<readonly ShowcaseCandidate[]> => {
      if (kind === "scene") return listSceneCandidates(projectId);
      const { images, audio } = await listAssetCandidates(projectId);
      return kind === "audio" ? audio : images;
    },
  });

  useEffect(() => {
    if (open) {
      setProjectId(projects[0]?.id ?? "");
      setKind("character"); setCandidate(null); setTitle(""); setText(""); setLineIds([]);
      setDays(7); setPreview(false); setNotice(null); setFailed(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const expiresAt = useMemo(() => new Date(Date.now() + days * 86_400_000).toISOString(), [days]);
  const draft = { kind, title, text, lineIds, hasMedia: candidate !== null, expiresAt };
  const error = showcaseDraftError(draft, Date.now());

  async function openPreview() {
    setFailed(false);
    let url: string | null = null;
    if (candidate) {
      try {
        const signed = await createSignedUrls(ASSET_BUCKET, [candidate.sourceKey], 600);
        url = signed[0]?.signedUrl ?? null;
      } catch { url = null; }
    }
    setPreviewUrl(url);
    setPreview(true);
  }

  async function submit() {
    setBusy(true);
    setFailed(false);
    try {
      const res = await createItem({
        data: {
          projectId, kind, title: title.trim(), text, lineIds,
          hasMedia: candidate !== null, expiresAt,
          sourceId: candidate?.id ?? null,
        },
      });
      setNotice(res.status === "live" ? t("b116.create.liveNotice") : t("b116.create.pendingNotice"));
      await qc.invalidateQueries({ queryKey: ["showcase-mine"] });
      await qc.invalidateQueries({ queryKey: ["showcase-feed"] });
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  const list = candidates.data ?? [];
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent uiId="V-058" className="max-w-[520px]" data-testid="showcase-create">
        <DialogHeader>
          <DialogTitle>{preview ? t("b116.create.preview") : t("b116.create.title")}</DialogTitle>
        </DialogHeader>
        {notice ? (
          <div className="flex flex-col gap-3">
            <p role="status" className="text-xs text-status-success">{notice}</p>
            <Button size="sm" variant="secondary" onClick={() => onOpenChange(false)}>{t("b116.close")}</Button>
          </div>
        ) : preview ? (
          <div className="flex flex-col gap-3">
            <p className="text-xs text-text-secondary">{t("b116.create.previewHint")}</p>
            {kind === "script" ? (
              <p role="alert" data-testid="showcase-script-warning" className="rounded-sm border border-status-discrepancy/50 bg-surface-2 px-3 py-2 text-xs text-text-primary">
                {t("b116.create.excerptWarning")}
              </p>
            ) : null}
            <ShowcaseCard testId="showcase-preview-card"
              item={{ kind, title: title.trim(), text, excerpt: excerpt.trim(), url: previewUrl, mime: candidate?.mime ?? null, authorName: "" }} />
            <div className="flex justify-end gap-2">
              <Button size="sm" variant="ghost" onClick={() => setPreview(false)}>{t("b116.create.back")}</Button>
              <Button size="sm" data-testid="showcase-submit" disabled={busy} onClick={() => void submit()}>{t("b116.create.submit")}</Button>
            </div>
            {failed ? <p role="alert" className="text-xs text-status-danger">{t("b116.create.failed")}</p> : null}
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="showcase-project" className="text-xs text-text-secondary">{t("b116.create.project")}</Label>
              <select id="showcase-project" data-testid="showcase-project" value={projectId}
                onChange={(e) => { setProjectId(e.target.value); setCandidate(null); setLineIds([]); }}
                className="h-8 rounded-sm border border-border-control bg-surface-3 px-2 text-xs text-text-primary">
                {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <span className="text-xs text-text-secondary">{t("b116.create.kind")}</span>
              <div role="radiogroup" aria-label={t("b116.create.kind")} className="flex flex-wrap gap-1">
                {SHOWCASE_KINDS.map((k) => (
                  <button key={k} type="button" role="radio" aria-checked={kind === k} data-testid={`showcase-kind-${k}`}
                    onClick={() => { setKind(k); setCandidate(null); setLineIds([]); }}
                    className={"rounded-sm border px-2.5 py-1 text-xs " + (kind === k ? "border-accent-brand bg-accent-selection text-text-primary" : "border-border-control text-text-secondary hover:bg-surface-2")}>
                    {kindLabel(k)}
                  </button>
                ))}
              </div>
            </div>
            {kind === "script" ? (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="showcase-excerpt" className="text-xs text-text-secondary">{t("b116.create.excerptLabel")}</Label>
                <div id="showcase-excerpt" data-testid="showcase-excerpt" className="flex max-h-48 flex-col gap-2 overflow-y-auto">
                  {(dialogue.data ?? []).map(line => (
                    <label key={line.id} className="flex items-start gap-2 text-xs text-text-primary">
                      <input type="checkbox" data-testid={`showcase-line-${line.id}`} checked={lineIds.includes(line.id)}
                        disabled={!lineIds.includes(line.id) && lineIds.length >= 12}
                        onChange={e => setLineIds(ids => e.target.checked ? [...ids, line.id] : ids.filter(id => id !== line.id))} />
                      <span>{line.text}</span>
                    </label>
                  ))}
                </div>
                <p className="text-[11px] text-status-discrepancy">{t("b116.create.excerptWarning")}</p>
              </div>
            ) : (
              <div className="flex flex-col gap-1.5">
                <span className="text-xs text-text-secondary">{kindLabel(kind)}</span>
                {candidates.isLoading ? (
                  <p className="text-[11px] text-text-tertiary">{t("b116.loading")}</p>
                ) : list.length === 0 ? (
                  <p className="text-[11px] text-text-tertiary" data-testid="showcase-candidates-empty">{t("b116.create.empty")}</p>
                ) : (
                  <ul className="flex max-h-40 flex-col gap-1 overflow-y-auto" data-testid="showcase-candidates">
                    {list.map((c) => (
                      <li key={c.id}>
                        <button type="button" role="radio" aria-checked={candidate?.id === c.id} data-testid={`showcase-candidate-${c.id}`}
                          onClick={() => setCandidate(c)}
                          className={"w-full truncate rounded-sm border px-2 py-1 text-left text-xs " + (candidate?.id === c.id ? "border-accent-brand bg-accent-selection text-text-primary" : "border-border-control text-text-secondary hover:bg-surface-2")}>
                          {c.name}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="showcase-title" className="text-xs text-text-secondary">{t("b116.create.titleLabel")}</Label>
              <Input id="showcase-title" data-testid="showcase-title" maxLength={200} value={title}
                onChange={(e) => setTitle(e.target.value)} className="h-8 bg-surface-3 text-xs" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="showcase-text" className="text-xs text-text-secondary">{t("b116.create.textLabel")}</Label>
              <textarea id="showcase-text" data-testid="showcase-text" rows={3} maxLength={280} value={text}
                onChange={(e) => setText(e.target.value)}
                className="rounded-sm border border-border-control bg-surface-3 px-2 py-1 text-xs text-text-primary" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="showcase-expires" className="text-xs text-text-secondary">{t("b116.create.expires")}</Label>
              <select id="showcase-expires" data-testid="showcase-expires" value={days} onChange={(e) => setDays(Number(e.target.value))}
                className="h-8 rounded-sm border border-border-control bg-surface-3 px-2 text-xs text-text-primary">
                {EXPIRES_CHOICES.map((d) => <option key={d} value={d}>{expiresLabel(d)}</option>)}
              </select>
            </div>
            <div className="flex justify-end gap-2">
              <Button size="sm" variant="ghost" onClick={() => onOpenChange(false)}>{t("b116.cancel")}</Button>
              <Button size="sm" data-testid="showcase-preview" disabled={error !== null} onClick={() => void openPreview()}>
                {t("b116.create.preview")}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function ProfileDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const q = useQuery({ queryKey: ["showcase-my-profile"], enabled: open, queryFn: () => getMyShowcaseProfile({}) });
  const [handle, setHandle] = useState("");
  const [bio, setBio] = useState("");
  const [isPublic, setIsPublic] = useState(false);
  const [avatarKey, setAvatarKey] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!q.data) return;
    setHandle(q.data.handle ?? "");
    setBio(q.data.bio);
    setIsPublic(q.data.isPublic);
    setAvatarUrl(q.data.avatarUrl);
  }, [q.data]);

  async function chooseAvatar(file: File | undefined) {
    if (!file) return;
    const ext = (file.name.includes(".") ? file.name.split(".").pop() : "png") ?? "png";
    setBusy(true);
    setFailed(false);
    try {
      const up = await prepareAvatarUpload({ data: { ext } });
      const err = await uploadAvatar(up.path, up.token, file);
      if (err) setFailed(true);
      else { setAvatarKey(up.path); setAvatarUrl(URL.createObjectURL(file)); }
    } catch { setFailed(true); }
    setBusy(false);
  }

  async function save() {
    setBusy(true);
    setFailed(false);
    const err = await saveMyPublicProfile({ handle: handle.trim() || null, bio, avatarKey, isPublic });
    setBusy(false);
    if (err) setFailed(true);
    else { setNotice(t("b116.profile.saved")); void q.refetch(); }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent uiId="V-057" className="max-w-[440px]" data-testid="showcase-profile">
        <DialogHeader>
          <DialogTitle>{t("b116.profile.title")}</DialogTitle>
        </DialogHeader>
        {!q.data ? (
          <p className="text-xs text-text-tertiary">{t("b116.loading")}</p>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-3">
              <span className="flex size-12 items-center justify-center overflow-hidden rounded-full border border-border bg-surface-2">
                {avatarUrl ? <img src={avatarUrl} alt={t("b116.profile.avatar")} className="size-full object-cover" /> : null}
              </span>
              <label className="text-xs text-accent-brand hover:underline">
                {t("b116.profile.avatarChoose")}
                <input type="file" accept="image/*" className="sr-only" data-testid="showcase-avatar-input" disabled={busy}
                  onChange={(e) => void chooseAvatar(e.target.files?.[0])} />
              </label>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="showcase-handle" className="text-xs text-text-secondary">{t("b116.profile.handle")}</Label>
              <Input id="showcase-handle" data-testid="showcase-handle" maxLength={30} value={handle}
                onChange={(e) => setHandle(e.target.value)} className="h-8 bg-surface-3 text-xs" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="showcase-bio" className="text-xs text-text-secondary">{t("b116.profile.bio")}</Label>
              <textarea id="showcase-bio" data-testid="showcase-bio" rows={3} maxLength={1000} value={bio}
                onChange={(e) => setBio(e.target.value)}
                className="rounded-sm border border-border-control bg-surface-3 px-2 py-1 text-xs text-text-primary" />
            </div>
            <label className="flex items-center gap-2 text-xs text-text-secondary">
              <input type="checkbox" data-testid="showcase-is-public" checked={isPublic} onChange={(e) => setIsPublic(e.target.checked)}
                className="size-3.5 accent-[var(--accent-brand)]" />
              {t("b116.profile.public")}
            </label>
            {notice ? <p role="status" className="text-xs text-status-success">{notice}</p> : null}
            {failed ? <p role="alert" className="text-xs text-status-danger">{t("b116.create.failed")}</p> : null}
            <div className="flex justify-end gap-2">
              <Button size="sm" variant="ghost" onClick={() => onOpenChange(false)}>{t("b116.cancel")}</Button>
              <Button size="sm" data-testid="showcase-profile-save" disabled={busy} onClick={() => void save()}>{t("b116.profile.save")}</Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
