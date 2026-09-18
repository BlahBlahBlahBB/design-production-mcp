import { z } from 'zod';

// --- boolean coerce (MCP クライアントが "true"/"false" 文字列を送る場合の対策) ---

export const coerceBoolean = z.preprocess(
  (val) => {
    if (typeof val === 'string') {
      const normalized = val.trim().toLowerCase();
      if (normalized === 'true') return true;
      if (normalized === 'false') return false;
    }
    return val;
  },
  z.boolean(),
);

// --- 共通 annotations 定数 ---

export const READ_ANNOTATIONS = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const;

export const WRITE_ANNOTATIONS = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: false,
} as const;

export const WRITE_IDEMPOTENT_ANNOTATIONS = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const;

export const DESTRUCTIVE_ANNOTATIONS = {
  readOnlyHint: false,
  destructiveHint: true,
  idempotentHint: false,
  openWorldHint: false,
} as const;

export const cmykColorSchema = z.object({
  type: z.literal('cmyk').describe('Color type'),
  c: z.number().describe('Cyan'),
  m: z.number().describe('Magenta'),
  y: z.number().describe('Yellow'),
  k: z.number().describe('Black'),
});

export const rgbColorSchema = z.object({
  type: z.literal('rgb').describe('Color type'),
  r: z.number().describe('Red'),
  g: z.number().describe('Green'),
  b: z.number().describe('Blue'),
});

export const grayColorSchema = z.object({
  type: z.literal('gray').describe('Color type'),
  value: z.number().min(0).max(100).describe('Gray value (0-100)'),
});

const noColorSchema = z.object({
  type: z.literal('none').describe('Color type'),
});

export const colorSchema = z
  .discriminatedUnion('type', [cmykColorSchema, rgbColorSchema, grayColorSchema, noColorSchema])
  .optional();

export const strokeSchema = z
  .object({
    color: colorSchema.describe('Stroke color'),
    width: z.number().optional().describe('Stroke width'),
  })
  .optional();

export const FONT_HELPERS_JSX = `
function findFontCandidates(fontName) {
  var candidates = [];
  var searchLower = fontName.toLowerCase();
  for (var fi = 0; fi < app.textFonts.length; fi++) {
    var f = app.textFonts[fi];
    if (f.name.toLowerCase().indexOf(searchLower) >= 0 ||
        (f.family && f.family.toLowerCase().indexOf(searchLower) >= 0)) {
      candidates.push({ name: f.name, family: f.family });
      if (candidates.length >= 10) break;
    }
  }
  return candidates;
}
`;

export const COLOR_HELPERS_JSX = `
function createColor(colorObj) {
  if (!colorObj || colorObj.type === "none") return new NoColor();
  if (colorObj.type === "cmyk") {
    var c = new CMYKColor();
    c.cyan = colorObj.c;
    c.magenta = colorObj.m;
    c.yellow = colorObj.y;
    c.black = colorObj.k;
    return c;
  }
  if (colorObj.type === "rgb") {
    var c = new RGBColor();
    c.red = colorObj.r;
    c.green = colorObj.g;
    c.blue = colorObj.b;
    return c;
  }
  if (colorObj.type === "gray") {
    var c = new GrayColor();
    c.gray = colorObj.value;
    return c;
  }
  return new NoColor();
}

function applyOptionalFill(item, colorObj) {
  if (typeof colorObj === "undefined") return;

  if (item.typename === "TextFrame") {
    var textColor = createColor(colorObj);
    item.textRange.characterAttributes.fillColor = textColor;
    for (var ti = 0; ti < item.characters.length; ti++) {
      item.characters[ti].characterAttributes.fillColor = textColor;
    }
    return;
  }

  if (!colorObj || colorObj.type === "none") {
    item.filled = false;
    return;
  }
  item.fillColor = createColor(colorObj);
  item.filled = true;
}

function applyStroke(item, strokeObj, defaultStroked) {
  if (!strokeObj) {
    item.stroked = defaultStroked;
    return;
  }
  if (typeof strokeObj.width === "number") {
    item.strokeWidth = strokeObj.width;
  }
  if (strokeObj.color && strokeObj.color.type === "none") {
    item.stroked = false;
    return;
  }
  if (strokeObj.color) {
    item.strokeColor = createColor(strokeObj.color);
    item.stroked = true;
  }
}
`;

/** Character attributes are authoritative for TextFrame appearance. */
export const TEXT_APPEARANCE_HELPERS_JSX = `
function applyTextAppearance(item, fillObj, strokeObj) {
  var chars = item.characters;
  if (typeof fillObj !== "undefined") {
    var fill = createColor(fillObj);
    item.textRange.characterAttributes.fillColor = fill;
    for (var fi = 0; fi < chars.length; fi++) chars[fi].characterAttributes.fillColor = fill;
  }
  if (typeof strokeObj !== "undefined" && strokeObj !== null) {
    if (typeof strokeObj.width === "number") {
      item.textRange.characterAttributes.strokeWeight = strokeObj.width;
      for (var wi = 0; wi < chars.length; wi++) chars[wi].characterAttributes.strokeWeight = strokeObj.width;
    }
    if (strokeObj.color) {
      var stroke = createColor(strokeObj.color);
      item.textRange.characterAttributes.strokeColor = stroke;
      for (var si = 0; si < chars.length; si++) chars[si].characterAttributes.strokeColor = stroke;
    }
  }
}
function readTextAppearance(item) {
  var chars = item.characters, firstFill = null, firstStroke = null, fillMixed = false, strokeMixed = false;
  for (var ai = 0; ai < chars.length; ai++) {
    var attrs = chars[ai].characterAttributes, fill = colorToObject(attrs.fillColor), stroke = colorToObject(attrs.strokeColor);
    if (firstFill === null) firstFill = fill; else if (jsonStringify(fill) !== jsonStringify(firstFill)) fillMixed = true;
    if (firstStroke === null) firstStroke = stroke; else if (jsonStringify(stroke) !== jsonStringify(firstStroke)) strokeMixed = true;
  }
  if (firstFill === null) firstFill = colorToObject(item.textRange.characterAttributes.fillColor);
  if (firstStroke === null) firstStroke = colorToObject(item.textRange.characterAttributes.strokeColor);
  return { character_count: chars.length, fill: firstFill, fill_mixed: fillMixed, stroke: firstStroke, stroke_mixed: strokeMixed };
}
`;
