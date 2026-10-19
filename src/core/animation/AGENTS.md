# AGENTS.md – character animation

- Character Animation reuses composition layers, image segments, selected audio, segment helpers, scene clock and command stack to keep preview/export consistent. Immutable variant rigs are scene-pinned; marking uses one UpdateSceneDraft, preserves frames, and disabling retains setup. Rig-part image imports use a rig-only UpdateSceneDraft; triggers commit approval receipts, which backups omit to preserve ordinary Asset Studio imports and portable restoration.
