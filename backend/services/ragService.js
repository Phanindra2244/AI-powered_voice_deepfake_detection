import { spawn, execFile } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const BACKEND_DIR = path.join(__dirname, '..');
const RAG_PY_PATH = path.join(BACKEND_DIR, 'rag_engine.py');

let workerProcess = null;
let pendingQueue = [];

function getWorker() {
  if (workerProcess && !workerProcess.killed && workerProcess.exitCode === null) {
    return workerProcess;
  }

  const env = {
    ...process.env,
    PYTHONUNBUFFERED: '1',
    TQDM_DISABLE: '1'
  };

  workerProcess = spawn('python', [RAG_PY_PATH, '--daemon'], {
    cwd: BACKEND_DIR,
    env: env
  });

  let buffer = '';

  workerProcess.stdout.on('data', (data) => {
    buffer += data.toString();
    const lines = buffer.split('\n');
    buffer = lines.pop(); // keep last incomplete chunk

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
            answer: 'Failed to parse RAG worker output.',
            citations: []
          });
        }
      }
    }
  });

  workerProcess.stderr.on('data', (data) => {
    const errText = data.toString().trim();
    if (errText) {
      console.warn('[RAG WORKER LOG]:', errText);
    }
  });

  workerProcess.on('exit', () => {
    workerProcess = null;
    while (pendingQueue.length > 0) {
      const { reject } = pendingQueue.shift();
      reject(new Error('RAG worker process exited.'));
    }
  });

  return workerProcess;
}

export function queryRAGKnowledgeBase(queryText) {
  return new Promise((resolve, reject) => {
    try {
      const worker = getWorker();
      pendingQueue.push({ resolve, reject });

      const payload = { query: queryText };
      worker.stdin.write(JSON.stringify(payload) + '\n');
    } catch (err) {
      runRAGOneShot(queryText).then(resolve).catch(reject);
    }
  });
}

export function runRAGOneShot(queryText) {
  return new Promise((resolve) => {
    const cmdArgs = [RAG_PY_PATH, '--query', queryText];
    execFile('python', cmdArgs, { cwd: BACKEND_DIR, maxBuffer: 10 * 1024 * 1024 }, (err, stdout) => {
      if (!stdout) {
        return resolve({
          success: true,
          answer: 'I do not have sufficient verified information in my knowledge base to answer this.',
          retrieved_context: [],
          citations: []
        });
      }

      try {
        const jsonMatch = stdout.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
          throw new Error('Invalid JSON returned by RAG engine.');
        }
        const result = JSON.parse(jsonMatch[0]);
        resolve(result);
      } catch (parseErr) {
        resolve({
          success: true,
          answer: 'I do not have sufficient verified information in my knowledge base to answer this.',
          retrieved_context: [],
          citations: []
        });
      }
    });
  });
}

export function triggerIngestKnowledgeBase() {
  return new Promise((resolve) => {
    const cmdArgs = [RAG_PY_PATH, '--ingest'];
    execFile('python', cmdArgs, { cwd: BACKEND_DIR }, (err, stdout) => {
      try {
        const result = JSON.parse(stdout);
        resolve(result);
      } catch (e) {
        resolve({ success: false, error: 'Ingestion failed.' });
      }
    });
  });
}
