# JARVIS AI Gateway

A provider-neutral, server-side adapter for OpenAI-compatible chat completion endpoints. Provider credentials stay on the server. The default endpoint is local Ollama; this does not install or run a model for you.

## Start

```bash
npm run gateway
```

Health: `GET http://127.0.0.1:8790/health`
Agent directory: `GET http://127.0.0.1:8790/v1/agents`
Chat: `POST http://127.0.0.1:8790/v1/chat/completions`

Example request:

```json
{"agent":"jarvis","messages":[{"role":"system","content":"You are JARVIS."},{"role":"user","content":"Hello."}]}
```

Valid agent IDs: `jarvis`, `hedy`, `sentinel`, `orbit`. In the browser UI, address a message with the agent name at the beginning, e.g. `Hedy, review this design` or `Orbit, explain what satellite imagery can show`. Without a name, JARVIS handles the request.

## Configuration

- `JARVIS_AI_BASE_URL`: OpenAI-compatible base URL; default `http://127.0.0.1:11434/v1`.
- `JARVIS_AI_MODEL`: model name; default `llama3.2`.
- `JARVIS_AI_API_KEY`: optional provider key, kept server-side.
- `JARVIS_GATEWAY_TOKEN`: optional bearer token. Required before exposing the service remotely.
- `JARVIS_GATEWAY_HOST` / `JARVIS_GATEWAY_PORT`: bind address and port.
- `JARVIS_ALLOWED_ORIGINS`: comma-separated exact browser origins.

The default binds to localhost. Do not expose an unauthenticated gateway to the public internet. Before remote deployment, configure HTTPS, a strong gateway token, exact allowed origins, and a proper authenticated user session. The current browser client does not yet send a gateway token, so remote authenticated deployment needs a further session/auth integration milestone.

## Zero-cost reality

The local Ollama option does not require a paid API, but it needs a compatible model installed on a computer/server with enough RAM and compute. An Android phone alone is not assumed to run this complete stack. Cloud providers may offer free tiers, but those tiers can have quotas and can change.

## Current scope and limitations

This milestone adds distinct agent role prompts and a directory endpoint. They are role-specialized conversations sharing the same configured language model, not four independent models. The gateway does not yet execute external tools, control devices, fetch satellite feeds, or provide continuous security monitoring. The existing conversation history is saved locally by the browser UI; it is not encrypted cloud or cross-device memory.

## Permission-controlled tool registry (v4)

- `GET /v1/tools` lists the registered tools and the current risk policy.
- `POST /v1/tools/execute` executes only registered read-only tools.
- `GET /v1/audit` returns the latest in-memory tool execution audit entries.

Example:

```json
{"tool_id":"core.math.calculate","args":{"expression":"(12 + 8) * 3"}}
```

The initial registry contains only `core.time.now`, `core.text.analyze`, and `core.math.calculate`. It cannot run shell commands, read files, send messages, change device settings, access networks, or control hardware. The audit log is held in memory and is cleared when the gateway restarts. Write-capable tools are intentionally not enabled in this milestone; they need explicit approval flows and per-integration permissions first.

## Persistent memory and audit

The gateway stores data in `./data` by default (override with `JARVIS_DATA_DIR`). `GET /v1/memory` reads memory, `PUT /v1/memory` replaces up to 100 items (4,000 characters each), and `DELETE /v1/memory` clears it. `GET /v1/audit` returns the latest 50 persisted tool events. These endpoints are intended for localhost development. Before network exposure, configure a long `JARVIS_GATEWAY_TOKEN`, restrict allowed origins, and protect the host/data directory. Do not store passwords or API keys in memory.


## Frontend conversation sync (v6)

When `VITE_BACKEND=gateway`, the browser restores up to 16 recent user/assistant text turns from the gateway memory endpoint before voice startup and syncs the updated history after successful answers. Browser localStorage remains a fallback. This is a simple shared gateway-host store, not encrypted personal cloud storage. Do not store credentials or sensitive personal data in conversation memory.


## Model tool calling

The chat endpoint exposes only three registered read-only functions to compatible OpenAI-style providers: current time, text analysis and arithmetic. The gateway validates function names and arguments, runs tools locally, writes audit records and returns tool results to the model. The tool loop is bounded. It does not expose file, shell, browser, account, messaging, purchase, deletion or device-control actions.

Some OpenAI-compatible providers/models do not support function calling. In that case the provider may return an error or ignore the tools; configure a model/runtime that explicitly supports tool calls.


## Local task planner (v8)

The gateway stores internal task records in `data/tasks.json`:
- `GET /v1/tasks` lists tasks; optional `?status=planned` filter.
- `POST /v1/tasks` creates a task with `title`, optional `description`, `priority`, `agent`, and `requiresApproval`.
- `PATCH /v1/tasks/:id` updates status through validated transitions, or approves/rejects a task awaiting approval.

These are task records only; this API does not execute external actions or prove real-world work is complete. Tasks flagged `requiresApproval` start in `awaiting_approval`. Approval moves them to `planned`; only then can work be marked `in_progress`. Completed/failed/cancelled are terminal states. Maximum 500 tasks. Keep the gateway localhost-bound unless remote authentication and deployment security are configured.


## Plan coordination API (v10)

- `GET /v1/plans` lists saved plans.
- `POST /v1/plans` accepts a goal and 1–12 ordered steps. Each step may specify title, description, agent, priority and `requiresApproval`.
- Plans are persisted in `data/plans.json`; their steps become ordinary task records linked by `planId` and `stepNumber`.
- Each step after the first depends on the immediately preceding step. A dependent task cannot enter `in_progress` until its prerequisite is `completed`.
- Approval-required steps remain `awaiting_approval` until approved.

This is a planning and coordination data layer, not an autonomous executor. It does not call agents, run shell commands, access devices or perform external actions. Plans are supplied by the client; model-generated decomposition is a future integration. PATCH is included in the CORS allowed-methods list for browser task updates.

## AI plan generation API (v11)

`POST /v1/plans/generate` accepts `{ "goal": "..." }` and asks the configured OpenAI-compatible model to produce a bounded 2–12-step plan. The gateway validates each step, assigns sequential dependencies, persists the plan and task records, and returns the generated model name. Steps that appear to involve external side effects (for example publishing, sending, purchasing, deleting, deploying, configuring or controlling) are forced into `awaiting_approval` by a server-side keyword backstop even if the model says approval is unnecessary.

This endpoint requires a running compatible model at `JARVIS_AI_BASE_URL` and a valid `JARVIS_AI_MODEL`; the default Ollama address does not mean Ollama is installed. Provider failure or invalid output fails closed. Generated plans are proposals only: no agent is dispatched and no external action is executed. The keyword backstop is not a complete safety classifier. The browser Task Control panel exposes the generator when `VITE_BACKEND=gateway`.

Run `npm run test:gateway:plan-generator` for the mock-provider integration test.

## Agent report runner (v12)

- `POST /v1/tasks/:id/run` dispatches one planned task to its assigned role prompt (JARVIS, HEDY, SENTINEL or ORBIT) through the configured OpenAI-compatible model.
- Approval-required tasks must first be approved. A task with dependencies cannot run until every prerequisite is marked completed.
- The gateway marks the task `in_progress`, calls the model with a 60-second timeout, and persists a bounded text report plus model name and timestamp. Provider failures mark the task `failed`.
- The route exposes no tools and cannot browse, edit files, send messages, control devices, or perform other external actions. A saved report is not proof that real-world work was completed. The user must review it and separately confirm completion.
- Each task can be run once in this milestone. This is a model-backed report worker, not a background scheduler or independent agent process.

Run `npm run test:gateway:agent-runner` to exercise role routing, approval/dependency gates, report persistence and the no-false-completion rule using a deterministic mock provider.

## Source-based research (v13)

- `POST /v1/research` accepts `{ "query": "...", "urls": ["https://..."] }` with 1–5 user-supplied HTTPS URLs.
- The gateway retrieves HTML/plain-text pages only, with a 1 MB response cap, 12-second request timeout, 12,000-character extract cap per source, and at most three HTTPS redirects.
- DNS results are checked and pinned to a public address; localhost, IP-literal hosts, private/reserved destinations, non-HTTPS URLs, embedded credentials, and redirects to HTTP are rejected.
- The configured model synthesizes only the retrieved extracts and is instructed to cite claims as `[S1]`, `[S2]`, etc. Reports, source URLs, model and timestamps are persisted in `data/research.json`.
- `GET /v1/research` lists saved reports. Task Control includes a mobile research form and displays the report with original source links.

This is **not general web search**: users must supply source URLs. It does not crawl sites, access paywalls, download PDFs or binary files, or guarantee that a source is accurate. Retrieved page text is untrusted evidence; verify important claims at the original source. A compatible model must be running for report synthesis. Research is read-only and does not execute instructions found on source pages.

Run `npm run test:gateway:research` for URL-policy and fail-closed API tests. These tests do not prove unrestricted live internet retrieval; actual public-site fetching and model synthesis still need testing in a configured environment.


## Controlled browser navigation (v14)

The gateway exposes a lightweight, script-free page reader rather than a graphical browser:

- `POST /v1/browser/open` with `{ "url": "https://example.org" }` retrieves a public HTTPS page and returns its title, readable text and up to 30 HTTPS links.
- `POST /v1/browser/follow` with `{ "url": "https://example.org/path" }` retrieves a selected link using the same network protections.

Navigation uses the research fetcher: public DNS resolution is pinned to a checked address, private/reserved addresses are blocked, redirects are limited, response size is capped, and only HTML/plain text is accepted. Page scripts are never executed; authenticated browser sessions, form submission, downloads, JavaScript apps and graphical interaction are not supported. Page content and links are untrusted. This is not a search engine: the user must supply the first URL.


## Public web search (v15)

- `POST /v1/search` accepts `{ "query": "..." }` with a 1–300 character query.
- The gateway submits the query to the fixed DuckDuckGo HTML endpoint using the same HTTPS-only, DNS-pinned public-host fetcher used for source retrieval.
- The parser unwraps DuckDuckGo redirect links, retains HTTPS destinations only, removes fragments, deduplicates URLs and returns up to eight result links.
- Task Control now includes a web-search form. A result can be added to the source URL field for the existing evidence-research workflow.

Search provider availability, result quality and regional access are not guaranteed; DuckDuckGo may block or rate-limit automated requests. Search results are leads, not verified facts. JARVIS does not automatically trust result snippets or claim that a search result is true. Open sources and use the research workflow to compare evidence. Search is read-only and does not execute page scripts or interact with accounts.

Run `npm run test:gateway:search` and `npm run test:gateway:search-api` for parser and API validation tests. These tests use deterministic fixtures and do not prove live provider availability.

## Document knowledge API (v16)

- `POST /v1/documents` — save `{ "title": "...", "text": "...", "filename": "optional.md" }`. Accepts pasted plain text/Markdown, up to 48,000 characters and 100 stored documents.
- `GET /v1/documents` — list metadata without returning full document bodies.
- `GET /v1/documents/:id` — retrieve one saved document.
- `POST /v1/documents/search` — search `{ "query": "..." }` using local keyword matching; returns up to 10 excerpts and matched terms.
- `DELETE /v1/documents/:id` — delete a saved document.

This is a local text vault and lexical search, not semantic/vector retrieval. PDFs, Word files, image OCR and AI question-answering over stored documents are not yet supported. Treat imported document content as untrusted.


## Image understanding (v18)

`POST /v1/vision/analyze` accepts `{ "filename": "photo.png", "image": "data:image/png;base64,..." }` for JPEG, PNG or WebP images up to 2 MB. The gateway forwards the image to the configured OpenAI-compatible chat-completions provider using the standard image_url content format. A vision-capable model is required. The generated description/transcription is saved as a text document in the Knowledge Vault; original image bytes are not retained. Model-generated image descriptions can be wrong and should be checked for important decisions. This endpoint does not implement PDF/Word extraction or standalone OCR.

## PDF and Word extraction (v19)

`POST /v1/documents/extract` accepts `{ "filename": "report.pdf", "mimeType": "application/pdf", "data": "<base64>" }` for PDF, or the official DOCX MIME type for `.docx`. Maximum binary upload is 3 MB. Extracted text is stored in the same Knowledge Vault and is available to keyword search and document Q&A. The gateway does not retain the original file bytes.

DOCX extraction reads the main document XML from the ZIP package. PDF extraction supports basic text-showing operators in uncompressed and Flate-compressed streams. Scanned PDFs require OCR, which is not included. Complex PDF fonts/layouts/tables and some DOCX features may not be preserved; verify important content after import. Run `npm run test:gateway:document-extract` for deterministic parser/API tests.

## Long-term memory tools (v20)

The memory API now supports individually managed notes in addition to the existing conversation-history sync:
- `POST /v1/memory` saves one durable memory with optional category and tags.
- `GET /v1/memory/search?q=...&limit=10` ranks saved memories using local lexical relevance, a small hand-written synonym map, phrase matching and a modest recency factor.
- `PATCH /v1/memory/:id` edits text, category or tags; `DELETE /v1/memory/:id` removes one memory.
- `GET /v1/memory/conflicts` surfaces possible positive/negative wording conflicts for human review.
- Existing `GET`, `PUT` and `DELETE /v1/memory` remain available. Conversation-history `PUT` now preserves individually saved durable memories while replacing chat-prefixed history items.

This is **not embedding-based semantic memory** and it does not autonomously infer or write personal facts from conversations. Search is a local heuristic; conflict flags are review suggestions, not proof. The UI lets the user add, search, edit and delete memories. Keep credentials and sensitive secrets out of the memory store.

Run `npm run test:gateway:memory-engine` to test ranking, synonym expansion, conflict-review heuristics, individual CRUD, persistence and conversation-sync compatibility.
