import { useQuery } from "@tanstack/react-query";
import { L, SPEECH_MODEL, SPEECH_LANGUAGE, type AssetVoice, type SpeechSettings, speechLanguageError, normalizeLanguageTag, languageLabel } from "@/core";
import { listVoices, listSpeechModels } from "@/adapters/ai/speech.functions";
import { Button } from "@/components/ui/button";
import { t } from "@/core/i18n/keyed";

export function VoiceControls({ projectId, value, onChange, disabled = false }: {
  projectId: string; value: AssetVoice | null; onChange: (voice: AssetVoice | null) => void; disabled?: boolean;
}) {
  const voices = useQuery({ queryKey: ["speech-voices", projectId], queryFn: () => listVoices({ data: { projectId } }), staleTime: 300_000 });
  const models = useQuery({ queryKey: ["speech-models", projectId], queryFn: () => listSpeechModels({ data: { projectId } }), staleTime: 300_000 });
  const vs = voices.data?.ok ? voices.data.voices ?? [] : [];
  const ms = models.data?.ok ? models.data.models ?? [] : [];
  const modelId = value?.modelId ?? SPEECH_MODEL;
  const language = normalizeLanguageTag(value?.language ?? SPEECH_LANGUAGE);
  const model = ms.find(m => m.modelId === modelId);
  const set = (patch: Partial<AssetVoice>) => { if (value) onChange({ ...value, ...patch }); };
  const settings = value?.settings ?? {};
  const setSetting = (key: string, v: number | boolean) => set({ settings: { ...settings, [key]: v } as SpeechSettings });
  const field = "h-8 min-w-0 rounded-sm border border-border-control bg-surface-3 px-2 text-xs text-text-primary";
  return <div data-testid="voice-controls" className="flex flex-col gap-3">
    {voices.isPending || models.isPending ? <p role="status" className="text-xs text-text-tertiary">{t("app-audio-voice-controls.voice-controls.p.13d60691bc9e")}</p> : null}
    {[voices.data, models.data].map((r, i) => r && !r.ok ? <p key={i} role="alert" className="text-xs text-status-danger">{r.message}</p> : null)}
    {voices.isError || models.isError ? <div role="alert"><p className="text-xs text-status-danger">{t("app-audio-voice-controls.voice-controls.p.4dc1c54fbe03")}</p><Button size="sm" variant="secondary" onClick={() => { void voices.refetch(); void models.refetch(); }}>{t("app-audio-voice-controls.voice-controls.button.0e0e9f446543")}</Button></div> : null}
    <label className="flex flex-col gap-1 text-xs text-text-secondary">{t("app-audio-voice-controls.voice-controls.label.099ed8c1ae71")}
      <select data-testid="voice-select" className={field} value={value?.voiceId ?? ""} disabled={disabled} onChange={e => {
        const v = vs.find(v => v.voiceId === e.target.value);
        onChange(v ? { ...value, provider: "elevenlabs", voiceId: v.voiceId, label: v.name, modelId, language } : null);
      }}><option value="">{t("app-audio-voice-controls.voice-controls.option.2606111dded4")}</option>
        {value && !vs.some(v => v.voiceId === value.voiceId) ? <option value={value.voiceId}>{value.label}</option> : null}
        {vs.map(v => <option key={v.voiceId} value={v.voiceId}>{v.name}</option>)}
      </select>
    </label>
    <Button data-testid="voice-refresh" size="sm" variant="ghost" disabled={disabled} onClick={() => { void voices.refetch(); void models.refetch(); }}>{t("app-audio-voice-controls.voice-controls.button.05bf467f3dbd")}</Button>
    {value ? <>
      <p className="text-xs text-text-tertiary">{t("app-audio-voice-controls.voice-controls.p.4af6ef8cbc52", { voiceId: String(value.voiceId) })}</p>
      <div className="grid grid-cols-2 gap-3">
        <label className="flex min-w-0 flex-col gap-1 text-xs text-text-secondary">{t("app-audio-voice-controls.voice-controls.label.5872b6457506")}<select data-testid="voice-model" className={field} value={modelId} disabled={disabled} onChange={e => set({ modelId: e.target.value })}>
          {!ms.some(m => m.modelId === modelId) ? <option value={modelId}>{modelId}</option> : null}
          {ms.map(m => <option key={m.modelId} value={m.modelId}>{m.name}</option>)}
        </select></label>
        <label className="flex min-w-0 flex-col gap-1 text-xs text-text-secondary">{t("app-audio-voice-controls.voice-controls.label.bb142efbabb7")}<select data-testid="voice-language" className={field} value={language} disabled={disabled} onChange={e => set({ language: e.target.value })}>
          {!model?.languages.some(l => normalizeLanguageTag(l.code) === normalizeLanguageTag(language)) ? <option value={normalizeLanguageTag(language)}>{languageLabel(language)}</option> : null}
          {model?.languages.map(l => <option key={l.code} value={normalizeLanguageTag(l.code)}>{languageLabel(l.code)}</option>)}
        </select></label>
      </div>
      {model && speechLanguageError(model, language) ? <p role="alert" className="text-xs text-status-danger">{speechLanguageError(model, language)}</p> : null}
      <p className="text-xs text-text-tertiary">{t("app-audio-voice-controls.voice-controls.p.2faae78abc72")}</p>
      <div className="grid grid-cols-2 gap-3">
        {([ ["stability", t("app-audio-voice-controls.voice-controls.stability-l-stabilitet-stability-0-1-0-5-similarity-boost-l-stemmelikhet-similarity-0-1-0-75-style-l-stil-style-0-1-0-speed-l-talehastighet-speech-speed-0-7-1-2-1-as-const-map.9c5f2c7de5f2"), 0, 1, 0.5], ["similarity_boost", t("app-audio-voice-controls.voice-controls.stability-l-stabilitet-stability-0-1-0-5-similarity-boost-l-stemmelikhet-similarity-0-1-0-75-style-l-stil-style-0-1-0-speed-l-talehastighet-speech-speed-0-7-1-2-1-as-const-map.0505f5b9b565"), 0, 1, 0.75], ["style", t("app-audio-voice-controls.voice-controls.stability-l-stabilitet-stability-0-1-0-5-similarity-boost-l-stemmelikhet-similarity-0-1-0-75-style-l-stil-style-0-1-0-speed-l-talehastighet-speech-speed-0-7-1-2-1-as-const-map.d44f7c9074b2"), 0, 1, 0], ["speed", t("app-audio-voice-controls.voice-controls.stability-l-stabilitet-stability-0-1-0-5-similarity-boost-l-stemmelikhet-similarity-0-1-0-75-style-l-stil-style-0-1-0-speed-l-talehastighet-speech-speed-0-7-1-2-1-as-const-map.8e0116ac6f7a"), 0.7, 1.2, 1] ] as const).map(([key, label, min, max, fallback]) => <label key={key} className="flex flex-col gap-1 text-xs text-text-secondary">{label}<input data-testid={`voice-${key}`} type="range" min={min} max={max} step={0.05} disabled={disabled} value={typeof settings[key] === "number" ? settings[key] : fallback} onChange={e => setSetting(key, Number(e.target.value))} /></label>)}
        <label className="col-span-2 flex items-center gap-2 text-xs text-text-secondary"><input type="checkbox" checked={settings["use_speaker_boost"] === true} disabled={disabled} onChange={e => setSetting("use_speaker_boost", e.target.checked)} />{t("app-audio-voice-controls.voice-controls.label.c0d86a56fb09")}</label>
      </div>
    </> : null}
  </div>;
}