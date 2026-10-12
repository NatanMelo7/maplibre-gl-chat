import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { completeWithProvider } from './src/server/provider-adapters.js';

const root = fileURLToPath(new URL('.', import.meta.url));
try { process.loadEnvFile(resolve(root, '.env')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
const port = Number(process.env.PORT || 3001);
const productionMode = process.argv.includes('--serve-dist');

function json(response, status, data) {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
  response.end(JSON.stringify(data));
}

async function readBody(request) {
  let bytes = 0;
  const chunks = [];
  for await (const chunk of request) {
    bytes += chunk.length;
    if (bytes > 64 * 1024) throw Object.assign(new Error('Request is too large.'), { status: 413 });
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw Object.assign(new Error('Request body must be valid JSON.'), { status: 400 }); }
}

function validateRequest(body) {
  if (!body || typeof body !== 'object') throw Object.assign(new Error('Request must be a JSON object.'), { status: 400 });
  if (body.model !== undefined && (typeof body.model !== 'string' || body.model.length > 120)) throw Object.assign(new Error('Model must be a string under 120 characters.'), { status: 400 });
  if (typeof body.systemPrompt !== 'string' || body.systemPrompt.length > 8000) throw Object.assign(new Error('System prompt must be a string under 8000 characters.'), { status: 400 });
  if (!Array.isArray(body.messages) || body.messages.length < 1 || body.messages.length > 30) throw Object.assign(new Error('Conversation must contain between 1 and 30 messages.'), { status: 400 });
  const messages = body.messages.map((message) => {
    if (!message || !['user', 'assistant', 'tool'].includes(message.role)) throw Object.assign(new Error('Conversation contains an invalid message.'), { status: 400 });
    if (message.role === 'tool') {
      if (typeof message.name !== 'string' || typeof message.toolCallId !== 'string' || typeof message.content !== 'string' || message.content.length > 5000) throw Object.assign(new Error('Tool result is invalid.'), { status: 400 });
      return { role: 'tool', name: message.name.slice(0, 100), toolCallId: message.toolCallId.slice(0, 160), content: message.content };
    }
    if (typeof message.content !== 'string' || message.content.length > 5000) throw Object.assign(new Error('Conversation contains an invalid message.'), { status: 400 });
    const clean = { role: message.role, content: message.content };
    if (message.role === 'assistant' && message.toolCalls !== undefined) {
      if (!Array.isArray(message.toolCalls) || message.toolCalls.length > 8) throw Object.assign(new Error('Tool calls are invalid.'), { status: 400 });
      clean.toolCalls = message.toolCalls.map((call) => {
        if (!call || typeof call.id !== 'string' || typeof call.name !== 'string' || call.name.length > 100) throw Object.assign(new Error('Tool call is invalid.'), { status: 400 });
        const cleanCall = { id: call.id.slice(0, 160), name: call.name, arguments: typeof call.arguments === 'string' ? call.arguments.slice(0, 12000) : call.arguments };
        if (call.providerData?.thoughtSignature && typeof call.providerData.thoughtSignature === 'string') cleanCall.providerData = { thoughtSignature: call.providerData.thoughtSignature.slice(0, 8000) };
        return cleanCall;
      });
    }
    return clean;
  });
  const tools = body.tools;
  if (!Array.isArray(tools) || tools.length > 40) throw Object.assign(new Error('Tools must be an array with at most 40 definitions.'), { status: 400 });
  const definitions = tools.map((tool) => {
    if (!tool || typeof tool.name !== 'string' || !/^[a-zA-Z0-9_-]{1,64}$/.test(tool.name) || typeof tool.description !== 'string' || !tool.parameters || tool.parameters.type !== 'object') throw Object.assign(new Error('Tool definition is invalid.'), { status: 400 });
    return { name: tool.name, description: tool.description.slice(0, 1500), parameters: tool.parameters };
  });
  return { model: body.model, systemPrompt: body.systemPrompt, messages, tools: definitions };
}

async function serveStatic(request, response) {
  const dist = resolve(root, 'dist');
  try { await stat(dist); } catch { json(response, 503, { error: 'Production files are missing. Run npm run build first.' }); return; }
  let pathname;
  try { pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname); }
  catch { json(response, 400, { error: 'Invalid URL.' }); return; }
  const path = resolve(dist, pathname === '/' ? 'index.html' : pathname.slice(1));
  if (!path.startsWith(`${dist}${sep}`) && path !== dist) { json(response, 403, { error: 'Forbidden.' }); return; }
  try {
    const data = await readFile(path);
    const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' };
    response.writeHead(200, { 'content-type': types[extname(path)] || 'application/octet-stream', 'x-content-type-options': 'nosniff' });
    response.end(data);
  } catch {
    if (!extname(path)) {
      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      response.end(await readFile(resolve(dist, 'index.html')));
    } else json(response, 404, { error: 'Not found.' });
  }
}

const server = createServer(async (request, response) => {
  const pathname = new URL(request.url, 'http://localhost').pathname;
  if (pathname === '/api/llm') {
    if (request.method !== 'POST') { json(response, 405, { error: 'Method not allowed.' }); return; }
    try { json(response, 200, await completeWithProvider(validateRequest(await readBody(request)))); }
    catch (error) { json(response, error.status || 500, { error: error.message || 'Unexpected server error.' }); }
    return;
  }
  if (productionMode && request.method === 'GET') { await serveStatic(request, response); return; }
  json(response, 404, { error: 'Not found.' });
});

server.listen(port, '127.0.0.1', () => {
  console.log(`MapLibre Chat Tools API listening at http://127.0.0.1:${port}`);
  if (productionMode) console.log('Serving production files from dist/.');
  else console.log('Configure an LLM API key in .env to enable chat.');
});
