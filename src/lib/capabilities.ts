const DEFAULT_HEALTH_CAPABILITIES = Object.freeze({ stt: false, tts: false })

export type Capabilities = {
  /** ElevenLabs speech-to-text (Scribe) is reachable via the bridge. */
  stt: boolean
  /** ElevenLabs text-to-speech is reachable via the bridge. */
  tts: boolean
}

/** Browser-only until the probe says otherwise. Safe default: the app works. */
let current: Capabilities = { ...DEFAULT_HEALTH_CAPABILITIES }
let probed = false

export function parseHealthCapabilities(payload: unknown): Capabilities {
  if (!payload || typeof payload !== 'object') {
    return { ...DEFAULT_HEALTH_CAPABILITIES }
  }

  const record = payload as Record<string, unknown>
  const nested = record.capabilities && typeof record.capabilities === 'object'
    ? (record.capabilities as Record<string, unknown>)
    : {}

  const stt = record.stt === true || nested.stt === true
  const tts = record.tts === true || nested.tts === true
  return { stt, tts }
}

export function caps(): Capabilities {
  return current
}

export function capabilitiesProbed(): boolean {
  return probed
}

/**
 * Ask the bridge what it can do, once. Called during the boot sequence, before
 * the voice loop starts, so the first "Hey Jarvis" already uses the right
 * engine. Never throws: a failed probe simply leaves the browser fallback in
 * place, which is the correct behaviour when the bridge is unreachable.
 */
export async function probeCapabilities(): Promise<Capabilities> {
  if (BACKEND !== 'bridge') {
    // No bridge to ask. Direct mode has no server-side speech, so browser only.
    current = { ...DEFAULT_HEALTH_CAPABILITIES }
    probed = true
    return current
  }
  try {
    const res = await fetch(`${BRIDGE_HTTP_URL}/health`, {
      signal: AbortSignal.timeout(3000),
    })
    if (res.ok) {
      current = parseHealthCapabilities(await res.json())
    }
  } catch {
    // Bridge down or slow — stay on the browser engines rather than blocking
    // boot on a health check that is only an optimisation.
  }
  probed = true
  return current
}

/** A short human label for the HUD: what voice stack is actually in play. */
export function engineLabel(): string {
  const c = current
  if (c.stt && c.tts) return 'ElevenLabs'
  if (c.tts) return 'ElevenLabs voice'
  // env.elevenKey is only meaningful in direct mode; harmless to mention.
  if (env.elevenKey && BACKEND !== 'bridge') return 'ElevenLabs (direct)'
  return 'browser speech'
}
