import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

// ── Canonical frontmost-app detection ────────────────────────────────────────
//
// One source of truth for "which app is the user on right now", shared by every
// handler (capture, learning, misc). Previously each file had its own
// copy-pasted osascript probe + EXCLUDED_APPS list, and the model-facing app
// name went through System Events osascript — which returns the PROCESS name
// (≠ display name), needs Automation/Accessibility permission, and SILENTLY
// returns "" when that permission is missing/flaky (with no timeout). That is
// what produced "wrong active window" and "can't see the app names".
//
// We now resolve via NSWorkspace.frontmostApplication.localizedName (the native
// `desktop-action frontmost-app` helper) FIRST: it is permission-free, returns
// the real display name, is timeout-bounded, and never silently blanks. The old
// osascript path stays only as a last-resort fallback if the helper is absent.

// The assistant's OWN process names across dev (Electron) and packaged builds
// (productName "Samuel", and the "Husky" rebrand) plus the bundle id stem. These
// are excluded so the overlay never reports ITSELF as the user's active app.
// NOTE: real user apps (e.g. Cursor) must NOT be here — excluding a user app
// makes "what app am I on" skip it and answer with something else.
export const EXCLUDED_APPS = ["samuel", "husky", "books-reader", "electron"];

export function isExcludedApp(name: string): boolean {
  const lower = name.toLowerCase();
  return EXCLUDED_APPS.some((ex) => lower.includes(ex));
}

function findHelper(name: string): string {
  // Mirrors misc.ts findHelper(): resources (packaged) → cwd → __dirname.
  const fromResources = join(process.resourcesPath, "helpers", name);
  if (existsSync(fromResources)) return fromResources;
  const fromCwd = join(process.cwd(), "helpers", name);
  if (existsSync(fromCwd)) return fromCwd;
  const fromDir = join(__dirname, "..", "..", "helpers", name);
  if (existsSync(fromDir)) return fromDir;
  return join("helpers", name);
}

// PRIMARY: NSWorkspace.frontmostApplication.localizedName via the native helper.
// Permission-free, real display name, never silently blanks. Returns "" only if
// the helper binary is missing or NSWorkspace momentarily reports nil ("UNKNOWN"
// during a fast app switch).
function nativeFrontmost(): string {
  try {
    const out = execFileSync(findHelper("desktop-action"), ["frontmost-app"], {
      encoding: "utf-8",
      timeout: 2000,
    }).trim();
    return out && out !== "UNKNOWN" ? out : "";
  } catch {
    return "";
  }
}

// FALLBACK: System Events process name. Requires Automation permission and can
// blank out, so it is only consulted when the native helper yields nothing.
function osascriptFrontmost(): string {
  try {
    return execFileSync(
      "/usr/bin/osascript",
      [
        "-e",
        'tell application "System Events" to get name of first application process whose frontmost is true',
      ],
      { encoding: "utf-8", timeout: 2000 },
    ).trim();
  } catch {
    return "";
  }
}

// Canonical resolver: native first, osascript fallback. Returns "" only when
// BOTH sources fail (e.g. helper missing AND Automation permission denied) — the
// caller should treat "" as "could not determine the app" and say so rather than
// fabricate.
export function getFrontmostAppName(): string {
  return nativeFrontmost() || osascriptFrontmost();
}
