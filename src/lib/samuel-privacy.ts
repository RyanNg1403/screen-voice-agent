/**
 * Privacy gating helpers for tool-level enforcement.
 *
 * Tools defined in `samuel.ts` run in the renderer process, so they can read
 * UI prefs directly from localStorage rather than going through the React
 * hook (which would require threading a context all the way into each tool's
 * `execute()`). This module is the seam between the two layers.
 *
 * The canonical schema lives in `src/hooks/useUIPreferences.ts` — keep keys
 * AND defaults in sync with the SCHEMA there, which defaults every privacy
 * capability OFF on a fresh install. We fail CLOSED: if prefs are missing/
 * corrupt (e.g. before the hook has written defaults to localStorage), tools
 * are treated as DISABLED rather than allowed, so an uninitialized state can't
 * silently grant a capability the Settings schema says is off. In steady state
 * the saved prefs govern, so this only affects the brief pre-mount window.
 *
 * Two scopes of privacy keys exist:
 *
 *   - "proactive" (screen_watch, audio_listen): default OFF. Controls the
 *     ambient watcher and learning loops. Does NOT block on-demand tools.
 *   - "tool" (screen_read, audio_record, computer_use): default OFF (mirror
 *     schema). Controls the tools the model can call directly during a turn.
 *     These are master kill-switches for the corresponding capability.
 *   - "ambient context" (local_time, location): default varies. Gates
 *     ambient context that's injected at session boot or fetched on
 *     demand by tools. The model receives a clear "gated" signal so it
 *     can ask the user to flip the toggle instead of guessing.
 *
 * Voice input (privacy.voice_input) is a fourth axis enforced at the
 * React layer — see App.tsx — because the realtime mic is renderer-side
 * and there's no tool to gate. It doesn't have a helper here.
 */

const PREFS_KEY = "samuel-ui-prefs";

function readBool(prefKey: string, defaultValue: boolean): boolean {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) return defaultValue;
    const prefs = JSON.parse(raw) as Record<string, unknown>;
    const value = prefs[prefKey];
    if (typeof value === "boolean") return value;
    return defaultValue;
  } catch {
    return defaultValue;
  }
}

/**
 * Tool-scope privacy capabilities exposed in the Settings panel. Defaults
 * mirror the schema defaults in `useUIPreferences.ts` (all OFF on fresh install)
 * so an uninitialized state fails closed instead of granting a capability.
 */
export const privacy = {
  /** On-demand screen reading: read_app, observe_screen, list_browser_tabs. */
  canReadScreen(): boolean {
    return readBool("privacy.screen_read", false);
  },
  /**
   * Explicit on-demand system-audio capture via the `recording` tool —
   * "record this song", "capture what's playing". Distinct from
   * canListenAmbient() (the passive audio buffer + learning loop), which
   * is gated by privacy.audio_listen. Users who want zero audio capture
   * under any circumstance need both off.
   */
  canRecordAudio(): boolean {
    return readBool("privacy.audio_record", false);
  },
  /** Desktop automation: clicks, typing, key presses, computer_use loop. */
  canControlComputer(): boolean {
    return readBool("privacy.computer_use", false);
  },
  /**
   * YOLO / bypass mode: when true, per-action approval prompts are
   * auto-approved instead of asking. Master capability toggles (canReadScreen,
   * canControlComputer, …) and macOS system permissions still apply — this
   * only silences the in-the-moment "may I do X?" cards. Default OFF.
   */
  bypassApprovals(): boolean {
    return readBool("privacy.bypass_approvals", false);
  },
  /** Proactive screen watching (continuous observation + watcher). Default OFF. */
  canWatchScreen(): boolean {
    return readBool("privacy.screen_watch", false);
  },
  /** Proactive ambient audio listening (rolling system-audio buffer). Default OFF. */
  canListenAmbient(): boolean {
    return readBool("privacy.audio_listen", false);
  },
  /**
   * Knowledge of the user's local time + IANA timezone. Default OFF —
   * opt-in. When off:
   *   - Session-boot inject in useRealtime.ts sends UTC instead of local time.
   *   - get_time() with no `tz` argument falls back to UTC.
   *   - get_time(tz="...") still works because the user named the zone.
   * Timezone leaks region (~country/state granularity) so this is treated
   * as ambient context, not a tool guard — there's no "permission denied"
   * surface; instead the model gets UTC and is told why.
   */
  canKnowTime(): boolean {
    return readBool("privacy.local_time", false);
  },
  /**
   * Approximate physical location via IP geolocation (city, region, country).
   * Default OFF — opt-in. Calling get_location while disabled returns a
   * permission error. Does NOT cover GPS-grade location; that would need a
   * separate CoreLocation bridge.
   */
  canKnowLocation(): boolean {
    return readBool("privacy.location", false);
  },
};

/**
 * Standard JSON-serialized error envelope returned to the model when a tool
 * is blocked by a privacy toggle. Uses `error_type: "permission"` so the
 * model treats it like other permission denials and surfaces it cleanly to
 * the user instead of retrying.
 */
export function privacyBlockError(
  capability: "screen reading" | "audio recording" | "voice input" | "computer use" | "location",
): string {
  return JSON.stringify({
    ok: false,
    error_type: "permission",
    message: `${capability[0].toUpperCase()}${capability.slice(1)} is disabled in Settings → Privacy. Tell the user to re-enable it if they want this action.`,
    try_instead: null,
  });
}
