const { spawn } = require('node:child_process');
const http = require('node:http');

console.log('🚀 Starting Worshipy in Desktop Development mode...');

function checkServer(port) {
  return new Promise((resolve) => {
    const req = http.get(`http://127.0.0.1:${port}`, (res) => {
      resolve(true);
    });
    req.on('error', () => resolve(false));
    req.setTimeout(1000, () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function start() {
  const isAlreadyRunning = await checkServer(3000);
  let devProcess = null;

  if (!isAlreadyRunning) {
    console.log('📦 Launching Next.js dev server on http://localhost:3000...');
    devProcess = spawn('npx', ['next', 'dev', '-H', '127.0.0.1', '-p', '3000'], {
      stdio: 'inherit',
      shell: true,
      env: { ...process.env, NODE_ENV: 'development' },
    });

    // Wait until server is responding
    let ready = false;
    for (let i = 0; i < 40; i++) {
      await new Promise((r) => setTimeout(r, 500));
      if (await checkServer(3000)) {
        ready = true;
        break;
      }
    }

    if (!ready) {
      console.error('❌ Failed to connect to Next.js dev server.');
      if (devProcess) devProcess.kill();
      process.exit(1);
    }
  } else {
    console.log('✓ Found running local dev server on http://localhost:3000.');
  }

  console.log('🖥️ Launching Electron desktop window...');
  const electronProcess = spawn('npx', ['electron', '.'], {
    stdio: 'inherit',
    shell: true,
    env: { ...process.env, NODE_ENV: 'development' },
  });

  electronProcess.on('exit', (code) => {
    console.log(`Desktop window closed with code ${code}.`);
    if (devProcess) devProcess.kill();
    process.exit(code || 0);
  });
}

start().catch((err) => {
  console.error('Fatal error starting dev desktop:', err);
  process.exit(1);
});
