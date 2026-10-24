# ID-merker i vinduene

Generert fra `src/app/ui-ids.ts` med `node scripts/ui-ids/ui-ids.mjs`. Ikke rediger for hånd.
Merket nederst i hvert vindu viser «V-nnn · commit». Slå opp nummeret her.

| ID | Type | Fil | Komponent | Beskrivelse | Status |
|---|---|---|---|---|---|
| V-001 | side | `src/routes/admin.tsx` | AdminRoute | Side «Administrasjon – Pen to Glass» (/admin) | aktiv |
| V-002 | side | `src/routes/delinger.tsx` | DelingerRoute | Side «Mine delinger – From Pen to Glass» (/delinger) | aktiv |
| V-003 | side | `src/routes/gruppe.$workspaceId.tsx` | WorkspaceRoute | Side «Arbeidsgruppe – Pen to Glass» (/gruppe/$workspaceId) | aktiv |
| V-004 | side | `src/routes/index.tsx` | Index | Side «From Pen to Glass – Prosjekter» (/) | aktiv |
| V-005 | side | `src/routes/invitasjon.tsx` | AcceptInvitation | Side «Invitasjon – Pen to Glass» (/invitasjon) | aktiv |
| V-006 | side | `src/routes/k.$code.tsx` | CopyRoute | Side «Utskrevet figur – Pen to Glass» (/k/$code) | aktiv |
| V-007 | side | `src/routes/konto.tsx` | AccountRoute | Side «Min konto – Pen to Glass» (/konto) | aktiv |
| V-008 | side | `src/routes/m.$token.tsx` | MobileRoute | Side «Last opp – Pen to Glass» (/m/$token) | aktiv |
| V-009 | side | `src/routes/manusutforsker.$projectId.tsx` | ExplorerRoute | Side «Manusutforskeren – Pen to Glass» (/manusutforsker/$projectId) | aktiv |
| V-010 | side | `src/routes/personvern.tsx` | PrivacyPage | Side «Personvern – Pen to Glass» (/personvern) | aktiv |
| V-011 | side | `src/routes/prosjekt.$projectId.bibliotek.tsx` | LibraryRoute | Side «Ressursbibliotek – Pen to Glass» (/prosjekt/$projectId/bibliotek) | aktiv |
| V-012 | side | `src/routes/prosjekt.$projectId.index.tsx` | OverviewRoute | Side «Prosjektoversikt – Pen to Glass» (/prosjekt/$projectId/) | aktiv |
| V-013 | side | `src/routes/prosjekt.$projectId.manus.tsx` | ScriptRoute | Side «Manus – Pen to Glass» (/prosjekt/$projectId/manus) | aktiv |
| V-014 | side | `src/routes/prosjekt.$projectId.montering.tsx` | AssemblyRoute | Side «Montering – Pen to Glass» (/prosjekt/$projectId/montering) | aktiv |
| V-015 | side | `src/routes/prosjekt.$projectId.rigg.tsx` | RigRoute | Side «Rigg – Pen to Glass» (/prosjekt/$projectId/rigg) | aktiv |
| V-016 | side | `src/routes/prosjekt.$projectId.scene.tsx` | SceneEditorRoute | Side «Sceneeditor – Pen to Glass» (/prosjekt/$projectId/scene) | aktiv |
| V-017 | side | `src/routes/prosjekt.$projectId.storylab.tsx` | StoryLabRoute | Side /prosjekt/$projectId/storylab | aktiv |
| V-018 | side | `src/routes/prosjekt.$projectId.tsx` | ProjectLayout | Side «Prosjekt – Pen to Glass» (/prosjekt/$projectId) | aktiv |
| V-019 | side | `src/routes/prosjekt.$projectId.utgivelse.tsx` | ReleaseRoute | Side «Utgivelse – Pen to Glass» (/prosjekt/$projectId/utgivelse) | aktiv |
| V-020 | side | `src/routes/ptg.i.tsx` | PtgImportRoute | Side «Importer film fra After Effects – From Pen to Glass» (/ptg/i) | aktiv |
| V-021 | side | `src/routes/se.$token.tsx` | FilmRoute | Side «Film – Pen to Glass» (/se/$token) | aktiv |
| V-022 | side | `src/routes/tilbakestill-passord.tsx` | ResetPasswordPage | Side «Tilbakestill passord \| Pen to Glass» (/tilbakestill-passord) | aktiv |
| V-023 | popup | `src/app/account/CityPicker.tsx` | CityPicker | Popup «Søk etter by» i CityPicker | aktiv |
| V-024 | popup | `src/app/account/CountryPicker.tsx` | CountryPicker | Popup «Søk etter land» i CountryPicker | aktiv |
| V-025 | dialog | `src/app/account/use-account.tsx` | CountryGate | Dialog «Hvilket land er du i?» i CountryGate | aktiv |
| V-026 | dialog | `src/app/account/use-account.tsx` | AccountWatcher | Dialog «Les personvernerklæringen» i AccountWatcher | aktiv |
| V-027 | bekreftelse | `src/app/admin/RegistrationAdmin.tsx` | RegistrationAdmin | Bekreftelsesdialog «Åpne for nye registreringer?» i RegistrationAdmin | aktiv |
| V-028 | dialog | `src/app/ai/AiPanel.tsx` | RetryDialog | Dialog i RetryDialog | aktiv |
| V-029 | bekreftelse | `src/app/ai/AiSourceCleanup.tsx` | AiSourceCleanup | Bekreftelsesdialog «Slett gamle videokilder?» i AiSourceCleanup | aktiv |
| V-030 | popup | `src/app/ai/GenerationStatus.tsx` | GenerationStatus | Popup «AI-genereringer» i GenerationStatus | aktiv |
| V-031 | bekreftelse | `src/app/ai/OrphanCleanup.tsx` | OrphanCleanup | Bekreftelsesdialog «Slette ubrukte AI-filer?» i OrphanCleanup | aktiv |
| V-032 | dialog | `src/app/ai/ProvidersDialog.tsx` | ProvidersDialog | Dialog «AI-leverandører» i ProvidersDialog | aktiv |
| V-033 | dialog | `src/app/assembly/AddAudioDialog.tsx` | AddAudioDialog | Dialog «Legg til lyd» i AddAudioDialog | aktiv |
| V-034 | dialog | `src/app/assembly/AiDialogueDialog.tsx` | AiDialogueDialog | Dialog i AiDialogueDialog | aktiv |
| V-035 | dialog | `src/app/assembly/AlphaExportDialog.tsx` | AlphaExportDialog | Dialog «Eksporter lag med gjennomsiktighet» i AlphaExportDialog | aktiv |
| V-036 | popup | `src/app/assembly/AssemblyToolbarMenus.tsx` | AssemblyViewMenu | Popup «Svart-hvitt» i AssemblyViewMenu | aktiv |
| V-037 | dialog | `src/app/assembly/AssemblyWorkspace.tsx` | Assembly | Dialog i Assembly | aktiv |
| V-038 | dialog | `src/app/assembly/BatchVideoDialog.tsx` | BatchVideoDialog | Dialog i BatchVideoDialog | aktiv |
| V-039 | dialog | `src/app/assembly/CompareTakesDialog.tsx` | CompareAiTakesDialog | Dialog i CompareAiTakesDialog | aktiv |
| V-040 | dialog | `src/app/assembly/CompareVersionsDialog.tsx` | CompareVersionsDialog | Dialog «Sammenlign versjoner – {title}» i CompareVersionsDialog | aktiv |
| V-041 | dialog | `src/app/assembly/DragonframeImportDialog.tsx` | DragonframeImportDialog | Dialog «Importer fra Dragonframe» i DragonframeImportDialog | aktiv |
| V-042 | dialog | `src/app/assembly/ExportAnimaticDialog.tsx` | ExportAnimaticDialog | Dialog «Eksporter animatic» i ExportAnimaticDialog | aktiv |
| V-043 | panel | `src/app/assembly/ExportQueueStatus.tsx` | ExportQueueStatus | Flytende panel «Eksportkø» i ExportQueueStatus | aktiv |
| V-044 | dialog | `src/app/assembly/GenerateSceneDialog.tsx` | GenerateSceneDialog | Dialog i GenerateSceneDialog | aktiv |
| V-045 | dialog | `src/app/assembly/LanguageVersionDialog.tsx` | LanguageVersionDialog | Dialog «Språkversjon» i LanguageVersionDialog | aktiv |
| V-046 | dialog | `src/app/assembly/LongFilmImportDialog.tsx` | LongFilmImportDialog | Dialog i LongFilmImportDialog | aktiv |
| V-047 | dialog | `src/app/assembly/StillPickerDialog.tsx` | StillPickerDialog | Dialog «Stillbilde i scenen» i StillPickerDialog | aktiv |
| V-048 | dialog | `src/app/assembly/SubtitleDialog.tsx` | SubtitleDialog | Dialog «Undertekster» i SubtitleDialog | aktiv |
| V-049 | bekreftelse | `src/app/asset-studio/AssetStudio.tsx` | AssetStudio | Bekreftelsesdialog i AssetStudio | aktiv |
| V-050 | bekreftelse | `src/app/asset-studio/AssetStudio.tsx` | AssetStudio | Bekreftelsesdialog i AssetStudio | aktiv |
| V-051 | panel | `src/app/asset-studio/AssetStudio.tsx` | AssetStudio | Flytende panel i AssetStudio | aktiv |
| V-052 | panel | `src/app/asset-studio/AssetStudio.tsx` | AssetStudio | Flytende panel i AssetStudio | aktiv |
| V-053 | dialog | `src/app/audio/AudioClipEditor.tsx` | AudioClipEditor | Dialog i AudioClipEditor | aktiv |
| V-054 | dialog | `src/app/audio/AudioTakesDialog.tsx` | AudioTakesDialog | Dialog i AudioTakesDialog | aktiv |
| V-055 | dialog | `src/app/community/MyShowcasePage.tsx` | EditDialog | Dialog «Endre» i EditDialog | aktiv |
| V-056 | dialog | `src/app/community/MyShowcasePage.tsx` | MyShowcasePage | Dialog «Trekk tilbake» i MyShowcasePage | aktiv |
| V-057 | dialog | `src/app/community/ShowcaseBox.tsx` | ProfileDialog | Dialog «Profilen din» i ProfileDialog | aktiv |
| V-058 | dialog | `src/app/community/ShowcaseBox.tsx` | CreateDialog | Dialog «Forhåndsvisning» i CreateDialog | aktiv |
| V-059 | popup | `src/app/dialogue/DriftBadge.tsx` | Icon | Popup «Lyden: manusrevisjon {audioRevision} · manuset nå: revisjon {currentRe» i Icon | aktiv |
| V-060 | popup | `src/app/dialogue/NoteFlagControl.tsx` | NoteFlagControl | Popup «Huskelapper» i NoteFlagControl | aktiv |
| V-061 | dialog | `src/app/fonts/AddFontDialog.tsx` | AddFontDialog | Dialog «Legg til font» i AddFontDialog | aktiv |
| V-062 | dialog | `src/app/global/GlobalLibraryDialog.tsx` | GlobalLibraryDialog | Dialog «Globalt bibliotek» i GlobalLibraryDialog | aktiv |
| V-063 | dialog | `src/app/library/ApproveImpactDialog.tsx` | ApproveImpactDialog | Dialog «Godkjenn» i ApproveImpactDialog | aktiv |
| V-064 | dialog | `src/app/library/AssetWorklistDialog.tsx` | AssetWorklistDialog | Dialog «Arbeidsliste – oppdaterte ressurser» i AssetWorklistDialog | aktiv |
| V-065 | dialog | `src/app/library/AssetZip.tsx` | AssetZipDialog | Dialog i AssetZipDialog | aktiv |
| V-066 | dialog | `src/app/library/CutoutDialog.tsx` | CutoutDialog | Dialog i CutoutDialog | aktiv |
| V-067 | dialog | `src/app/library/DialogueBatchPanel.tsx` | DialogueBatchPanel | Dialog «Generer røde replikker · {name}» i DialogueBatchPanel | aktiv |
| V-068 | dialog | `src/app/library/ImageCompareDialog.tsx` | ImageCompareDialog | Dialog «Sammenlign» i ImageCompareDialog | aktiv |
| V-069 | dialog | `src/app/library/ImageLightbox.tsx` | ImageLightbox | Dialog i ImageLightbox | aktiv |
| V-070 | panel | `src/app/library/ImageViewer.tsx` | ImageViewer | Flytende panel «Bildet kunne ikke hentes ({status})» i ImageViewer | aktiv |
| V-071 | dialog | `src/app/library/ReuploadDialog.tsx` | ReuploadDialog | Dialog «Bildet finnes i prosjektet» i ReuploadDialog | aktiv |
| V-072 | dialog | `src/app/library/SuggestionsDialog.tsx` | SuggestionsDialog | Dialog «Forslag fra manuset» i SuggestionsDialog | aktiv |
| V-073 | dialog | `src/app/library/TrashDialog.tsx` | TrashDialog | Dialog «Slettede objekter» i TrashDialog | aktiv |
| V-074 | dialog | `src/app/mobile/MobileImportDialog.tsx` | MobileImportDialog | Dialog i MobileImportDialog | aktiv |
| V-075 | dialog | `src/app/projects/BackupDialogs.tsx` | RestoreBackupDialog | Dialog «Gjenopprett fra sikkerhetskopi» i RestoreBackupDialog | aktiv |
| V-076 | dialog | `src/app/projects/BackupDialogs.tsx` | BackupDialog | Dialog «Sikkerhetskopi av «» i BackupDialog | aktiv |
| V-077 | dialog | `src/app/projects/ProductionDialog.tsx` | ProductionDialog | Dialog «Legg til scener i «{name}»» i ProductionDialog | aktiv |
| V-078 | dialog | `src/app/projects/ProjectDangerDialogs.tsx` | PurgeAssetsDialog | Dialog «Slett ressursene fra «{name}»» i PurgeAssetsDialog | aktiv |
| V-079 | dialog | `src/app/projects/ProjectDangerDialogs.tsx` | LeaveProjectDialog | Dialog «Forlat «{name}»» i LeaveProjectDialog | aktiv |
| V-080 | dialog | `src/app/projects/ProjectDangerDialogs.tsx` | DeleteProjectDialog | Dialog «Slett prosjektet «{name}»» i DeleteProjectDialog | aktiv |
| V-081 | dialog | `src/app/projects/PromotionDialog.tsx` | PromotionDialog | Dialog «Tilbakefør fra «{name}» til hovedfilmen» i PromotionDialog | aktiv |
| V-082 | panel | `src/app/projects/QualityProfilesSection.tsx` | ProfileDialog | Flytende panel «Endre kvalitetsprofil» i ProfileDialog | aktiv |
| V-083 | dialog | `src/app/projects/StyleGuideSection.tsx` | StyleGuideDialog | Dialog i StyleGuideDialog | aktiv |
| V-084 | dialog | `src/app/release/PosterDialogs.tsx` | ExportPosterDialog | Dialog «Eksporter «{name}»» i ExportPosterDialog | aktiv |
| V-085 | dialog | `src/app/release/PosterDialogs.tsx` | NewPosterDialog | Dialog «Ny plakat» i NewPosterDialog | aktiv |
| V-086 | dialog | `src/app/release/RelationsDialog.tsx` | RelationsDialog | Dialog «Relasjoner» i RelationsDialog | aktiv |
| V-087 | dialog | `src/app/rig/InspectionWindow.tsx` | InspectionWindow | Dialog i InspectionWindow | aktiv |
| V-088 | dialog | `src/app/scene-editor/AddElementDialog.tsx` | AddElementDialog | Dialog i AddElementDialog | aktiv |
| V-089 | dialog | `src/app/scene-editor/AddLayerDialog.tsx` | AddLayerDialog | Dialog «Legg til lag» i AddLayerDialog | aktiv |
| V-090 | dialog | `src/app/scene-editor/CarryOverDialog.tsx` | CarryOverDialog | Dialog «Laget kopieres med samme ressurs, variant, skala og rotasjon. Bevegels» i CarryOverDialog | aktiv |
| V-091 | dialog | `src/app/scene-editor/LayerImageDialog.tsx` | LayerImageDialog | Dialog i LayerImageDialog | aktiv |
| V-092 | dialog | `src/app/scene-editor/LayerSwaps.tsx` | SwapPicker | Dialog «Bildeskifte i «{name}»» i SwapPicker | aktiv |
| V-093 | panel | `src/app/scene-editor/PreviewWindow.tsx` | PreviewWindow | Flytende panel i PreviewWindow | aktiv |
| V-094 | dialog | `src/app/scene-editor/RecordAudioDialog.tsx` | RecordAudioDialog | Dialog i RecordAudioDialog | aktiv |
| V-095 | dialog | `src/app/scene-editor/RetimeDialog.tsx` | RetimeDialog | Dialog i RetimeDialog | aktiv |
| V-096 | dialog | `src/app/scene-editor/SceneEditorWorkspace.tsx` | Editor | Dialog i Editor | aktiv |
| V-097 | popup | `src/app/scene-editor/SceneEditorWorkspace.tsx` | Editor | Popup i Editor | aktiv |
| V-098 | popup | `src/app/scene-editor/SceneMarkControls.tsx` | SceneMarkControls | Popup «Velg scenefarge» i SceneMarkControls | aktiv |
| V-099 | popup | `src/app/scene-editor/SceneMarkControls.tsx` | SceneMarkControls | Popup «Velg scenestatus» i SceneMarkControls | aktiv |
| V-100 | popup | `src/app/scene-editor/ScenePicker.tsx` | ScenePicker | Popup «Søk på nummer, sted eller tid …» i ScenePicker | aktiv |
| V-101 | dialog | `src/app/scene-editor/SceneScriptDialog.tsx` | SceneScriptDialog | Dialog i SceneScriptDialog | aktiv |
| V-102 | dialog | `src/app/scene-editor/SceneToVideoDialog.tsx` | SceneToVideoDialog | Dialog i SceneToVideoDialog | aktiv |
| V-103 | dialog | `src/app/scene-editor/TextInspector.tsx` | SaveTemplateDialog | Dialog «Lagre som mal» i SaveTemplateDialog | aktiv |
| V-104 | popup | `src/app/scene-editor/animation/BlinkPanel.tsx` | BlinkPanel | Popup «Blinking og øyne» i BlinkPanel | aktiv |
| V-105 | dialog | `src/app/scene-editor/animation/CharacterPanel.tsx` | CharacterPanel | Dialog «Versjonshistorikk for oppsettet» i CharacterPanel | aktiv |
| V-106 | dialog | `src/app/scene-editor/animation/CharacterPanel.tsx` | CharacterPanel | Dialog «Ta inn ny global versjon?» i CharacterPanel | aktiv |
| V-107 | dialog | `src/app/scene-editor/animation/CharacterPanel.tsx` | CharacterPanel | Dialog «Hvor skal den nye versjonen brukes?» i CharacterPanel | aktiv |
| V-108 | dialog | `src/app/scene-editor/animation/CharacterPanel.tsx` | CharacterPanel | Dialog «Karakter» i CharacterPanel | aktiv |
| V-109 | dialog | `src/app/scene-editor/animation/FaceMarkDialog.tsx` | FaceMarkDialog | Dialog «Marker ansikt» i FaceMarkDialog | aktiv |
| V-110 | dialog | `src/app/scene-editor/animation/MouthShapeEditor.tsx` | MouthShapeEditor | Dialog i MouthShapeEditor | aktiv |
| V-111 | popup | `src/app/scene-editor/animation/RhythmPanel.tsx` | RhythmPanel | Popup «Rytmeverktøy» i RhythmPanel | aktiv |
| V-112 | dialog | `src/app/scene-editor/animation/TextMouthTrack.tsx` | TextMouthTrack | Dialog «Rediger munnspor» i TextMouthTrack | aktiv |
| V-113 | dialog | `src/app/scene-editor/animation/TextMouthTrack.tsx` | TextMouthTrack | Dialog «Munnsett» i TextMouthTrack | aktiv |
| V-114 | dialog | `src/app/scene-editor/animation/VariantTracks.tsx` | Fallback | Dialog i Fallback | aktiv |
| V-115 | dialog | `src/app/script/ExportDialog.tsx` | ExportDialog | Dialog «Eksporter manus» i ExportDialog | aktiv |
| V-116 | dialog | `src/app/script/ImportDialog.tsx` | ImportDialog | Dialog «Importer manus» i ImportDialog | aktiv |
| V-117 | dialog | `src/app/script/LanguageVersionsDialog.tsx` | LanguageVersionsDialog | Dialog «Språkversjoner» i LanguageVersionsDialog | aktiv |
| V-118 | dialog | `src/app/script/LineLinkReview.tsx` | LineLinkReview | Dialog i LineLinkReview | aktiv |
| V-119 | bekreftelse | `src/app/script/NotesPanel.tsx` | NoteCard | Bekreftelsesdialog «Slette notatet?» i NoteCard | aktiv |
| V-120 | bekreftelse | `src/app/script/NotesPanel.tsx` | NoteCard | Bekreftelsesdialog «Bruke forslaget i manuset?» i NoteCard | aktiv |
| V-121 | dialog | `src/app/script/RemoveTranslationsDialog.tsx` | RemoveTranslationsDialog | Dialog i RemoveTranslationsDialog | aktiv |
| V-122 | panel | `src/app/script/ScriptWorkspace.tsx` | Workspace | Flytende panel i Workspace | aktiv |
| V-123 | popup | `src/app/script/ScriptWorkspace.tsx` | Workspace | Popup i Workspace | aktiv |
| V-124 | dialog | `src/app/script/TranslationImportDialog.tsx` | TranslationImportDialog | Dialog «Importer {language} manus» i TranslationImportDialog | aktiv |
| V-125 | dialog | `src/app/script/VersionsDialog.tsx` | VersionsDialog | Dialog i VersionsDialog | aktiv |
| V-126 | dialog | `src/app/script/assist/WritingPanel.tsx` | WritingPanel | Dialog i WritingPanel | aktiv |
| V-127 | panel | `src/app/script/assist/assist-ui.tsx` | AssistContextMenu | Flytende panel i AssistContextMenu | aktiv |
| V-128 | panel | `src/app/script-explorer/ExplorerNav.tsx` | AssetMenu | Flytende panel «Valg for {name}» i AssetMenu | aktiv |
| V-129 | panel | `src/app/script-explorer/ScriptExplorerPanel.tsx` | ScriptExplorerPanel | Flytende panel «Nettleseren blokkerte vinduet. Tillat popup-vinduer for denne siden, e» i ScriptExplorerPanel | aktiv |
| V-130 | dialog | `src/app/share/FilmShareDialog.tsx` | FilmShareDialog | Dialog «Del filmen med QR-kode» i FilmShareDialog | aktiv |
| V-131 | popup | `src/app/shell/SceneSelect.tsx` | SceneSelect | Popup «Søk på nummer, sted eller tid …» i SceneSelect | aktiv |
| V-132 | popup | `src/app/shell/TaskNav.tsx` | TaskNavInner | Popup i TaskNavInner | aktiv |
| V-133 | dialog | `src/app/shortcuts/ShortcutsDialog.tsx` | ShortcutsDialog | Dialog «Hurtigtaster» i ShortcutsDialog | aktiv |
| V-134 | dialog | `src/app/storylab/InterviewNodesPreview.tsx` | InterviewNodesPreview | Dialog «Foreslåtte noder» i InterviewNodesPreview | aktiv |
| V-135 | dialog | `src/app/storylab/NewGroupDialog.tsx` | NewGroupDialog | Dialog «Gruppesamtale» i NewGroupDialog | aktiv |
| V-136 | dialog | `src/app/storylab/ProfileGenerateDialog.tsx` | ProfileGenerateDialog | Dialog «Lag profil for {name} med AI» i ProfileGenerateDialog | aktiv |
| V-137 | dialog | `src/app/storylab/SceneLab.tsx` | SceneLab | Dialog i SceneLab | aktiv |
| V-138 | dialog | `src/app/storylab/SuggestionPreview.tsx` | SuggestionPreview | Dialog «Forhåndsvis overføring» i SuggestionPreview | aktiv |
| V-139 | dialog | `src/app/storylab/canvas/BuildFromScriptDialog.tsx` | BuildFromScriptDialog | Dialog «Bygg fra manuset» i BuildFromScriptDialog | aktiv |
| V-140 | dialog | `src/app/storylab/canvas/CanvasTransferDialog.tsx` | CanvasTransferDialog | Dialog «Opprett scene i manuset» i CanvasTransferDialog | aktiv |
| V-141 | feilside | `src/routes/__root.tsx` | ErrorComponent | Feilside «Siden finnes ikke eller er flyttet.» i ErrorComponent | aktiv |
| V-142 | feilside | `src/routes/__root.tsx` | NotFoundComponent | Feilside «Fant ikke siden» i NotFoundComponent | aktiv |
| V-143 | panel | `src/app/assembly/AiDialogueDialog.tsx` | AiDialogueDialog | Flytende panel i AiDialogueDialog | aktiv |
| V-144 | panel | `src/app/assembly/AiUpdateSection.tsx` | AiUpdateSection | Flytende panel i AiUpdateSection | aktiv |
| V-145 | panel | `src/app/assembly/BatchVideoDialog.tsx` | BatchVideoDialog | Flytende panel i BatchVideoDialog | aktiv |
| V-146 | panel | `src/app/assembly/MaterialUpdateSection.tsx` | MaterialUpdateSection | Flytende panel i MaterialUpdateSection | aktiv |
| V-147 | panel | `src/app/assembly/SceneVideoSection.tsx` | SceneVideoSection | Flytende panel i SceneVideoSection | aktiv |
| V-148 | panel | `src/app/assembly/ScriptChanges.tsx` | ScriptChanges | Flytende panel «Sett bare denne linjen tilbake slik den var da materialet ble laget» i ScriptChanges | aktiv |
| V-149 | panel | `src/app/library/AssetDetail.tsx` | DeleteAssetConfirm | Flytende panel i DeleteAssetConfirm | aktiv |
| V-150 | panel | `src/app/library/ContextLinkSuggestions.tsx` | ContextLinkSuggestions | Flytende panel «Manuelt mål» i ContextLinkSuggestions | aktiv |
| V-151 | panel | `src/app/library/GenerateImagePanel.tsx` | GenerateImagePanel | Flytende panel «Kandidater» i GenerateImagePanel | aktiv |
| V-152 | panel | `src/app/library/GenerateSoundPanel.tsx` | GenerateSoundPanel | Flytende panel «Automatisk» i GenerateSoundPanel | aktiv |
| V-153 | panel | `src/app/library/ImageAiPanels.tsx` | CostConfirm | Flytende panel i CostConfirm | aktiv |
| V-154 | panel | `src/app/library/ImageAiPanels.tsx` | UpscalePanel | Flytende panel «Resultatet blir svært stort. Velg 2×, eller frilegg og fjern luften ru» i UpscalePanel | aktiv |
| V-155 | panel | `src/app/library/ImageAiPanels.tsx` | TurnaroundPanel | Flytende panel «Skjul beskrivelsen» i TurnaroundPanel | aktiv |
| V-156 | panel | `src/app/library/TrashDialog.tsx` | TrashDialog | Flytende panel «Hent inn igjen» i TrashDialog | aktiv |
| V-157 | panel | `src/app/library/VisualBriefEditor.tsx` | VisualBriefEditor | Flytende panel «engelsk, ett kjennetegn per linje» i VisualBriefEditor | aktiv |
| V-158 | panel | `src/app/projects/MembersSection.tsx` | MembersSection | Flytende panel «Medlemmer» i MembersSection | aktiv |
| V-159 | panel | `src/app/projects/StyleGuideSection.tsx` | StyleGuideDialog | Flytende panel i StyleGuideDialog | aktiv |
| V-160 | panel | `src/app/scene-editor/DialogueVersions.tsx` | DialogueVersions | Flytende panel i DialogueVersions | aktiv |
| V-161 | panel | `src/app/scene-editor/GenerateDialogue.tsx` | GenerateDialogue | Flytende panel «Koble karakter til replikken» i GenerateDialogue | aktiv |
| V-162 | panel | `src/app/scene-editor/LayerImageDialog.tsx` | DeleteVersionConfirm | Flytende panel «Valgt» i DeleteVersionConfirm | aktiv |
| V-163 | dialog | `src/app/global/CharacterBundleControls.tsx` | CharacterBundleControls | Dialog i CharacterBundleControls | aktiv |
| V-164 | side | `src/routes/prosjekt.$projectId.storyboard.tsx` | StoryboardRoute | Side «Storyboard – Pen to Glass» (/prosjekt/$projectId/storyboard) | aktiv |
| V-165 | dialog | `src/app/storyboard/StoryboardWorkspace.tsx` | MovePanelDialog | Dialog i MovePanelDialog | aktiv |
| V-166 | dialog | `src/app/storyboard/StoryboardWorkspace.tsx` | Gallery | Dialog i Gallery | aktiv |
| V-167 | panel | `src/app/storyboard/PanelEditor.tsx` | PanelEditor | Flytende panel i PanelEditor | aktiv |
| V-168 | dialog | `src/app/storyboard/PanelEditor.tsx` | PanelEditor | Dialog i PanelEditor | aktiv |
| V-169 | dialog | `src/app/storyboard/PanelEditor.tsx` | PanelEditor | Dialog i PanelEditor | aktiv |
| V-170 | dialog | `src/app/storyboard/PanelEditor.tsx` | PanelEditor | Dialog i PanelEditor | aktiv |
| V-171 | dialog | `src/app/storyboard/StoryboardFilm.tsx` | StoryboardFilm | Dialog «Storyboardfilm» i StoryboardFilm | aktiv |
| V-172 | side | `src/routes/prosjekt.$projectId.storyboardref.tsx` | StoryboardRefRoute | Side /prosjekt/$projectId/storyboardref | aktiv |
| V-173 | dialog | `src/app/scene-editor/SceneSetupDialog.tsx` | SceneSetupDialog | Dialog i SceneSetupDialog | aktiv |
| V-174 | dialog | `src/app/scene-editor/StoryboardReferencePanel.tsx` | StoryboardReferencePanel | Dialog i StoryboardReferencePanel | aktiv |
| V-175 | side | `src/routes/review.$token.tsx` | ReviewRoute | Side /review/$token | aktiv |
| V-176 | panel | `src/app/share/StoryboardReviewPage.tsx` | StoryboardReviewPage | Flytende panel i StoryboardReviewPage | aktiv |
| V-177 | dialog | `src/app/storyboard/StoryboardReview.tsx` | StoryboardReview | Dialog i StoryboardReview | aktiv |
| V-178 | dialog | `src/app/storyboard/StoryboardReview.tsx` | StoryboardReview | Dialog i StoryboardReview | aktiv |
| V-179 | side | `src/routes/koble.tsx` | ConnectRoute | Side «Koble til et program – From Pen to Glass» (/koble) | aktiv |
