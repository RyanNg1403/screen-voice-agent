import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("__electronInvoke", (command: string, args: unknown) =>
  ipcRenderer.invoke("invoke", command, args),
);

contextBridge.exposeInMainWorld("__electronWindow", {
  setSize: (width: number, height: number) =>
    ipcRenderer.invoke("window:setSize", width, height),
  hide: () => ipcRenderer.invoke("window:hide"),
  show: () => ipcRenderer.invoke("window:show"),
});

contextBridge.exposeInMainWorld("__electronConversation", {
  // Fired when the global talk hotkey (Control+Option+Space) is pressed.
  onToggle: (cb: () => void) => {
    const listener = () => cb();
    ipcRenderer.on("husky:toggle-conversation", listener);
    return () => ipcRenderer.removeListener("husky:toggle-conversation", listener);
  },
  // Report listening state so the main process can update the tray cue.
  setListening: (active: boolean) => ipcRenderer.invoke("husky:set-listening", active),
});
