# JARVIS development status — consolidated v21

## Implemented
- Existing Iron Man-inspired JARVIS React interface retained.
- Provider-neutral Node gateway for OpenAI-compatible chat completion APIs.
- Server-side provider API key handling; no provider key is embedded in the Vite frontend by the gateway.
- Health endpoint, request size limits, rate limiting and origin checks.
- Agent role selection: JARVIS, HEDY, SENTINEL and ORBIT.
- Browser conversation history plus gateway-backed persistent memory API.
- Persistent memory storage (up to 100 items, 4,000 characters each) and persistent audit log.
- Read-only tool registry: current time, text analysis and arithmetic.
- **Model-mediated tool calling:** the gateway exposes only three registered read-only functions to compatible providers, validates their names and arguments, executes them server-side, records audit entries, and returns results to the model.
- Tool loop is bounded to three provider rounds and four total tool calls per user request.
- Invalid/unregistered tool calls are blocked.

## Verification performed
- Gateway source passes `node --check`.
- Local gateway starts and health/agent/tool endpoints respond.
- Direct tool endpoint tests cover valid calculator and text-analysis requests, invalid tool names, and division-by-zero rejection.
- Model-mediated tool execution path was code-reviewed and syntax checked.
- ZIP archive integrity verified.

## Not yet verified / not implemented
- No actual model response has been tested because no local Ollama runtime/model or compatible provider is configured in this environment.
- Tool calling requires a provider/model that supports the OpenAI-compatible `tools` / `tool_calls` interface. Some local models do not support it.
- Frontend production build is not verified; dependency installation/build previously timed out.
- No write-capable integrations, Android accessibility/system control, computer control, satellite feed, live physical security monitoring, or robotics control.
- The dashboard tool status is a summary indicator, not a live per-tool progress stream.

## Safety
Only the three read-only tools above can be invoked by the model. No sending, posting, purchasing, deleting, account changes, device control, or network scanning is available through this tool loop.

## Zero-cost note
The gateway code itself does not require a paid API key. Actual AI responses still need a reachable local model runtime or a compatible free provider. Running a local model requires suitable compute; a phone browser alone does not run this server/model.

## Next milestone
Add user-controlled memory notes and task planning with explicit approval states, then connect the UI to the task API.


## v8 — persistent task planner

Implemented in `gateway/server.mjs`: persistent task records, create/list/filter endpoints, priorities and assignment to the four agents, approval gate for flagged tasks, validated status transitions, a 500-task cap, and audit entries for task changes.

Verification scope: gateway syntax and HTTP integration tests are run against a temporary local data directory. This planner tracks records; it does not execute external actions. Model-mediated task creation, frontend task panel, remote deployment security, provider/model connection, and production frontend build remain unimplemented or unverified.

## v9 — Android-friendly task control panel

Added `src/ui/TaskConsole.tsx`, mounted only when `VITE_BACKEND=gateway`:
- Mobile-first task panel with task creation, agent/priority selection and optional approval gate.
- Lists and filters task records from the gateway API.
- Supports approval/rejection and permitted start/complete/fail transitions.
- Displays API errors and makes the non-execution boundary explicit.

The panel requires the gateway server from v8 to be running and reachable at `VITE_GATEWAY_URL` (default `http://localhost:8790`). It is not available in direct or bridge backend mode. It does not make the model autonomous or execute external tasks.


## v10 — multi-agent plan coordination foundation

Implemented persistent plans with ordered task steps, assignment labels for the four agent roles, prerequisite dependency checks, and approval gates. Plans can be created/listed through `/v1/plans`; steps reuse the task API and audit log. CORS now explicitly permits PATCH so browser-based task status controls can call the API.

Verified by `npm run test:gateway:plans` and `npm run test:gateway:tasks` using isolated temporary storage. This is not yet AI-generated planning or autonomous agent execution. No agent is dispatched, no external tool is called, and the frontend currently provides task management rather than a plan-authoring interface. Frontend production build remains unverified unless a build is run successfully.


## v11 — model-backed plan generation

Implemented `POST /v1/plans/generate`: sends a user's goal to the configured OpenAI-compatible model endpoint, requires a bounded JSON plan (2–12 steps), validates agent/priority/field values, persists the plan and task records, and builds sequential dependencies. A server-side safety heuristic forces human approval for steps whose title/description includes external side-effect verbs (for example publish, send, purchase, delete, deploy, configure, or control), even if the model marks them as safe. Provider unavailability, malformed JSON, invalid plans, and storage limits fail closed without creating tasks.

The Task Control panel now includes an AI plan-generation field. This requires an actual compatible model endpoint configured in the gateway; default Ollama settings do not imply a model is installed. The generated plan is a proposed work breakdown only: agents are not dispatched and no external action is executed. The approval heuristic is a conservative backstop, not a complete safety classifier.

Verification: `node --check gateway/server.mjs`, existing task/plan API tests, and a new deterministic mock-provider test for generation, validation, approval enforcement, dependencies and persistence. Frontend build remains unverified unless dependencies can be installed.


## v12 — model-backed agent report runner

Implemented `POST /v1/tasks/:id/run`. A planned task is sent to the configured model with the assigned JARVIS/HEDY/SENTINEL/ORBIT role rules. The gateway enforces approval and prerequisite gates, records the task as in progress, and stores a bounded report with model and timestamp. Provider errors fail the task and are audited. The route provides no tools and cannot perform external actions. A report is not treated as real-world completion; the user must review it and explicitly confirm completion. Each task can be run once in this milestone.

Task Control now offers a role-specific Run button, shows the saved agent report, and only enables Confirm complete after a report is saved. This remains model-generated analysis/reporting, not a background autonomous worker, browser operator, file editor, device controller or hardware controller.

Verification: gateway syntax check and task, plan, plan-generator and agent-runner integration tests all pass using isolated test storage and a deterministic mock provider. Actual model connectivity remains untested. Frontend production build remains unverified.


## v13 — source-based research and evidence reports

Added `POST /v1/research` and `GET /v1/research`. The user supplies a question and 1–5 HTTPS URLs. The gateway fetches HTML/plain-text only, caps each response at 1 MB and each extract at 12,000 characters, applies a 12-second timeout and a three-redirect limit, validates DNS destinations against private/reserved addresses, pins the connection to a checked public IP, and blocks non-HTTPS redirects and URL credentials. The configured model synthesizes retrieved extracts, is instructed to cite factual claims with `[S1]`-style source IDs, and must distinguish evidence gaps and conflicts. Reports and source metadata persist in `data/research.json`.

Task Control now includes a source-research form and displays the report with links to original sources. This is **user-supplied-source research, not a general search engine**. It does not crawl, search the open web, access paywalls, parse PDFs, or guarantee source truth. The model only receives supplied page extracts; no source-page instructions are executed. No files, accounts, devices or external systems are modified.

Verification: `node --check` for gateway/research modules plus research URL-policy/API tests, agent runner, plan generator, plan API and task API integration tests all pass. Tests use a mock provider or reject unsafe URLs; they do not verify a successful fetch from a live public website or live-model synthesis. Frontend production build remains unverified.


## v14 — controlled browser navigation

- Added `POST /v1/browser/open` and `/v1/browser/follow` for script-free retrieval of public HTTPS pages.
- Page responses include bounded readable text, title and up to 30 unique HTTPS links.
- Reuses the SSRF-resistant research fetcher: DNS address pinning, private/reserved IP blocking, HTTPS-only redirects, redirect cap, 1 MB response cap and 12-second request timeout.
- Added request rate limiting to page opening and audit events for navigation outcomes.
- Added `gateway/test-browser.mjs` and `test:gateway:browser`.
- Limitations: no search provider, no graphical browser, no JS execution, no logged-in sessions, no form submission, no downloads and no external side effects. User supplies initial URLs.
- Added a mobile-friendly page reader to Task Control with an initial URL field, extracted link navigation, page text and an original-site link.
- Real public-site navigation has not been verified; frontend production build remains unverified.


## v15 — Web search integration

Added a bounded web-search endpoint backed by DuckDuckGo's HTML results, HTTPS-only result parsing, redirect unwrapping, URL deduplication and audit events. The Task Control panel can search and add selected result URLs to the source research form. Tests cover parser behavior and API validation. The live provider has not been verified in this environment; automated search may be rate-limited or blocked. Search results are untrusted leads, not verified facts. The existing source-based research flow still requires a configured compatible model for synthesis. Frontend production build remains unverified because node_modules are not installed in this workspace.

## v16 — document knowledge vault

- Added a persistent document library at `data/documents.json` with atomic file replacement and restrictive file permissions.
- Added `POST /v1/documents` for user-supplied plain text/Markdown (title 1–160 chars; content up to 48,000 characters), `GET /v1/documents` for metadata, `GET /v1/documents/:id` for full text, `POST /v1/documents/search` for local keyword matching, and `DELETE /v1/documents/:id`.
- Stores up to 100 documents. Search returns up to 10 ranked matches with excerpts and matched terms. It is lexical keyword matching, not embeddings or semantic retrieval.
- Added a mobile Task Control document panel to save pasted notes, search the library, list metadata and delete documents.
- Document text is stored locally by the gateway; it is not automatically sent to an AI provider. No PDF/DOCX parsing, OCR, automatic upload, chunk embeddings or model-grounded Q&A are implemented.
- Added `gateway/test-documents.mjs`; test covers validation, save, keyword search, detail retrieval, disk persistence and deletion.
- Verification: all nine gateway test suites pass; `node --check gateway/server.mjs` passes. Frontend production build remains unverified unless separately completed.


## v17 — document-grounded knowledge reasoning

- Added `POST /v1/documents/ask` to answer a question using keyword-ranked passages retrieved from saved text/Markdown documents. The retriever splits documents into bounded overlapping passages, removes common question stop-words, scores passage matches and sends at most six passages to the configured OpenAI-compatible model.
- Model instructions require answers to stay within supplied passages, cite material claims with `[D1]`-style labels, identify insufficient evidence and treat document contents as untrusted reference data rather than instructions. Responses include document titles, filenames, matched terms, excerpts and character ranges for citation inspection.
- No-match and empty-vault cases fail closed without calling the model. Provider timeouts/errors are surfaced; Q&A activity is audited.
- Task Control now includes an “Ask JARVIS about your saved knowledge” input and displays the model answer plus retrieved source passages.
- This is keyword-based passage retrieval, not vector embeddings or guaranteed semantic search. Citation labels identify retrieved document passages, not independently verified facts. Only saved plain text/Markdown is supported; PDF/DOCX extraction and OCR remain out of scope. A compatible model must be configured and reachable; no model is bundled and inference may require compute or provider access.
- Added `gateway/test-document-qa.mjs` covering empty vault, retrieval, source labels, prompt safety, no-match behavior, audit and persistence.
- Verification: gateway syntax and all ten gateway integration test suites pass using local test providers and isolated storage. Actual model-provider connectivity and frontend production build remain unverified.


## v18 — image understanding

- Added `POST /v1/vision/analyze` for JPEG, PNG and WebP data URLs up to 2 MB.
- Uses configured OpenAI-compatible multimodal chat completion; vision-capable model required.
- Persists generated descriptions and visible-text transcription as searchable Knowledge Vault documents; original image bytes are not retained.
- Added mobile-friendly image file selection in Task Control.
- Added MIME/base64 validation, bounded request size, provider timeout/error handling, audit records and mock-provider test.
- This is model-based image understanding, not a guaranteed OCR engine. PDF/Word extraction and semantic embeddings remain unimplemented.
- Test: `node gateway/test-vision.mjs` passed with deterministic mock provider. Live vision provider and frontend production build remain unverified.

## v19 — PDF and Word document extraction

- Added `POST /v1/documents/extract` to import PDF and DOCX files as searchable Knowledge Vault text. Uploads are capped at 3 MB (5 MB JSON envelope), validated against filename/MIME type and stored as extracted text rather than retaining the original file.
- DOCX extraction reads `word/document.xml` from the ZIP container, supports stored/Deflate entries, decodes XML entities, and preserves paragraph, tab and line-break boundaries.
- PDF extraction reads text-showing operators from uncompressed and Flate-compressed content streams. This is a lightweight parser: complex font encodings, scanned/image-only PDFs, advanced layouts and table reconstruction may fail. No OCR is claimed.
- Added a mobile-friendly PDF/DOCX file picker to Task Control. Extracted text enters the existing searchable and question-answerable Knowledge Vault.
- Added size/type checks, bounded ZIP entry count, extraction errors, audit events and `gateway/test-document-extract.mjs`.
- Verification: extraction tests pass for DOCX paragraphs, basic PDF text, MIME mismatch and non-extractable scanned/empty PDF. All gateway suites were rerun; live user documents and frontend production build are not verified here.

## v20 — persistent long-term memory management

- Added individually managed memory items with category, tags, creation/update timestamps, persistent atomic storage, edit and delete operations.
- Added local relevance ranking with phrase boosts, a small explicit synonym map and modest recency weighting. This is a deterministic lexical retrieval heuristic, not vector embeddings or a neural semantic-memory model.
- Added a possible-conflict review endpoint that flags overlapping wording with opposite positive/negative polarity. It is a human-review hint, not a contradiction detector or truth judgment.
- Updated existing conversation-history sync so it replaces `chat_` entries while preserving separately saved long-term memories.
- Added Task Control UI to create, search, inspect, edit and delete saved memories.
- Added `gateway/test-memory-engine.mjs` covering ranking, synonym expansion, conflict hints, create/search/edit/delete, persistence and conversation-sync compatibility.
- Security/limits: maximum 100 memory items, 4,000 characters per item, no credentials or secrets should be stored. The memory store is local gateway storage and is not encrypted cloud sync.
- Verification: all 13 gateway test suites pass using isolated storage and deterministic mock providers where required. Actual external AI connectivity and the frontend production build remain unverified.


## v21 — consolidated deployment foundation

- Added a production Docker build for the Node gateway (non-root runtime) and a multi-stage Vite/Nginx frontend image.
- Added Docker Compose with a private gateway network, persistent `jarvis_data` volume, health check and only the web service published.
- Added same-origin `/v1/*` and `/health` reverse proxying. The browser bundle contains no gateway bearer token; Nginx injects the server-side token when forwarding to the private gateway.
- Added per-client Nginx API rate limiting, security response headers, gateway proxy-IP handling behind the private reverse proxy, and fail-closed startup if the gateway secret is missing.
- Changed the gateway frontend URL default to same-origin; Vite development proxy routes `/v1` and `/health` to the local gateway.
- Added `.env` ignore rules, production environment template, deployment/backup/go-live guide, and a consolidated gateway test runner.
- Added deployment-configuration tests for private gateway exposure, server-side token injection, persistent storage, non-root gateway process and secret ignore rules.

Verification in this workspace: all 14 gateway test suites pass (13 functional suites plus deployment configuration); `node --check` passes for the gateway and test runner. `npm ci` timed out, so the frontend production build and Docker image build are **not verified** here. Live provider connectivity is also unverified.

### Deployment status

The repository now contains a production deployment topology, but it is **not yet approved for public production launch**. Before public use, the host operator must successfully build the frontend/container images, configure a reachable AI model endpoint and strong secret, put HTTPS and an identity-aware access layer in front of the single-user app, verify real model responses, and test persistent-volume backup/restore. There is no built-in multi-user authentication or tenant isolation. Do not expose the gateway port directly.

### Explicitly outside this software-only release

No unrestricted Android system control, computer-use browser automation, account integrations, CCTV/sensor monitoring, live arbitrary-location satellite video, satellite tasking, robotics, motor control or exoskeleton hardware is implemented. These require separate hardware/services, user authorization and safety testing. ORBIT currently provides role guidance and data-source integration foundations, not a live satellite feed. SENTINEL is a defensive assistant role, not an endpoint detection agent. HEDY provides engineering reasoning/reporting, not unattended modification of arbitrary systems.


## v22 — integration and deployment-hardening foundation

### Implemented in source
- Added authenticated provider configuration status and a real, bounded OpenAI-compatible provider connection test at `GET /v1/provider/status` and `POST /v1/provider/test`. The test performs an actual small model request, redacts credentials and audits success/failure. Automated tests use a local mock provider; no real provider key was available in this environment.
- Added ORBIT's Copernicus Data Space STAC catalogue integration at `POST /v1/orbit/search`, including bounded bounding-box validation, UTC date interval validation, collection allowlist, result limit, timeout and audit logging. Task Control now has a basic Sentinel-2 catalogue search panel. A live external Copernicus request could not be made because this environment has no DNS/network access. This returns catalogue metadata and optional preview links, not live video or full-resolution GIS processing.
- Added an AI provider setup guide for Groq, Gemini's OpenAI-compatible endpoint and Ollama. Keys remain server-side. Provider model IDs and free quotas must be checked in the provider's current console/docs.
- Added native Android companion, satellite data, ROS 2/ros2_control and exoskeleton safety integration architecture documentation. No Android APK, ROS 2 driver, robot actuator control or exoskeleton controller is included.
- Hardened the single-user web workspace with Nginx Basic Auth backed by a gitignored `.htpasswd` file; the password file is mounted read-only. Updated browser Permissions-Policy to allow same-origin camera, microphone, geolocation and motion sensors subject to user/browser permission.
- Added GitHub Actions CI to install dependencies, run the production frontend build, run gateway integration tests, run deployment preflight and build both Docker images.

### Verification performed
- `npm run test:gateway:all`: 16 suites passed, 0 failed. Provider integration test used a deterministic local OpenAI-compatible mock server and verified a real HTTP round trip to that mock.
- Node syntax checks passed for gateway and new tests. TypeScript/TSX syntax transpilation passed for 36 source files; this is not a complete type-check.
- Compose and CI YAML parsed successfully. Nginx configuration syntax test passed using a temporary local upstream and temporary htpasswd file.

### Deployment blockers still open
- `npm ci` could not complete because npm registry DNS requests failed with `EAI_AGAIN`; the offline cache does not contain the required Vite/React/type packages. Consequently `npm run build` still fails before application compilation with missing `vite/client` and `node` type definitions. This cannot be honestly marked fixed in this network-isolated environment.
- Docker is not installed in this environment, so Docker image builds and Compose startup have not been executed. The new GitHub Actions workflow is prepared but has not been run against a remote repository.
- No live Groq/Gemini/Ollama credentials were provided; the live-provider route is implemented and mock-tested, but real external model inference remains unverified.
- The Copernicus endpoint could not be reached from this environment because DNS resolution is unavailable. The catalogue connector is implemented and validation-tested, not live-network verified.
- Native Android sensor/system-control companion, CCTV/security hardware, ROS 2 bridge, robot and exoskeleton integrations require selected hardware, Android app development/build, vendor protocols and independent safety engineering. The language model is not an actuator controller.

## v23 integration completion patch (2026-11-01)

This release addresses the integration gaps identified in the v22 status screenshots. It adds concrete native/robotics project scaffolds and repeatable CI checks; it does not misrepresent hardware integration as physically commissioned.

### Added
- Authenticated `/v1/devices/telemetry` GET/POST API with strict reading allowlist, bounded payload, per-client rate limit, latest-snapshot persistence and audit events.
- Native Android companion project (`android-companion/`) for explicitly started, foreground-only accelerometer, gyroscope, magnetometer, light and proximity reporting over HTTPS. No camera/microphone/location/accessibility/device-admin permissions and no remote-control path.
- ROS 2 Python package (`robotics/jarvis_ros_bridge/`) that subscribes to `/joint_states` and sends read-only summaries to the gateway. It has no actuator command publisher.
- Exoskeleton safety reference evaluator (`robotics/exoskeleton_safety/`) with disarmed-by-default state, stale-sample and range faults, and latched E-stop. Simulation/reference only; no motor interface.
- CI jobs to install dependencies and build the actual frontend, run gateway tests, build both Docker images, compile the Android debug APK and run robotics safety tests.
- Optional live CI checks for Copernicus STAC and a real OpenAI-compatible provider using GitHub repository secrets.
- Live smoke-test scripts that do not print API credentials.

### Verified in this environment
- All 17 gateway Node integration test suites pass, including new device telemetry auth/persistence tests.
- All 5 exoskeleton safety reference-model tests pass.
- ROS 2 bridge and safety Python sources pass `py_compile`.
- Gateway source passes `node --check`.

### Still requires a network-enabled CI runner or user credentials
- Frontend production build and Docker image builds: local npm registry requests time out (`EAI_AGAIN`) and Docker is not installed in this environment. The workflow now performs these exact steps on GitHub Actions.
- Android APK build: Android SDK/Gradle build is configured in CI but not executable in this environment.
- Real AI provider: requires `JARVIS_AI_BASE_URL`, `JARVIS_AI_MODEL` and, where needed, `JARVIS_AI_API_KEY` secrets. Mock provider tests are not proof of external connectivity.
- Live satellite catalogue: live Copernicus smoke test is configured in CI; this environment could not resolve external domains.
- ROS 2 runtime/hardware: bridge source compiles, but ROS 2 dependencies and physical devices are not installed here. No motor control or exoskeleton deployment is included.

### Release safety boundary
The Android companion only sends user-consented foreground sensor telemetry. The ROS 2 bridge is read-only. The exoskeleton module is not a safety-rated controller and must never be wired to actuators. Public deployment still requires HTTPS, a strong gateway token, a unique device credential/pairing flow, and successful CI/live checks.
