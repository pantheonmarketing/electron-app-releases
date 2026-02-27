/**
 * electron-main.js — Electron main process for "AI CEO" desktop app
 *
 * Starts the Express server internally, opens BrowserWindow,
 * and gates access behind a license key.
 */

const { app, BrowserWindow, ipcMain, Menu, net, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const netNode = require('net');
const { autoUpdater } = require('electron-updater');

// ── Config ──
const APP_NAME = 'AI CEO';
const LICENSE_FILE = path.join(app.getPath('userData'), 'license.json');
const IS_DEV = !app.isPackaged;
const LICENSE_API = 'https://aicreatorworkshop.com/api/license-validate';

let mainWindow = null;
let serverPort = null;

// ── Auto-updater setup ──
autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = true;

autoUpdater.on('update-available', (info) => {
  if (mainWindow) {
    mainWindow.webContents.send('update-available', {
      version: info.version,
      releaseNotes: info.releaseNotes || '',
    });
  }
});

autoUpdater.on('update-not-available', () => {
  if (mainWindow) {
    mainWindow.webContents.send('update-not-available');
  }
});

autoUpdater.on('download-progress', (progress) => {
  if (mainWindow) {
    mainWindow.webContents.send('update-progress', {
      percent: Math.round(progress.percent),
    });
  }
});

autoUpdater.on('update-downloaded', () => {
  if (mainWindow) {
    mainWindow.webContents.send('update-downloaded');
  }
});

autoUpdater.on('error', (err) => {
  if (mainWindow) {
    mainWindow.webContents.send('update-error', err.message);
  }
});

// IPC handlers for updates
ipcMain.handle('update:check', async () => {
  if (IS_DEV) return { updateAvailable: false, message: 'Dev mode — updates disabled' };
  try {
    const result = await autoUpdater.checkForUpdates();
    return { updateAvailable: !!result?.updateInfo };
  } catch (err) {
    return { updateAvailable: false, error: err.message };
  }
});

ipcMain.handle('update:download', () => {
  autoUpdater.downloadUpdate();
  return true;
});

ipcMain.handle('update:install', () => {
  autoUpdater.quitAndInstall(false, true);
});

// ── Find a free port ──
function findFreePort() {
  return new Promise((resolve, reject) => {
    const server = netNode.createServer();
    server.listen(0, () => {
      const port = server.address().port;
      server.close(() => resolve(port));
    });
    server.on('error', reject);
  });
}

// ── License helpers ──
function readLicense() {
  try {
    if (fs.existsSync(LICENSE_FILE)) {
      return JSON.parse(fs.readFileSync(LICENSE_FILE, 'utf-8'));
    }
  } catch (_) {}
  return null;
}

function saveLicense(key, name, tier) {
  const data = { key, name: name || '', tier: tier || 'basic', activated_at: new Date().toISOString() };
  fs.mkdirSync(path.dirname(LICENSE_FILE), { recursive: true });
  fs.writeFileSync(LICENSE_FILE, JSON.stringify(data, null, 2));
  return data;
}

async function validateKey(key) {
  const normalizedKey = key.trim().toUpperCase();
  try {
    const resp = await net.fetch(LICENSE_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: normalizedKey, app_version: app.getVersion() }),
    });
    const data = await resp.json();
    if (data.valid === true) {
      return { valid: true, tier: data.tier || 'basic' };
    }
    return { valid: false };
  } catch (err) {
    // Offline fallback: accept if we have a saved license (trust last validation)
    console.log('License API unreachable, using offline fallback:', err.message);
    const saved = readLicense();
    if (saved && saved.key === normalizedKey) {
      return { valid: true, tier: saved.tier || 'basic' };
    }
    return { valid: false };
  }
}

// ── IPC handlers (called from preload/renderer) ──
ipcMain.handle('license:get', () => readLicense());
ipcMain.handle('license:tier', () => {
  const license = readLicense();
  return license ? (license.tier || 'basic') : 'basic';
});
ipcMain.handle('license:validate', async (_, key) => {
  const result = await validateKey(key);
  return result; // { valid, tier }
});
ipcMain.handle('license:save', (_, key, name, tier) => saveLicense(key, name, tier));
ipcMain.handle('license:clear', () => {
  try { fs.unlinkSync(LICENSE_FILE); } catch (_) {}
  return true;
});
ipcMain.handle('app:version', () => app.getVersion());
ipcMain.handle('app:port', () => serverPort);

// ── Start Express server ──
async function startServer() {
  const port = await findFreePort();
  serverPort = port;

  // Set env so server.js uses our port
  process.env.ELECTRON_PORT = String(port);
  process.env.ELECTRON_MODE = '1';

  // Require server.js — it will read ELECTRON_PORT
  require('./server.js');

  return port;
}

// ── Create window ──
function createWindow(url) {
  // Remove menu bar in production
  if (!IS_DEV) {
    Menu.setApplicationMenu(null);
  }

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 700,
    title: APP_NAME,
    backgroundColor: '#0f0f1a',
    icon: path.join(__dirname, 'public', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'electron-preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  mainWindow.loadURL(url);

  // Open DevTools in dev mode only (uncomment to debug)
  // if (IS_DEV) {
  //   mainWindow.webContents.openDevTools({ mode: 'detach' });
  // }

  // Disable right-click inspect in production
  if (!IS_DEV) {
    mainWindow.webContents.on('context-menu', (e) => e.preventDefault());
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// ── First-run setup tracking ──
const SETUP_DONE_FILE = path.join(app.getPath('userData'), 'setup-done.json');

function isSetupDone() {
  try { return fs.existsSync(SETUP_DONE_FILE); } catch { return false; }
}

function markSetupDone() {
  try {
    fs.mkdirSync(path.dirname(SETUP_DONE_FILE), { recursive: true });
    fs.writeFileSync(SETUP_DONE_FILE, JSON.stringify({ completed_at: new Date().toISOString() }));
  } catch (_) {}
}

// Quick health check — if all required deps are present, skip setup screen
async function checkDepsQuick(port) {
  try {
    const resp = await net.fetch(`http://localhost:${port}/api/setup/check`);
    const data = await resp.json();
    return data.allRequired === true;
  } catch (_) {
    return false;
  }
}

ipcMain.handle('setup:done', () => {
  markSetupDone();
  return true;
});

// ── App lifecycle ──
app.whenReady().then(async () => {
  const port = await startServer();

  // Check license
  const license = readLicense();
  if (license) {
    // If license has a tier but no key (e.g. owner/dev install), trust it
    const hasValidTier = license.tier && ['basic', 'pro', 'lifetime'].includes(license.tier);
    const result = license.key ? await validateKey(license.key) : { valid: hasValidTier, tier: license.tier };
    if (result.valid) {
      // Update stored tier from server (in case admin changed it)
      if (license.key && result.tier && result.tier !== license.tier) {
        saveLicense(license.key, license.name, result.tier);
      }
      // Skip setup screen if all required deps are already installed
      if (!isSetupDone()) {
        const depsOk = await checkDepsQuick(port);
        if (depsOk) {
          console.log('[Startup] All required deps found — skipping setup screen');
          markSetupDone();
          createWindow(`http://localhost:${port}`);
        } else {
          createWindow(`http://localhost:${port}/setup.html`);
        }
      } else {
        createWindow(`http://localhost:${port}`);
      }
    } else {
      createWindow(`http://localhost:${port}/license.html`);
    }
  } else {
    createWindow(`http://localhost:${port}/license.html`);
  }
});

app.on('window-all-closed', () => {
  app.quit();
});

app.on('activate', async () => {
  if (mainWindow === null && serverPort) {
    const license = readLicense();
    if (license) {
      const result = await validateKey(license.key);
      if (result.valid) {
        createWindow(`http://localhost:${serverPort}`);
      } else {
        createWindow(`http://localhost:${serverPort}/license.html`);
      }
    } else {
      createWindow(`http://localhost:${serverPort}/license.html`);
    }
  }
});
