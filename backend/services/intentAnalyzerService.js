import { spawn, execFile } from 'child_process';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const BACKEND_DIR = path.join(__dirname, '..');
const INTENT_PY_PATH = path.join(BACKEND_DIR, 'intent_analyzer.py');

let workerProcess = null;
let pendingQueue = [];

function getWorker() {
  if (workerProcess && !workerProcess.killed && workerProcess.exitCode === null) {
    return workerProcess;
  }

  const env = {
    ...process.env,
    HF_TOKEN: process.env.HF_TOKEN || '',
    PYTHONUNBUFFERED: '1',
    TQDM_DISABLE: '1'
  };

  workerProcess = spawn('python', [INTENT_PY_PATH, '--daemon'], {
    cwd: BACKEND_DIR,
    env: env
  });

  let buffer = '';

  workerProcess.stdout.on('data', (data) => {
    buffer += data.toString();
    const lines = buffer.split('\n');
    buffer = lines.pop(); // keep last incomplete line segment in buffer

    for (const line of lines) {
      if (!line.trim()) continue;
      if (pendingQueue.length > 0) {
        const { resolve } = pendingQueue.shift();
        try {
          const parsed = JSON.parse(line);
          resolve(parsed);
        } catch (e) {
          resolve({
            success: false,
            error: 'Failed to parse intent worker output: ' + e.message
          });
        }
      }
    }
  });

  workerProcess.stderr.on('data', (data) => {
    const errText = data.toString().trim();
    if (errText) {
      console.warn('[INTENT WORKER LOG]:', errText);
    }
  });

  workerProcess.on('exit', () => {
    workerProcess = null;
    while (pendingQueue.length > 0) {
      const { reject } = pendingQueue.shift();
      reject(new Error('Intent analyzer worker process exited.'));
    }
  });

  return workerProcess;
}

export function analyzeIntent(audioPath, context = {}) {
  return new Promise((resolve, reject) => {
    try {
      const worker = getWorker();
      pendingQueue.push({ resolve, reject });

      const payload = {
        file: audioPath,
        context: context
      };

      worker.stdin.write(JSON.stringify(payload) + '\n');
    } catch (err) {
      reject(err);
    }
  });
}

export function runIntentOneShot(audioPath, context = {}) {
  return new Promise((resolve) => {
    const env = {
      ...process.env,
      HF_TOKEN: process.env.HF_TOKEN || '',
      PYTHONUNBUFFERED: '1',
      TQDM_DISABLE: '1'
    };

    const cmdArgs = [
      INTENT_PY_PATH,
      '--file', audioPath,
      '--caller_id', context.callerId || 'Inbound Caller',
      '--role', context.claimedRole || 'Standard Caller',
      '--channel', context.callChannel || 'External Channel',
      '--amount', String(context.transactionAmount || 0)
    ];

    execFile('python', cmdArgs, { cwd: BACKEND_DIR, env: env, maxBuffer: 10 * 1024 * 1024 }, (err, stdout) => {
      if (!stdout) {
        return resolve({
          success: false,
          error: 'Intent analysis failed to produce output.'
        });
      }

      try {
        const jsonMatch = stdout.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
          return resolve({
            success: false,
            error: 'Invalid JSON returned by intent analyzer.'
          });
        }
        const result = JSON.parse(jsonMatch[0]);
        resolve(result);
      } catch (parseErr) {
        resolve({
          success: false,
          error: 'Failed to parse intent output JSON.'
        });
      }
    });
  });
}
