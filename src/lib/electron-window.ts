declare global {
  interface Window {
    __electronWindow: {
      setSize: (width: number, height: number) => void;
      hide: () => void;
      show: () => void;
    };
  }
}

export class LogicalSize {
  width: number;
  height: number;
  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
  }
}

class ElectronWindow {
  setSize(size: LogicalSize) {
    window.__electronWindow?.setSize(size.width, size.height);
  }
  hide() {
    window.__electronWindow?.hide();
  }
  show() {
    window.__electronWindow?.show();
  }
}

const singleton = new ElectronWindow();

export function getCurrentWindow() {
  return singleton;
}
