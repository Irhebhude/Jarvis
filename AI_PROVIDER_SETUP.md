# JARVIS AI provider setup

JARVIS uses a server-side OpenAI-compatible Chat Completions endpoint. Provider credentials must only be stored in the hosting server's `.env` file; never put them in `VITE_*` variables or browser code.

## Recommended zero-upfront-cost paths

### Option A — Groq hosted API

This is the easiest cloud option for the current gateway because the API is OpenAI-compatible. Create an account and API key in Groq Console, then set on the server:

```dotenv
JARVIS_AI_BASE_URL=https://api.groq.com/openai/v1
JARVIS_AI_MODEL=YOUR_CURRENT_AVAILABLE_MODEL_ID
JARVIS_AI_API_KEY=YOUR_GROQ_API_KEY
```

Choose a model ID currently shown in the [Groq supported-model list](https://console.groq.com/docs/models). Current documented production IDs include `openai/gpt-oss-120b` and `openai/gpt-oss-20b`; check the live price/rate-limit table because some models are billed per token and free access is not guaranteed. Do not assume unlimited free inference. JARVIS's `POST /v1/provider/test` endpoint makes a real, small request and confirms whether the configured model actually responds.

### Option B — Google Gemini OpenAI-compatible endpoint

If you choose Gemini, use Google's currently documented OpenAI-compatible endpoint and a model enabled for your project:

```dotenv
JARVIS_AI_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai
JARVIS_AI_MODEL=YOUR_ENABLED_GEMINI_MODEL_ID
JARVIS_AI_API_KEY=YOUR_GEMINI_API_KEY
```

Google currently documents a limited free tier for selected Gemini API models, but quotas and model access can change. The free tier may use submitted content to improve Google products, so do not send confidential or sensitive material unless its data-use terms are acceptable. Check the [current pricing and free-tier terms](https://ai.google.dev/gemini-api/docs/pricing) first.

### Option C — Ollama on a separate computer/server

```dotenv
JARVIS_AI_BASE_URL=http://host.docker.internal:11434/v1
JARVIS_AI_MODEL=YOUR_INSTALLED_MODEL
JARVIS_AI_API_KEY=
```

Install Ollama and pull a model on the host machine. Configure Ollama to listen on a host-reachable interface only if needed; firewall it so it is not exposed publicly. This option has no per-token API bill, but needs a computer with enough RAM/VRAM and electricity. An Android phone by itself is not a practical host for the complete JARVIS stack plus a capable model.

## Verify the connection

After the gateway is running, call `POST /v1/provider/test` through the authenticated same-origin web application. A successful response means a real provider completion was received. `/health` alone only means the gateway process is alive.

Never share your API key in chat, screenshots, GitHub, the frontend `.env`, or browser developer tools. Rotate it immediately if exposed.
