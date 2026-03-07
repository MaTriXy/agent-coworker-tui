# Lessons

- Scope websocket `try/catch` blocks to decode/parse only; never wrap consumer event callbacks in the same catch path.
- Keep fallback stream IDs lifecycle-stable: do not seed with per-chunk indices, and align id-less `tool_input_*` and `tool_*` call/result IDs to the same fallback call key.
- For live production-loop validation, avoid over-constraining tool-call order unless the ordering itself is the behavior under test; assert required tool usage, not first-call sequencing.
- For live desktop UI testing in this repo, default to the Playwright/CDP workflow first; relaunch Electron with `COWORK_ELECTRON_REMOTE_DEBUG=1` instead of relying only on lighter wrappers.
