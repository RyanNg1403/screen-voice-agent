// Bridge to the main process for the global "talk" hotkey (Control+Option+
// Space) and the menu-bar listening cue. Exposed by preload.ts as
// window.__electronConversation; absent in a plain browser context.

interface ConversationBridge {
  /** Subscribe to global talk-hotkey presses. Returns an unsubscribe fn. */
  onToggle: (cb: () => void) => () => void;
  /** Report whether a conversation is active so the tray can show a cue. */
  setListening: (active: boolean) => void;
}

declare global {
  interface Window {
    __electronConversation?: ConversationBridge;
  }
}

export function getConversationBridge(): ConversationBridge | undefined {
  return window.__electronConversation;
}
