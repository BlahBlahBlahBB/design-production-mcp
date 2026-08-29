import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export type LocalTransport = "osascript" | "powershell";

export interface ExecuteOptions {
  timeoutMs?: number;
  activate?: boolean;
  appPath?: string;
}

export interface TransportResult<T = unknown> {
  ok: boolean;
  value?: T;
  error?: {
    code: string;
    message: string;
  };
}

const DEFAULT_TIMEOUT_MS = 30_000;

export function resolveLocalTransport(platform = process.platform): LocalTransport {
  if (platform === "darwin") return "osascript";
  if (platform === "win32") return "powershell";
  throw new Error(`Unsupported platform: ${platform}`);
}

function execFileAsync(command: string, args: string[], timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile(command, args, { timeout: timeoutMs }, (error, _stdout, stderr) => {
      if (!error) return resolve();
      const message = stderr?.trim() || error.message;
      const wrapped = new Error(message) as Error & { code?: string };
      wrapped.code = typeof error.code === "string" ? error.code : undefined;
      reject(wrapped);
    });
  });
}

function classifyFailure(message: string): { code: string; message: string } {
  const lower = message.toLowerCase();
  if (lower.includes("timed out") || lower.includes("etimedout")) {
    return { code: "ILLUSTRATOR_TIMEOUT", message };
  }
  if (lower.includes("not authorized") || lower.includes("not permitted") || lower.includes("automation")) {
    return { code: "ILLUSTRATOR_PERMISSION_DENIED", message };
  }
  if (lower.includes("connection is invalid") || lower.includes("can't get application") || lower.includes("cannot create activeX".toLowerCase())) {
    return { code: "ILLUSTRATOR_UNAVAILABLE", message };
  }
  return { code: "ILLUSTRATOR_EXECUTION_FAILED", message };
}

function appleScriptFor(scriptPath: string, options: ExecuteOptions): string {
  const target = (options.appPath || "Adobe Illustrator").replaceAll('"', '\\"');
  const escapedScriptPath = scriptPath.replaceAll("\\", "\\\\").replaceAll('"', '\\"');
  const lines = [`tell application "${target}"`];
  if (options.activate) lines.push("activate");
  lines.push(`do javascript of file "${escapedScriptPath}"`);
  lines.push("end tell");
  return lines.join("\n");
}

function powerShellFor(scriptPath: string, options: ExecuteOptions): string {
  const normalized = scriptPath.replaceAll("\\", "/").replaceAll("'", "''");
  const lines = ["$ErrorActionPreference = 'Stop'", "try {"];
  if (options.appPath) {
    const app = options.appPath.replaceAll('"', '`"');
    lines.push(`  if (-not (Get-Process Illustrator -ErrorAction SilentlyContinue)) { Start-Process "${app}"; Start-Sleep -Seconds 5 }`);
  }
  lines.push("  $ai = New-Object -ComObject 'Illustrator.Application'");
  if (options.activate) {
    lines.push("  try { $wsh = New-Object -ComObject 'WScript.Shell'; $null = $wsh.AppActivate('Adobe Illustrator') } catch {}");
  }
  lines.push(`  $ai.DoJavaScript("$.evalFile(new File('${normalized}'))")`);
  lines.push("} catch { Write-Error $_; exit 1 }");
  return lines.join("\n");
}

export class SerializedJsxTransport {
  private tail: Promise<unknown> = Promise.resolve();

  execute<T>(jsxBody: string, options: ExecuteOptions = {}): Promise<TransportResult<T>> {
    const task = this.tail.then(() => this.executeNow<T>(jsxBody, options));
    this.tail = task.catch(() => undefined);
    return task;
  }

  private async executeNow<T>(jsxBody: string, options: ExecuteOptions): Promise<TransportResult<T>> {
    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const dir = await mkdtemp(path.join(os.tmpdir(), "design-production-mcp-"));
    const id = randomUUID();
    const paramsPath = path.join(dir, `params-${id}.json`);
    const resultPath = path.join(dir, `result-${id}.json`);
    const jsxPath = path.join(dir, `script-${id}.jsx`);
    const transport = resolveLocalTransport();
    const runnerPath = path.join(dir, transport === "osascript" ? `run-${id}.scpt` : `run-${id}.ps1`);

    try {
      await writeFile(paramsPath, "{}", "utf8");
      const wrappedJsx = [
        "(function () {",
        `var __DPM_RESULT_PATH__ = ${JSON.stringify(resultPath)};`,
        "function __dpm_write_result(value) {",
        "  var f = new File(__DPM_RESULT_PATH__);",
        "  f.encoding = 'UTF-8'; f.open('w'); f.write(JSON.stringify(value)); f.close();",
        "}",
        "try {",
        `  var __dpm_value = (function () { ${jsxBody}\n})();`,
        "  __dpm_write_result({ok:true,value:__dpm_value});",
        "} catch (e) {",
        "  __dpm_write_result({ok:false,error:{code:'JSX_ERROR',message:String(e),line:e.line || null}});",
        "}",
        "})();",
      ].join("\n");
      await writeFile(jsxPath, `\uFEFF${wrappedJsx}`, "utf8");

      if (transport === "osascript") {
        await writeFile(runnerPath, appleScriptFor(jsxPath, options), "utf8");
        await execFileAsync("osascript", [runnerPath], timeoutMs);
      } else {
        await writeFile(runnerPath, powerShellFor(jsxPath, options), "utf8");
        await execFileAsync("powershell.exe", ["-ExecutionPolicy", "Bypass", "-NonInteractive", "-File", runnerPath], timeoutMs);
      }

      const parsed = JSON.parse((await readFile(resultPath, "utf8")).replace(/^\uFEFF/, "")) as TransportResult<T>;
      return parsed;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { ok: false, error: classifyFailure(message) };
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }
}
