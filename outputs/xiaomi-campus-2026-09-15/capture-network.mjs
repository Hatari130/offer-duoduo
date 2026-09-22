import { writeFile } from 'node:fs/promises';

const targetId = process.argv[2];
if (!targetId) throw new Error('Usage: node capture-network.mjs <targetId>');

const targets = await fetch('http://127.0.0.1:9222/json/list').then((r) => r.json());
const target = targets.find((item) => item.id === targetId);
if (!target?.webSocketDebuggerUrl) throw new Error(`Target not found: ${targetId}`);

const socket = new WebSocket(target.webSocketDebuggerUrl);
const pending = new Map();
const bodies = [];
let sequence = 0;

function call(method, params = {}) {
  const id = ++sequence;
  socket.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
}

socket.addEventListener('message', async ({ data }) => {
  const message = JSON.parse(data);
  if (message.id) {
    const handler = pending.get(message.id);
    if (handler) {
      pending.delete(message.id);
      message.error ? handler.reject(message.error) : handler.resolve(message.result);
    }
    return;
  }
  if (message.method !== 'Network.responseReceived') return;
  const { response, requestId } = message.params;
  if (!response.url.includes('/api/v1/search/job/posts')) return;
  try {
    const result = await call('Network.getResponseBody', { requestId });
    bodies.push({ url: response.url, status: response.status, body: result.body });
  } catch (error) {
    bodies.push({ url: response.url, status: response.status, error: String(error) });
  }
});

await new Promise((resolve) => socket.addEventListener('open', resolve, { once: true }));
await call('Network.enable');
await call('Page.reload', { ignoreCache: true });
await new Promise((resolve) => setTimeout(resolve, 6000));
await writeFile('raw-network-pages.json', JSON.stringify(bodies, null, 2));
console.log(JSON.stringify(bodies.map(({ url, status, body, error }) => ({ url, status, bytes: body?.length ?? 0, error }))));
socket.close();
