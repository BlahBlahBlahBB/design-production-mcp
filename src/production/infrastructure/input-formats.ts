import { parse } from "csv-parse/sync";
import * as XLSX from "xlsx";
import QRCode from "qrcode";

export type QrErrorCorrection = "L" | "M" | "Q" | "H";

/** Internal, deterministic SVG payload generator. Placement remains a future workflow concern. */
export async function generateQrSvg(input: {
  content: string;
  errorCorrection?: QrErrorCorrection;
  margin?: number;
  width?: number;
}): Promise<string> {
  if (typeof input.content !== "string" || input.content.length === 0) throw new Error("QR_CONTENT_REQUIRED");
  if (input.content.length > 2_953) throw new Error("QR_CONTENT_TOO_LONG");
  return QRCode.toString(input.content, {
    type: "svg",
    errorCorrectionLevel: input.errorCorrection ?? "M",
    margin: input.margin ?? 4,
    width: input.width,
  });
}

export interface TabularInput { headers: string[]; rows: Array<Record<string, string | number | boolean | null>>; }

function normalize(headers: string[], rows: unknown[][]): TabularInput {
  const cleanHeaders = headers.map((header, index) => String(header || `column_${index + 1}`).trim());
  if (new Set(cleanHeaders).size !== cleanHeaders.length) throw new Error("DUPLICATE_TABULAR_HEADERS");
  return {
    headers: cleanHeaders,
    rows: rows.filter((row) => row.some((value) => value !== null && value !== "")).map((row) => Object.fromEntries(cleanHeaders.map((header, index) => [header, tabularValue(row[index])]))),
  };
}

function tabularValue(value: unknown): string | number | boolean | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

/** Internal CSV reader; mapping rows to Illustrator targets is intentionally not included. */
export function readCsv(input: string): TabularInput {
  const rows = parse(input, { bom: true, columns: false, skip_empty_lines: true, trim: false }) as unknown[][];
  if (rows.length === 0) return { headers: [], rows: [] };
  return normalize(rows[0].map(String), rows.slice(1));
}

/** Internal first-sheet Excel reader; does not mutate the source workbook. */
export function readExcel(input: Uint8Array): TabularInput {
  const workbook = XLSX.read(input, { type: "array", cellDates: true });
  const name = workbook.SheetNames[0];
  if (!name) return { headers: [], rows: [] };
  const values = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[name], { header: 1, defval: null, raw: true });
  if (values.length === 0) return { headers: [], rows: [] };
  return normalize((values[0] ?? []).map(String), values.slice(1));
}
