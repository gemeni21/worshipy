const { app, BrowserWindow, utilityProcess, session, Menu, dialog } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const http = require('node:http');
const net = require('node:net');

const isDev = !app.isPackaged && process.env.NODE_ENV !== 'production';

let mainWindow = null;
let serverProcess = null;
let serverPort = 3000;
const serverLogs = [];

// Check if a specific TCP port is currently free
function isPortAvailable(port) {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.once('error', () => resolve(false));
    srv.once('listening', () => {
      srv.close(() => resolve(true));
    });
    srv.listen(port, '0.0.0.0');
  });
}

// Find an available local TCP port, preferring standard ports
async function findBestPort() {
  const preferred = [3000, 3001, 3333, 4000, 8080];
  for (const p of preferred) {
    if (await isPortAvailable(p)) {
      return p;
    }
  }
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, '0.0.0.0', () => {
      const port = srv.address().port;
      srv.close((err) => {
        if (err) reject(err);
        else resolve(port);
      });
    });
  });
}

// Poll server until ready
function waitForServer(port, maxRetries = 40) {
  return new Promise((resolve, reject) => {
    let retries = 0;
    const check = () => {
      const req = http.get(`http://127.0.0.1:${port}`, (res) => {
        if (res.statusCode && res.statusCode < 500) {
          resolve(true);
        } else {
          retry();
        }
      });
      req.on('error', () => {
        retry();
      });
    };

    const retry = () => {
      retries++;
      if (retries >= maxRetries) {
        reject(new Error(`Timed out waiting for internal server on port ${port}`));
      } else {
        setTimeout(check, 250);
      }
    };

    check();
  });
}

async function startServer() {
  if (isDev) {
    // In dev mode, assume next dev server is running on port 3000
    serverPort = 3000;
    return `http://localhost:${serverPort}`;
  }

  // Production: launch Next.js standalone server
  serverPort = await findBestPort();
  const standaloneServerPath = path.join(app.getAppPath(), '.next/standalone/server.js');

  if (!fs.existsSync(standaloneServerPath)) {
    throw new Error(`Standalone Next.js server not found at: ${standaloneServerPath}`);
  }

  const userDataDir = app.getPath('userData');
  console.log(`Starting Next.js standalone server on port ${serverPort}...`);
  console.log(`Server path: ${standaloneServerPath}`);
  console.log(`User data dir: ${userDataDir}`);

  serverProcess = utilityProcess.fork(standaloneServerPath, [], {
    env: {
      ...process.env,
      PORT: String(serverPort),
      HOSTNAME: '0.0.0.0',
      NODE_ENV: 'production',
      WORSHIPY_USER_DATA: userDataDir,
    },
    stdio: 'pipe',
  });

  serverProcess.stdout?.on('data', (data) => {
    const text = data.toString();
    serverLogs.push(text);
    if (serverLogs.length > 40) serverLogs.shift();
    process.stdout.write(`[Next.js] ${text}`);
  });

  serverProcess.stderr?.on('data', (data) => {
    const text = data.toString();
    serverLogs.push(text);
    if (serverLogs.length > 40) serverLogs.shift();
    process.stderr.write(`[Next.js ERR] ${text}`);
  });

  serverProcess.on('exit', (code) => {
    console.log(`Standalone Next.js server exited with code ${code}`);
  });

  await waitForServer(serverPort);
  return `http://127.0.0.1:${serverPort}`;
}

async function createWindow(url) {
  mainWindow = new BrowserWindow({
    width: 1360,
    height: 900,
    minWidth: 900,
    minHeight: 620,
    title: 'Worshipy',
    backgroundColor: '#0c0c0e',
    show: false,
    icon: path.join(__dirname, '../build/icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
    },
  });

  // Enable microphone permissions for Tuner & Practice recording, and clipboard for Live Sync codes
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    if (
      permission === 'media' ||
      permission === 'clipboard-sanitized-write' ||
      permission === 'clipboard-read' ||
      permission === 'clipboard'
    ) {
      callback(true);
      return;
    }
    callback(false);
  });

  // Native application menu
  const menuTemplate = [
    {
      label: 'File',
      submenu: [{ role: 'quit' }],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'About Worshipy',
          click: async () => {
            const { dialog } = require('electron');
            dialog.showMessageBox(mainWindow, {
              type: 'info',
              title: 'About Worshipy',
              message: 'Worshipy Desktop',
              detail: 'Version 0.1.0\nModern Worship Music Companion & Live Rehearsal Tool',
            });
          },
        },
      ],
    },
  ];

  const menu = Menu.buildFromTemplate(menuTemplate);
  Menu.setApplicationMenu(menu);

  await mainWindow.loadURL(url);

  mainWindow.once('ready-to-show', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.show();
    }
  });

  // Failsafe: Ensure window is shown even if ready-to-show event is delayed
  setTimeout(() => {
    if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.isVisible()) {
      mainWindow.show();
    }
  }, 2500);

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(async () => {
  try {
    const url = await startServer();
    await createWindow(url);
  } catch (err) {
    console.error('Failed to initialize desktop application:', err);
    try {
      const recentLogs = serverLogs.length > 0 ? `\n\nRecent Server Logs:\n${serverLogs.join('')}` : '';
      dialog.showErrorBox(
        'Worshipy Startup Error',
        `Failed to launch internal engine:\n\n${err.message || err}${recentLogs}`
      );
    } catch {}
    app.quit();
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0 && mainWindow === null) {
      startServer().then((url) => createWindow(url));
    }
  });
});

app.on('before-quit', () => {
  if (serverProcess) {
    try {
      serverProcess.kill();
    } catch {}
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
