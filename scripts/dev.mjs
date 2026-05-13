import { spawn } from 'node:child_process';
import process from 'node:process';
import net from 'node:net';

const isWin = process.platform === 'win32';
const children = [];

function probePort(port, host) {
  return new Promise((resolve) => {
    const socket = new net.Socket();

    const done = (value) => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(value);
    };

    socket.setTimeout(500);
    socket.once('connect', () => done(true));
    socket.once('timeout', () => done(false));
    socket.once('error', (error) => {
      if (error?.code === 'ECONNREFUSED' || error?.code === 'EHOSTUNREACH' || error?.code === 'ENETUNREACH') {
        done(false);
        return;
      }
      done(true);
    });

    socket.connect(port, host);
  });
}

async function checkPortInUse(port) {
  const ipv4 = await probePort(port, '127.0.0.1');
  if (ipv4) return true;
  const ipv6 = await probePort(port, '::1');
  return ipv6;
}

function run(name, command, args, env = {}, options = {}) {
  const child = spawn(command, args, {
    stdio: 'pipe',
    shell: false,
    env: { ...process.env, ...env },
    ...options
  });

  const prefix = `[${name}]`;
  child.stdout.on('data', (data) => process.stdout.write(`${prefix} ${data}`));
  child.stderr.on('data', (data) => process.stderr.write(`${prefix} ${data}`));
  child.on('exit', (code, signal) => {
    const detail = signal ? `signal ${signal}` : `code ${code}`;
    process.stdout.write(`${prefix} exited with ${detail}\n`);
    shutdown(child, code ?? 0);
  });

  children.push(child);
  return child;
}

let shuttingDown = false;
function shutdown(exitingChild, exitCode = 0) {
  if (shuttingDown) return;
  shuttingDown = true;

  for (const child of children) {
    if (child !== exitingChild && !child.killed) {
      try {
        child.kill('SIGTERM');
      } catch {}
    }
  }

  setTimeout(() => {
    for (const child of children) {
      if (child !== exitingChild && !child.killed) {
        try {
          child.kill('SIGKILL');
        } catch {}
      }
    }
    process.exit(exitCode);
  }, 500);
}

process.on('SIGINT', () => shutdown(null, 0));
process.on('SIGTERM', () => shutdown(null, 0));

const serverPort = Number(process.env.PORT || 8787);
const portInUse = await checkPortInUse(serverPort);

if (portInUse) {
  process.stdout.write(`[dev] Port ${serverPort} is already in use; reusing existing API server.\n`);
} else {
  run('server', 'node', ['server/index.js']);
}

if (process.env.npm_execpath) {
  run('client', process.execPath, [process.env.npm_execpath, 'run', 'client']);
} else {
  run('client', 'npm', ['run', 'client'], {}, { shell: isWin });
}
