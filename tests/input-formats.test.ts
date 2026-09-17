import test from "node:test";
import assert from "node:assert/strict";
import * as XLSX from "xlsx";
import { generateQrSvg, readCsv, readExcel } from "../src/production/infrastructure/input-formats.js";

test("internal QR generator emits SVG and validates payloads", async () => {
  const svg = await generateQrSvg({ content: "https://example.test", errorCorrection: "H", margin: 1 });
  assert.match(svg, /<svg/);
  await assert.rejects(generateQrSvg({ content: "" }), /QR_CONTENT_REQUIRED/);
});

test("internal CSV and Excel readers produce normalized rows without target mapping", () => {
  assert.deepEqual(readCsv("name,count\nA,2\n"), { headers: ["name", "count"], rows: [{ name: "A", count: "2" }] });
  const sheet = XLSX.utils.aoa_to_sheet([["name", "count"], ["B", 3]]);
  const book = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(book, sheet, "Data");
  const bytes = XLSX.write(book, { type: "array", bookType: "xlsx" });
  assert.deepEqual(readExcel(bytes), { headers: ["name", "count"], rows: [{ name: "B", count: 3 }] });
});
