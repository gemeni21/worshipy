const { contextBridge, clipboard } = require('electron');

// Expose safe desktop environment flags and APIs to the renderer
contextBridge.exposeInMainWorld('worshipyDesktop', {
  isDesktop: true,
  platform: process.platform,
  version: process.env.npm_package_version || '0.1.0',
  copyToClipboard: (text) => {
    try {
      clipboard.writeText(text);
      return true;
    } catch (e) {
      console.error('Failed to copy to desktop clipboard:', e);
      return false;
    }
  },
  readClipboard: () => {
    try {
      return clipboard.readText();
    } catch {
      return '';
    }
  },
});
