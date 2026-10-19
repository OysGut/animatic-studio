# AGENTS.md – Asset Studio

- Asset Studio stores scene draft steps as field-level changes and saves them in one UpdateSceneDraft with current base revisions; rebasing preserves unrelated fields, and own-write receipts identify exact affected rows, fields and revisions so concurrent edits cannot be silently overwritten.
