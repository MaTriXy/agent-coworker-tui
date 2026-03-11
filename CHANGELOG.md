# Changelog

All notable changes to this project will be documented in this file.

## 0.1.19 - 2026-03-11

### Added

- Added a recovery-focused backup workflow across the harness and desktop app. Workspaces can now browse backup history, inspect checkpoint file deltas, restore originals or checkpoints, delete whole backup entries, and reveal backup folders from the Backup settings page.
- Added workspace/session backup controls for disabled backups, whole-entry deletion, and seeded initial checkpoints so new sessions start with a recoverable baseline instead of waiting for the first manual checkpoint.

### Changed

- Reworked the desktop sidebar into a denser workspace-first layout with explicit expand controls, drag-and-drop workspace reordering, and a default cap of the 10 most recent threads per workspace with an overflow affordance.
- Refined the desktop composer so send and stop have distinct visual treatments, and the stop action remains available while a run is active.
- Made developer-mode diagnostics consistent between live sessions and transcript replay for observability, harness-context, and backup-status system notices.

### Fixed

- Fixed Codex auth persistence so desktop restarts no longer make recoverable Cowork-owned auth look lost after refresh failures or cross-process token races.
- Fixed Cowork auth recovery so usable legacy `~/.codex/auth.json` material is imported into `~/.cowork/auth/codex-cli/auth.json` when needed instead of leaving users unexpectedly signed out.
- Fixed the desktop Backup settings page freeze-on-open loop by stabilizing its initial refresh path.
