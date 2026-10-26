const { app, BrowserWindow, utilityProcess, session, Menu } = require('electron');
const path = require('node:path');
const http = require('node:http');
const net = require('node:net');

const isDev = !app.isPackaged && process.env.NODE_ENV !== 'production';

let mainWindow = null;
let serverProcess = null;
let serverPort = 3000;

// Find an available local TCP port
function getFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, '127.0.0.1', () => {
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
  serverPort = await getFreePort();
  const standaloneServerPath = path.join(app.getAppPath(), '.next/standalone/server.js');

  serverProcess = utilityProcess.fork(standaloneServerPath, [], {
    env: {
      ...process.env,
      PORT: String(serverPort),
      HOSTNAME: '127.0.0.1',
      NODE_ENV: 'production',
    },
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

  // Enable microphone permissions for Tuner and Practice recording
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    if (permission === 'media') {
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
    mainWindow.show();
  });

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
