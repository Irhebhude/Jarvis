import { BACKEND, GATEWAY_HTTP_URL, SYSTEM_PROMPT } from '../config'
import * as direct from './anthropic'
import * as bridge from './bridge'
import type { AskHandlers, Msg } from './anthropic'
import type { Blade, Panel } from '../store'

export type { AskHandlers, Msg }
export type { ConnectionState } from './bridge'

/**
 * Picks the brain. Both backends answer a question and stream text and tool
 * events back; they differ in where they run and what they can reach.
 *
 *   bridge — a local Node process running the Claude Agent SDK. Uses your
 *            existing Claude Code login, so no API key, and every MCP server
 *            you have configured is available, including local stdio ones.
 *
 *   direct — the browser calls the Claude API itself. No process to run and it
 *            deploys as a static site, but it needs an API key in the bundle
 *            and can only use remote HTTP MCP servers.
 */

export const usingBridge = BACKEND === 'bridge'
export const usingGateway = BACKEND === 'gateway'

/** Load conversation turns from the gateway's persistent memory store. The
 *  gateway stores only ordinary chat text here; credentials and secrets must
 *  never be written into conversation memory. */
export async function loadGatewayHistory(): Promise<Msg[]> {
  if (!usingGateway) return []
  const response = await fetch(`${GATEWAY_HTTP_URL}/v1/memory`, { cache: 'no-store' })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(payload.error ?? `Memory service error (${response.status}).`)
  const items = Array.isArray(payload.items) ? payload.items : []
  const messages: Msg[] = []
  for (const item of items) {
    if (typeof item?.text !== 'string') continue
    try {
      const parsed = JSON.parse(item.text)
      if ((parsed.role === 'user' || parsed.role === 'assistant') && typeof parsed.content === 'string') {
        messages.push({ role: parsed.role, content: parsed.content } as Msg)
      }
    } catch { /* Ignore non-conversation memory notes. */ }
  }
  return messages.slice(-16)
}

/** Replace the gateway's saved conversation with the most recent turns. */
export async function saveGatewayHistory(history: Msg[]): Promise<void> {
  if (!usingGateway) return
  const items = history.slice(-16).flatMap((message, index) => {
    const role = message.role
    if (role !== 'user' && role !== 'assistant') return []
    const content = typeof message.content === 'string'
      ? message.content
      : Array.isArray(message.content)
        ? message.content.map((part: any) => typeof part?.text === 'string' ? part.text : '').join('')
        : ''
    if (!content.trim()) return []
    return [{
      id: `chat_${index}_${role}`,
      text: JSON.stringify({ role, content: content.slice(0, 3500) }),
      createdAt: new Date().toISOString(),
    }]
  })
  const response = await fetch(`${GATEWAY_HTTP_URL}/v1/memory`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ items }),
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(payload.error ?? `Memory save failed (${response.status}).`)
}

function selectGatewayAgent(prompt: string): { agent: 'jarvis' | 'hedy' | 'sentinel' | 'orbit'; prompt: string } {
  const match = prompt.match(/^\s*(?:hey[, ]+)?(jarvis|hedy|sentinel|orbit)\b\s*[,.:!?-]?\s*/i)
  const agent = (match?.[1]?.toLowerCase() ?? 'jarvis') as 'jarvis' | 'hedy' | 'sentinel' | 'orbit'
  return { agent, prompt: match ? prompt.slice(match[0].length) || 'I am listening.' : prompt }
}

async function askGateway(prompt: string, history: Msg[], handlers: AskHandlers): Promise<{ text: string; tools: string[] }> {
  const selected = selectGatewayAgent(prompt)
  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...history.map((message: any) => ({ role: message.role, content: typeof message.content === 'string' ? message.content : (message.content ?? []).map((part: any) => part.text ?? '').join('') })),
    { role: 'user', content: selected.prompt },
  ]
  const response = await fetch(`${GATEWAY_HTTP_URL}/v1/chat/completions`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ messages, agent: selected.agent, max_tokens: 1200 }),
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(payload.error ?? `JARVIS gateway error (${response.status}).`)
  const answer = payload?.choices?.[0]?.message?.content
  if (typeof answer !== 'string') throw new Error('The AI gateway returned no answer text.')
  if (Number.isInteger(payload.tool_calls_executed) && payload.tool_calls_executed > 0) {
    handlers.onTool(`${payload.tool_calls_executed} read-only tool${payload.tool_calls_executed === 1 ? '' : 's'}`)
  }
  handlers.onText(answer)
  return { text: answer, tools: payload.tool_calls_executed > 0 ? ['gateway-read-only-tools'] : [] }
}

/** Conversation state lives in the bridge session, so history is only threaded
 *  through on the direct path. */
export async function ask(
  prompt: string,
  history: Msg[],
  handlers: AskHandlers,
): Promise<{ text: string; tools: string[] }> {
  if (usingBridge) return bridge.ask(prompt, handlers)
  if (usingGateway) return askGateway(prompt, history, handlers)
  return direct.ask([...history, { role: 'user', content: prompt }], handlers)
}

export async function warm(): Promise<void> {
  if (usingBridge) await bridge.warmBridge()
  else if (usingGateway) {
    const response = await fetch(`${GATEWAY_HTTP_URL}/health`)
    if (!response.ok) throw new Error('JARVIS AI gateway is not reachable.')
  }
}

/** The bridge reports its server list twice — from config on connect, then
 *  with live status once the agent boots — so the HUD subscribes. */
export function watchServers(fn: (servers: string[]) => void): void {
  if (usingBridge) bridge.watchServers(fn)
}

/** HUD panels are pushed mid-turn by the `display` tool, not returned by ask(). */
export function watchPanels(fn: (panel: Panel) => void): void {
  if (usingBridge) bridge.watchPanels(fn)
}

/** Blades — the big surface — arrive the same way, from the `blade` tool. Like
 *  panels and the ui_* commands, this is a bridge capability: the direct path
 *  has no channel for a server to volunteer anything mid-turn. */
export function watchBlades(fn: (blade: Blade) => void): void {
  if (usingBridge) bridge.watchBlades(fn)
}

/**
 * Redressing the interface — theme, reactor, orbiting objects, effects — is a
 * bridge capability, like panels. The `ui_*` tools live in an in-process MCP
 * server inside the bridge and push straight down the open socket, mid-turn.
 * The direct path has no such channel: the browser talks to the Messages API
 * over one-shot HTTPS requests and gets back an answer, with nowhere for a
 * server to volunteer anything. On that backend this watcher simply never
 * fires and the interface stays exactly as it ships.
 */
export function watchUi(fn: (op: string, args: any) => void): void {
  if (usingBridge) bridge.watchUi(fn)
}

/**
 * The one thing the bridge asks US for.
 *
 * Every other channel here is the bridge volunteering something mid-turn. A
 * camera frame is the exception — the hardware is in the browser and the model
 * is in the bridge — so this handler answers a request rather than receiving a
 * push. Bridge-only for the same reason as the rest: the direct path is one-shot
 * HTTPS, with nowhere for a request to arrive.
 */
export function watchCapture(
  fn: (req: bridge.CaptureRequest) => Promise<bridge.CaptureResult>,
): void {
  if (usingBridge) bridge.watchCapture(fn)
}

/**
 * Barge-in. Stops the answer on both paths and settles whatever `ask()` call
 * is outstanding, so the caller's await always returns — on the bridge by
 * interrupting the agent and resolving with the text so far, on the direct
 * path by aborting the stream so the model stops generating and billing.
 */
export function cancel(): void {
  if (usingBridge) bridge.cancel()
  else direct.cancel()
}

/** The older name for `cancel()`. */
export function interrupt(): void {
  cancel()
}

/**
 * Whether the brain is reachable right now.
 *
 * Only meaningful on the bridge, where a live socket is the session. The direct
 * path holds no connection between turns — each one is its own HTTPS request —
 * so there is nothing that can be down until you try it.
 */
export function isConnected(): boolean {
  return usingBridge ? bridge.isConnected() : true
}

/**
 * Connection state, for the UI.
 *
 * Worth surfacing because in bridge mode the socket *is* the conversation: all
 * of JARVIS's memory of the exchange lives in the agent session behind it, so a
 * drop wipes the conversation while the transcript on screen still shows it.
 * Never fires on the direct path, which has no connection to lose.
 */
export function watchConnection(
  fn: (state: bridge.ConnectionState) => void,
): void {
  if (usingBridge) bridge.watchConnection(fn)
}

/** Labels for the HUD's SYSTEMS rail. */
export function connectedLabels(): string[] {
  return usingBridge ? bridge.bridgeServers() : usingGateway ? ['AI Gateway'] : direct.connectedLabels()
}
