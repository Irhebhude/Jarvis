# JARVIS production deployment guide

This release adds a Docker Compose deployment topology for the existing JARVIS gateway and React/Vite interface. It is a deployment package, **not evidence that a live deployment or live AI provider has been tested**.

## What runs

- `web`: builds the frontend and serves it through Nginx on port 8080.
- `gateway`: runs the Node AI gateway on a private Docker network; it is not published to the host.
- `jarvis_data`: persistent Docker volume for memory, documents, tasks, plans, research and audit records.
- Nginx protects the single-user workspace with HTTP Basic Auth (`.htpasswd`), forwards `/v1/*` to the private gateway and injects the server-side bearer token. The token is not compiled into browser JavaScript.
- Camera, microphone, location and motion-sensor browser permissions are allowed only for the same origin; the browser and Android still require user permission.
- `/health` is proxied to the gateway. A healthy gateway only proves that the process responds, not that the AI provider is reachable.

## Requirements

- A Linux server or computer with Docker Engine and the Docker Compose plugin.
- Node.js 22 is used inside the build/runtime images.
- A reachable OpenAI-compatible model endpoint. A model is not bundled.
- For public hosting, a domain and HTTPS/TLS termination through a trusted reverse proxy or Cloudflare Tunnel.

An Android browser alone cannot host this server or run a capable local model. A zero-cost local inference path requires another computer/server with enough memory/compute and a compatible local model runtime. A hosted model provider may charge for inference.

## Deploy

1. Copy the project folder to the host.
2. Copy `.env.production.example` to `.env`.
3. Replace `JARVIS_GATEWAY_TOKEN` with a long random secret. On Linux, `openssl rand -hex 32` generates one.
4. Set `JARVIS_AI_BASE_URL`, `JARVIS_AI_MODEL`, and `JARVIS_AI_API_KEY` for the model endpoint reachable from the gateway container. See `AI_PROVIDER_SETUP.md` for Groq, Gemini and Ollama settings. Keep provider keys only in this server-side `.env` file.
5. Create the private web password file. With Docker available, run `read -rsp "JARVIS password: " JARVIS_PASS; echo; printf '%s\n' "$JARVIS_PASS" | docker run --rm -i httpd:2.4-alpine htpasswd -niB jarvis > deploy/nginx/.htpasswd; unset JARVIS_PASS`. Keep this file private; it is gitignored.
6. Before public access, put the site behind HTTPS using a trusted TLS reverse proxy or Cloudflare Tunnel. Basic Auth must not be sent over plain public HTTP.
7. Build the frontend locally when validating a release: `npm ci && npm run build`. If you load `.env` into the shell, run `npm run deploy:preflight` to check required settings, password file and scan built JavaScript for supplied secrets.
8. Build and start: `docker compose up -d --build`.
9. Check: `docker compose ps` and `docker compose logs --tail=100 gateway web`.
10. Open the site through the HTTPS address for a private smoke test. Do not expose plain HTTP publicly. Put HTTPS in front before public use.

The web container is the only published service. Do not publish port 8790. The built-in Basic Auth password is a single-user gate, not multi-user identity management. Keep an additional HTTPS access layer in front if the server is internet-accessible.

## Updating and backups

- Update source, then run `docker compose up -d --build`.
- Back up the `jarvis_data` volume before upgrades. The JSON files are application data; deleting the volume deletes saved memories, documents, tasks, plans, research and audit history.
- A simple backup can be made with `docker run --rm -v <compose-project>_jarvis_data:/data -v "$PWD":/backup alpine tar czf /backup/jarvis-data-backup.tgz -C /data .` (replace the volume name with the actual name shown by `docker volume ls`).
- Test restoration to a separate volume before relying on backups.

## Current deployment blockers / limits

- No live provider credentials or endpoint are supplied in the source package; the provider connector is integration-tested against a mock OpenAI-compatible server, but a real external model response must be verified after you add your own key using the Task Control “TEST LIVE CONNECTION” control.
- The frontend production build must pass on the target builder. It was not verified in the development environment because dependency installation timed out.
- This is a single-user gateway. There is no built-in account registration, multi-user authorization, tenant isolation, password reset or admin console. Use a trusted access proxy and do not offer public self-registration.
- Gateway storage uses JSON files and a persistent volume, not a managed database. It is appropriate for a single-instance early deployment, not multi-replica scaling.
- Web search depends on DuckDuckGo HTML and may be blocked/rate-limited. Public web fetches can fail due website restrictions.
- Browser retrieval is script-free, not a full graphical browser. Agent runs produce AI reports; they do not autonomously perform arbitrary computer actions.
- ORBIT now queries the Copernicus STAC catalogue for satellite-product metadata. A live external catalogue request could not be tested in this build environment. It is not live video. No native Android companion, persistent phone sensor monitor, CCTV/security sensor integration, ROS 2 bridge, robot driver or exoskeleton actuator integration is included. See `integrations/INTEGRATION_ARCHITECTURE.md`.
- PDF parsing is lightweight; scanned PDFs need OCR. Image understanding requires a vision-capable model.

## Production go-live checklist

- [ ] Build completes successfully (`npm ci && npm run build`).
- [ ] All gateway tests pass (`npm run test:gateway:all`, or run the listed scripts individually).
- [ ] Real model health, the Task Control live-provider test and a normal chat request succeed using the selected provider.
- [ ] Copernicus satellite catalogue search succeeds for a small test bounding box and date interval.
- [ ] Basic Auth password file exists and HTTPS/access control is active.
- [ ] Vision request succeeds if image analysis is enabled.
- [ ] HTTPS and access restrictions are active before public exposure.
- [ ] Gateway port 8790 is not internet-accessible.
- [ ] `.env` and provider credentials are not committed or embedded in `dist/`.
- [ ] Persistent volume backup and restore are tested.
- [ ] Privacy notice, retention policy and user consent are ready before processing other people's data.

Do not treat the application as ready for public multi-user launch until the blockers above are resolved.
