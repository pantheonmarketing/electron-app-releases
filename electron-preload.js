/**
 * electron-preload.js — Secure bridge between Electron main process and renderer
 */

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // License management
  getLicense: () => ipcRenderer.invoke('license:get'),
  getLicenseTier: () => ipcRenderer.invoke('license:tier'),
  validateKey: (key) => ipcRenderer.invoke('license:validate', key),
  saveLicense: (key, name, tier) => ipcRenderer.invoke('license:save', key, name, tier),
  clearLicense: () => ipcRenderer.invoke('license:clear'),

  // App info
  getVersion: () => ipcRenderer.invoke('app:version'),
  getPort: () => ipcRenderer.invoke('app:port'),

  // Updates
  checkForUpdate: () => ipcRenderer.invoke('update:check'),
  downloadUpdate: () => ipcRenderer.invoke('update:download'),
  installUpdate: () => ipcRenderer.invoke('update:install'),
  onUpdateAvailable: (cb) => ipcRenderer.on('update-available', (_, data) => cb(data)),
  onUpdateNotAvailable: (cb) => ipcRenderer.on('update-not-available', () => cb()),
  onUpdateProgress: (cb) => ipcRenderer.on('update-progress', (_, data) => cb(data)),
  onUpdateDownloaded: (cb) => ipcRenderer.on('update-downloaded', () => cb()),
  onUpdateError: (cb) => ipcRenderer.on('update-error', (_, msg) => cb(msg)),

  // Navigation
  goToApp: async () => {
    const port = await ipcRenderer.invoke('app:port');
    window.location.href = `http://localhost:${port}`;
  },
  goToLicense: async () => {
    const port = await ipcRenderer.invoke('app:port');
    window.location.href = `http://localhost:${port}/license.html`;
  },
});
