#!/usr/bin/env node
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outputDir = path.join(__dirname, 'output');
const toolsPath = path.join(outputDir, 'official-tools.json');
const serverInfoPath = path.join(outputDir, 'official-server-info.json');

const url = process.env.ILLUSTRATOR_OFFICIAL_MCP_URL || 'http://localhost:18412/v1/mcp';
const token = process.env.ADOBE_ILLUSTRATOR_MCP_BEARER_TOKEN;

if (!token) {
  console.error('Missing ADOBE_ILLUSTRATOR_MCP_BEARER_TOKEN.');
  console.error('Copy the current Illustrator Beta MCP key into that environment variable, then run again.');
  process.exit(1);
}

await mkdir(outputDir, { recursive: true });

const client = new Client(
  { name: 'design-production-mcp-research', version: '0.1.0' },
  { capabilities: {} },
);

const transport = new StreamableHTTPClientTransport(new URL(url), {
  requestInit: {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  },
});

try {
  await client.connect(transport);

  const tools = [];
  let cursor;
  do {
    const page = await client.listTools(cursor ? { cursor } : undefined);
    tools.push(...page.tools);
    cursor = page.nextCursor;
  } while (cursor);

  const serverVersion =
    typeof client.getServerVersion === 'function'
      ? client.getServerVersion()
      : null;

  await writeFile(
    serverInfoPath,
    JSON.stringify(
      {
        capturedAt: new Date().toISOString(),
        url,
        serverInfo: serverVersion,
      },
      null,
      2,
    ) + '\n',
    'utf8',
  );

  await writeFile(
    toolsPath,
    JSON.stringify(
      {
        capturedAt: new Date().toISOString(),
        toolCount: tools.length,
        tools,
      },
      null,
      2,
    ) + '\n',
    'utf8',
  );

  console.log(`Captured ${tools.length} official Illustrator MCP tools.`);
  console.log(`Tools: ${toolsPath}`);
  console.log(`Server: ${serverInfoPath}`);
} finally {
  await client.close();
}
