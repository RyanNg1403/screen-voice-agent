import { app, BrowserWindow, ipcMain, nativeImage, shell, globalShortcut, Tray, Menu, screen } from "electron";
import path from "node:path";
import fs from "node:fs";
import { execFile } from "node:child_process";

import { handleInvoke } from "./handlers/index.js";
import { snapshot_user_facing_app } from "./handlers/capture.js";
import { setWindowRef } from "./window-ref.js";

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;

// Show the overlay on whatever display the user is currently working on, so a
// summon always appears where they are rather than on a stale screen. If the
// window already overlaps the active display we leave it where they parked it.
function showOverlay(focus = false) {
  if (!mainWindow) return;
  // Snapshot the user's real frontmost app NOW — before the overlay can take
  // focus — so even TEXT turns (where clicking the panel makes Husky frontmost)
  // resolve the app the user was actually on, not the overlay or an arbitrary
  // window. Mirrors the speech_started snapshot for the voice path.
  try { snapshot_user_facing_app(); } catch { /* best-effort */ }
  const active = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  const b = mainWindow.getBounds();
  const wa = active.workArea;
  const onActiveDisplay =
    b.x < wa.x + wa.width && b.x + b.width > wa.x &&
    b.y < wa.y + wa.height && b.y + b.height > wa.y;
  if (!onActiveDisplay) {
    mainWindow.setBounds({
      x: Math.round(wa.x + (wa.width - b.width) / 2),
      y: Math.round(wa.y + (wa.height - b.height) / 3),
      width: b.width,
      height: b.height,
    });
  }
  // focus=true is the explicit "bring Husky to me" path (clicking the dock icon /
  // app activation): the user is deliberately switching TO Husky, so focusing is
  // correct and carries no hijack risk — there's no other app for macOS to
  // surface. Use show() so the panel is focused and ready to type into.
  if (focus) {
    mainWindow.show();
    return;
  }
  // Summon path (hotkey / tray) — must NOT activate the Husky app. show() triggers
  // a full macOS app activation; for this single-window, all-spaces, alwaysOnTop
  // panel that activation reshuffles window focus and surfaces whatever app was
  // previously frontmost (e.g. Discord/Chrome) instead of leaving the user in
  // their current app. The panel is alwaysOnTop("floating"), so showInactive +
  // moveTop floats it above the current app without stealing app focus. The user
  // clicks it (or uses the talk hotkey) to interact — summoning never hijacks focus.
  mainWindow.showInactive();
  mainWindow.moveTop();
}

// Husky is a *summonable* overlay, not a permanent pin. The user dismisses it
// when they want Codex unobstructed and brings it back via the tray icon or the
// global hotkey (Option+Space). This toggle is the single source of truth.
function toggleWindow() {
  if (!mainWindow) return;
  if (mainWindow.isVisible()) mainWindow.hide();
  else showOverlay();
}

// Resolve Samuel's app icon for both packaged (resources/icon.png) and
// dev (../build/icon.png relative to compiled dist-electron/main.js) layouts.
// Prefers the higher-resolution PNG so the dock can pick the best size.
function resolveAppIconPath(): string | null {
  const candidates = [
    path.join(process.resourcesPath ?? "", "icon.png"),
    path.join(__dirname, "..", "build", "icon.png"),
    path.join(__dirname, "..", "..", "build", "icon.png"),
  ];
  for (const p of candidates) {
    if (p && fs.existsSync(p)) return p;
  }
  return null;
}

function requestAccessibilityPermission() {
  execFile(
    "/usr/bin/osascript",
    [
      "-e",
      'tell application "System Events" to name of first application process whose frontmost is true',
    ],
    (error, _stdout, _stderr) => {
      if (error) {
        console.error(
          "[accessibility] permission may not be granted — check System Settings → Privacy → Accessibility",
        );
        execFile("/usr/bin/open", [
          "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility",
        ]);
      } else {
        console.log("[accessibility] permission granted ✓");
      }
    },
  );
}

function createWindow() {
  const iconPath = resolveAppIconPath();
  const iconImage = iconPath ? nativeImage.createFromPath(iconPath) : null;

  mainWindow = new BrowserWindow({
    width: 460,
    height: 560,
    minWidth: 380,
    minHeight: 360,
    // Husky is a companion overlay (PRD FR-1): it must float above whatever
    // app the learner is in (e.g. Codex) so they never alt-tab between two
    // windows. alwaysOnTop keeps it visible; the level + workspace settings
    // below let it ride over fullscreen apps and across Spaces.
    alwaysOnTop: true,
    frame: false,
    transparent: true,
    hasShadow: false,
    skipTaskbar: true,
    resizable: true,
    backgroundColor: "#00000000",
    icon: iconImage ?? undefined,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      // The talk hotkey can start a conversation while the panel is hidden;
      // hidden windows are throttled by default, which would stall the mic /
      // realtime audio loop. Keep the renderer running at full speed.
      backgroundThrottling: false,
    },
  });

  // "floating" sits just above normal windows without fighting menus/alerts;
  // visibleOnFullScreen lets the overlay show over a fullscreen Codex, and
  // setVisibleOnAllWorkspaces makes it follow the learner across Spaces.
  mainWindow.setAlwaysOnTop(true, "floating");
  mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

  // Dock icon comes from the .app bundle in production, but in dev we still see
  // the default Electron icon unless we explicitly set it on app.dock.
  if (process.platform === "darwin" && iconImage && app.dock) {
    app.dock.setIcon(iconImage);
  }

  if (process.env.NODE_ENV === "development") {
    mainWindow.loadURL("http://localhost:5173");
  } else {
    mainWindow.loadFile(path.join(__dirname, "..", "dist-ui", "index.html"));
  }

  // Route window.open() calls (e.g. external links inside show_content panels)
  // to the user's default browser instead of spawning a new Electron window.
  // Without this handler Electron's modern default is { action: "deny" },
  // which silently swallows clicks inside Samuel's show_content overlays.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("http://") || url.startsWith("https://")) {
      shell.openExternal(url).catch((err) => {
        console.error("[shell.openExternal] failed:", err);
      });
    }
    return { action: "deny" };
  });

  if (process.platform === "darwin") {
    requestAccessibilityPermission();
  }

  setWindowRef(mainWindow);
  mainWindow.on("closed", () => {
    mainWindow = null;
    setWindowRef(null);
  });

  // Menu-bar (tray) presence so the overlay is dismissable and re-summonable
  // instead of permanently floating over every app. Left-click toggles
  // show/hide; right-click opens a small menu.
  if (!tray) {
    const trayIcon = iconImage
      ? iconImage.resize({ width: 18, height: 18 })
      : nativeImage.createEmpty();
    tray = new Tray(trayIcon);
    tray.setToolTip("Husky — click to show or hide");
    const menu = Menu.buildFromTemplate([
      { label: "Show / Hide Husky", click: toggleWindow },
      { type: "separator" },
      { label: "Quit Husky", click: () => app.quit() },
    ]);
    tray.on("click", toggleWindow);
    tray.on("right-click", () => tray?.popUpContextMenu(menu));
  }
}

ipcMain.handle(
  "invoke",
  async (_event: Electron.IpcMainInvokeEvent, command: string, args: unknown) => {
    return handleInvoke(command, args as Record<string, unknown>);
  },
);

ipcMain.handle("window:setSize", (_event, width: number, height: number) => {
  if (mainWindow) {
    mainWindow.setSize(Math.round(width), Math.round(height));
  }
});

ipcMain.handle("window:hide", () => {
  if (mainWindow) {
    mainWindow.hide();
  }
});

ipcMain.handle("window:show", () => {
  showOverlay();
});

// Full quit from the in-panel control (the third quit path alongside ⌘Q and the
// menu-bar "Quit Husky" item).
ipcMain.handle("app:quit", () => {
  app.quit();
});

// Continuously track the user's last REAL (non-overlay) frontmost app at a low
// cadence. This is what makes "what app am I on" correct when the user works in
// another app while the panel stays visible, then clicks a control / types in
// it (which makes Husky frontmost): snapshot_user_facing_app only records a
// non-excluded app, so lastUserFacingApp always holds the app they were just in.
// Cheap — one ~10ms native frontmost read; covers voice, text, and click turns.
let frontmostPollTimer: ReturnType<typeof setInterval> | null = null;

app.whenReady().then(() => {
  createWindow();
  frontmostPollTimer = setInterval(() => {
    try { snapshot_user_facing_app(); } catch { /* best-effort */ }
  }, 2500);
  // Show/hide the overlay (Option+Space).
  const okToggle = globalShortcut.register("Alt+Space", toggleWindow);
  if (!okToggle) console.warn("[hotkey] Option+Space registration failed");
  // Start/stop the voice conversation from anywhere (Control+Option+Space),
  // independent of whether the panel is visible. The renderer owns the
  // session, so we just forward the intent; it works even while hidden.
  const okTalk = globalShortcut.register("Control+Alt+Space", () => {
    if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.webContents.isDestroyed()) {
      mainWindow.webContents.send("husky:toggle-conversation");
    }
  });
  if (!okTalk) console.warn("[hotkey] Control+Option+Space registration failed");
});

// Renderer reports conversation state so the menu-bar icon can show a
// glanceable "listening" cue when the panel is hidden.
ipcMain.handle("husky:set-listening", (_event, active: boolean) => {
  if (!tray) return;
  tray.setToolTip(active ? "Husky — listening (⌃⌥Space to stop)" : "Husky — click to show or hide");
  tray.setTitle(active ? " ●" : "");
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
  // Explicit app activation (dock icon / ⌘-tab to Husky): focus the overlay —
  // the user deliberately switched to Husky, so unlike the hotkey/tray summon
  // this should grab focus.
  showOverlay(true);
});

app.on("will-quit", () => {
  globalShortcut.unregisterAll();
  if (frontmostPollTimer) {
    clearInterval(frontmostPollTimer);
    frontmostPollTimer = null;
  }
});
