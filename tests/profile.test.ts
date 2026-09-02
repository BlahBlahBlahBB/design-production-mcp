import test from "node:test";
import assert from "node:assert/strict";
import { validateTemplateProfile } from "../src/production/templates/profile.js";
import { templateFingerprint } from "../src/production/templates/fingerprint.js";

test("valid profile passes", () => {
  assert.deepEqual(validateTemplateProfile({
    id: "name-tag",
    templatePath: "/templates/name-tag.ai",
    fields: { name: { objectName: "@text:name", kind: "text", fit: "shrink_to_fit", minFontSize: 18, maxFontSize: 28 } },
    output: { formats: ["pdf", "png"], filenamePattern: "{name}" },
  }), []);
});

test("duplicate object mappings are rejected", () => {
  const errors = validateTemplateProfile({
    id: "badge",
    templatePath: "/templates/badge.ai",
    fields: {
      name: { objectName: "@text:value", kind: "text" },
      company: { objectName: "@text:value", kind: "text" },
    },
    output: { formats: ["pdf"], filenamePattern: "{name}" },
  });
  assert.equal(errors.length, 1);
});

test("fingerprint is stable across ordering", () => {
  const a = templateFingerprint({
    documentName: "x.ai",
    artboards: [{ name: "B", width: 1, height: 2 }, { name: "A", width: 1, height: 2 }],
    dynamicObjects: [{ name: "@b", kind: "text", layer: "L" }, { name: "@a", kind: "text", layer: "L" }],
    protectedLayers: ["Z", "A"],
  });
  const b = templateFingerprint({
    documentName: "x.ai",
    artboards: [{ name: "A", width: 1, height: 2 }, { name: "B", width: 1, height: 2 }],
    dynamicObjects: [{ name: "@a", kind: "text", layer: "L" }, { name: "@b", kind: "text", layer: "L" }],
    protectedLayers: ["A", "Z"],
  });
  assert.equal(a, b);
});
