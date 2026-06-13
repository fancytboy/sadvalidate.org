# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-06-13

### Added

- Initial release: question picker (AWS, Azure, GCP, agnostic challenges),
  drag-and-drop architecture canvas with adaptive curved connectors, zoom,
  touch support, per-node descriptions, and edge labels.
- AI feedback: overall design evaluation with score and grouped findings,
  plus a per-node deep review with severity badges, for Anthropic, OpenAI,
  Google Gemini, Qwen (bring your own key), and keyless local Ollama.
- Prompt-injection guardrails: data fencing, source neutralization, and a
  prompt size cap.
- Interview mode with an editable countdown timer.
- Offline support via a precaching service worker.
- Design persistence to localStorage and a manual model-result injector for
  testing without an API key.
- Two deployment options: a static host image (`Dockerfile`, nginx, BYOK) and
  the recommended zero-dependency key-holding server proxy
  (`server/server.mjs`, `server/Dockerfile`) that keeps API keys server-side,
  validates and rate-limits requests, and serves the app shell.
- Strict Content-Security-Policy, session-only API keys in BYOK mode, and a
  "Preview the exact request" link showing the full prompt and destination
  before anything is sent.
