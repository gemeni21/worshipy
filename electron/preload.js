const { contextBridge } = require('electron');

// Expose safe desktop environment flags and APIs to the renderer
contextBridge.exposeInMainWorld('worshipyDesktop', {
  isDesktop: true,
  platform: process.platform,
  version: process.env.npm_package_version || '0.1.0',
});
