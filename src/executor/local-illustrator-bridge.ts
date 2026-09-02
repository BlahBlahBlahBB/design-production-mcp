import type { IllustratorBridge, IllustratorStatus, ScriptResult } from "./bridge.js";
import { SerializedJsxTransport } from "./local-transport.js";

interface DetectPayload {
  name: string;
  version: string;
  documents: number;
}

export class LocalIllustratorBridge implements IllustratorBridge {
  readonly id = "local-extendscript";

  constructor(private readonly transport = new SerializedJsxTransport()) {}

  async detect(): Promise<IllustratorStatus> {
    const probe = await this.execute<DetectPayload>(
      "return {name: app.name, version: app.version, documents: app.documents.length};",
      10_000,
    );

    if (!probe.ok || !probe.value) {
      return {
        installed: false,
        running: false,
        capabilities: {
          status: false,
          "document.read": false,
          "text.read": false,
          "text.write": false,
          "save.copy": false,
          "export.pdf": false,
          "export.png": false,
        },
      };
    }

    return {
      installed: true,
      running: true,
      version: probe.value.version,
      capabilities: {
        status: true,
        "document.read": true,
        "text.read": true,
        "text.write": true,
        "save.copy": true,
        "export.pdf": true,
        "export.png": true,
      },
    };
  }

  async execute<T = unknown>(script: string, timeoutMs = 30_000): Promise<ScriptResult<T>> {
    const result = await this.transport.execute<T>(script, { timeoutMs });
    if (result.ok) return { ok: true, value: result.value };
    return {
      ok: false,
      error: result.error ? `${result.error.code}: ${result.error.message}` : "ILLUSTRATOR_EXECUTION_FAILED",
    };
  }

  async getDocumentSummary(): Promise<ScriptResult<unknown>> {
    return this.execute(`
      if (app.documents.length === 0) throw new Error('NO_DOCUMENT');
      var d = app.activeDocument;
      var fullPath = null;
      try { fullPath = d.fullName.fsName; } catch (_e) { fullPath = null; }
      return {
        name: d.name,
        path: fullPath,
        saved: d.saved,
        colorSpace: String(d.documentColorSpace),
        artboards: d.artboards.length,
        textFrames: d.textFrames.length,
        layers: d.layers.length
      };
    `);
  }

  async listTextFrames(): Promise<ScriptResult<unknown>> {
    return this.execute(`
      if (app.documents.length === 0) throw new Error('NO_DOCUMENT');
      var d = app.activeDocument;
      var out = [];
      for (var i = 0; i < d.textFrames.length; i++) {
        var t = d.textFrames[i];
        out.push({
          index: i,
          name: t.name || '',
          contents: t.contents,
          locked: t.locked,
          hidden: t.hidden,
          typename: t.typename
        });
      }
      return out;
    `);
  }
}
