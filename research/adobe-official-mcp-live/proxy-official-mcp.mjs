#!/usr/bin/env node
import http from 'node:http';
import { mkdir, appendFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outputDir = path.join(__dirname, 'output');
const tracePath = path.join(outputDir, 'official-call-trace.jsonl');
const summaryPath = path.join(outputDir, 'official-performance-summary.json');
const toolsPath = path.join(outputDir, 'official-tools.json');
const serverInfoPath = path.join(outputDir, 'official-server-info.json');

const upstream = new URL(process.env.ILLUSTRATOR_OFFICIAL_MCP_URL || 'http://localhost:18412/v1/mcp');
const listenHost = process.env.OFFICIAL_MCP_PROXY_HOST || '127.0.0.1';
const listenPort = Number(process.env.OFFICIAL_MCP_PROXY_PORT || 18413);
const MAX_CAPTURE_BYTES = Number(process.env.OFFICIAL_MCP_PROXY_CAPTURE_BYTES || 8 * 1024 * 1024);

await mkdir(outputDir, { recursive: true });

const stats = {
  startedAt: new Date().toISOString(),
  upstream: upstream.toString(),
  proxy: `http://${listenHost}:${listenPort}${upstream.pathname}`,
  totalRequests: 0,
  completedRequests: 0,
  failedRequests: 0,
  methods: {},
  tools: {},
};

function nowIso() {
  return new Date().toISOString();
}

function safeShape(value, depth = 0) {
  if (depth > 6) return { type: 'max-depth' };
  if (value === null) return { type: 'null' };
  if (Array.isArray(value)) {
    return {
      type: 'array',
      length: value.length,
      itemShapes: value.slice(0, 5).map((item) => safeShape(item, depth + 1)),
    };
  }
  const type = typeof value;
  if (type === 'object') {
    const entries = {};
    for (const [key, child] of Object.entries(value)) {
      entries[key] = safeShape(child, depth + 1);
    }
    return { type: 'object', keys: entries };
  }
  return { type };
}

function redactHeaders(headers) {
  const out = {};
  for (const [key, value] of Object.entries(headers)) {
    const lower = key.toLowerCase();
    if (lower === 'authorization' || lower.includes('token') || lower.includes('secret') || lower.includes('key')) {
      out[key] = '<redacted>';
    } else {
      out[key] = value;
    }
  }
  return out;
}

function normalizeMessages(payload) {
  if (Array.isArray(payload)) return payload;
  return payload && typeof payload === 'object' ? [payload] : [];
}

function summarizeRequestBody(body) {
  if (!body || body.length === 0) return [];
  try {
    const payload = JSON.parse(body.toString('utf8'));
    return normalizeMessages(payload).map((msg) => ({
      jsonrpc: msg.jsonrpc,
      id: msg.id ?? null,
      method: msg.method ?? null,
      tool: msg.method === 'tools/call' ? msg.params?.name ?? null : null,
      paramsShape: safeShape(msg.params),
      argumentShape: msg.method === 'tools/call' ? safeShape(msg.params?.arguments) : undefined,
    }));
  } catch {
    return [{ parseError: true, bytes: body.length }];
  }
}

function parseResponsePayload(buffer, contentType) {
  if (!buffer || buffer.length === 0) return [];
  const text = buffer.toString('utf8');

  if ((contentType || '').includes('text/event-stream')) {
    const messages = [];
    for (const line of text.split(/\r?\n/)) {
      if (!line.startsWith('data:')) continue;
      const data = line.slice(5).trim();
      if (!data || data === '[DONE]') continue;
      try {
        messages.push(JSON.parse(data));
      } catch {}
    }
    return messages;
  }

  try {
    return normalizeMessages(JSON.parse(text));
  } catch {
    return [];
  }
}

async function logTrace(entry) {
  await appendFile(tracePath, JSON.stringify(entry) + '\n', 'utf8');
}

function bump(map, key) {
  const name = key || '<unknown>';
  map[name] = (map[name] || 0) + 1;
}

async function writeSummary() {
  await writeFile(
    summaryPath,
    JSON.stringify(
      {
        ...stats,
        updatedAt: nowIso(),
      },
      null,
      2,
    ) + '\n',
    'utf8',
  );
}

async function captureProtocolMetadata(requestMessages, responseMessages) {
  const requestById = new Map();
  for (const req of requestMessages) {
    if (req && req.id !== null && req.id !== undefined) requestById.set(String(req.id), req);
  }

  for (const response of responseMessages) {
    if (!response || typeof response !== 'object') continue;
    const req = response.id !== null && response.id !== undefined ? requestById.get(String(response.id)) : null;
    if (!req || !response.result) continue;

    if (req.method === 'initialize') {
      const result = response.result;
      const safe = {
        capturedAt: nowIso(),
        protocolVersion: result.protocolVersion ?? null,
        serverInfo: result.serverInfo ?? null,
        capabilities: result.capabilities ?? null,
        instructions: result.instructions ?? null,
      };
      await writeFile(serverInfoPath, JSON.stringify(safe, null, 2) + '\n', 'utf8');
    }

    if (req.method === 'tools/list' && Array.isArray(response.result.tools)) {
      const safe = {
        capturedAt: nowIso(),
        toolCount: response.result.tools.length,
        tools: response.result.tools,
      };
      await writeFile(toolsPath, JSON.stringify(safe, null, 2) + '\n', 'utf8');
    }
  }
}

function filteredRequestHeaders(headers, bodyLength) {
  const next = { ...headers, host: upstream.host };
  delete next.connection;
  delete next['proxy-connection'];
  delete next['transfer-encoding'];
  delete next['content-length'];
  if (bodyLength > 0) next['content-length'] = String(bodyLength);
  return next;
}

function filteredResponseHeaders(headers) {
  const next = { ...headers };
  delete next.connection;
  delete next['proxy-connection'];
  delete next['transfer-encoding'];
  return next;
}

const server = http.createServer((req, res) => {
  const started = performance.now();
  const chunks = [];

  req.on('data', (chunk) => chunks.push(chunk));
  req.on('end', async () => {
    const requestBody = Buffer.concat(chunks);
    const requestMessages = summarizeRequestBody(requestBody);
    const requestId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;

    stats.totalRequests += 1;
    for (const message of requestMessages) {
      if (message.method) bump(stats.methods, message.method);
      if (message.tool) bump(stats.tools, message.tool);
    }

    await logTrace({
      ts: nowIso(),
      event: 'request',
      requestId,
      httpMethod: req.method,
      url: req.url,
      headers: redactHeaders(req.headers),
      messages: requestMessages,
    });

    const upstreamReq = http.request(
      {
        protocol: upstream.protocol,
        hostname: upstream.hostname,
        port: upstream.port,
        method: req.method,
        path: req.url || upstream.pathname,
        headers: filteredRequestHeaders(req.headers, requestBody.length),
      },
      (upstreamRes) => {
        res.writeHead(upstreamRes.statusCode || 502, filteredResponseHeaders(upstreamRes.headers));

        let capturedBytes = 0;
        const responseChunks = [];
        let totalResponseBytes = 0;

        upstreamRes.on('data', (chunk) => {
          totalResponseBytes += chunk.length;
          if (capturedBytes < MAX_CAPTURE_BYTES) {
            const remaining = MAX_CAPTURE_BYTES - capturedBytes;
            const slice = chunk.length <= remaining ? chunk : chunk.subarray(0, remaining);
            responseChunks.push(slice);
            capturedBytes += slice.length;
          }
          res.write(chunk);
        });

        upstreamRes.on('end', async () => {
          res.end();
          const durationMs = Math.round((performance.now() - started) * 10) / 10;
          const responseBody = Buffer.concat(responseChunks);
          const contentType = String(upstreamRes.headers['content-type'] || '');
          const responseMessages = parseResponsePayload(responseBody, contentType);

          stats.completedRequests += 1;

          await captureProtocolMetadata(requestMessages, responseMessages);
          await logTrace({
            ts: nowIso(),
            event: 'response',
            requestId,
            statusCode: upstreamRes.statusCode || null,
            contentType,
            durationMs,
            responseBytes: totalResponseBytes,
            capturedBytes,
            truncated: totalResponseBytes > capturedBytes,
            responseShape: safeShape(responseMessages),
          });
          await writeSummary();
        });
      },
    );

    upstreamReq.on('error', async (error) => {
      stats.failedRequests += 1;
      const durationMs = Math.round((performance.now() - started) * 10) / 10;
      await logTrace({
        ts: nowIso(),
        event: 'upstream-error',
        requestId,
        durationMs,
        error: error.message,
      });
      await writeSummary();
      if (!res.headersSent) res.writeHead(502, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'Adobe Illustrator MCP upstream unavailable' }));
    });

    if (requestBody.length > 0) upstreamReq.write(requestBody);
    upstreamReq.end();
  });
});

server.listen(listenPort, listenHost, async () => {
  await writeSummary();
  console.log('Adobe Illustrator official MCP research proxy is running.');
  console.log(`Proxy:    http://${listenHost}:${listenPort}${upstream.pathname}`);
  console.log(`Upstream: ${upstream.toString()}`);
  console.log('');
  console.log('Temporarily point the Codex Adobe Illustrator MCP URL to the Proxy URL.');
  console.log('Keep the same Authorization header. Secrets are redacted from trace logs.');
  console.log('');
  console.log(`Trace:   ${tracePath}`);
  console.log(`Summary: ${summaryPath}`);
  console.log('Press Ctrl+C when the comparison test is finished.');
});

async function shutdown(signal) {
  console.log(`\nReceived ${signal}. Writing final summary...`);
  await writeSummary();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 1500).unref();
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
