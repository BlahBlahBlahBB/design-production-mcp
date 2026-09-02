import type {
  ColorInspectionOptions,
  FontListOptions,
  FontSummary,
  ImageInspectionOptions,
} from "./read-schema.js";

export const DEFAULT_MAX_INSPECTION_OBJECTS = 2_000;
export const DEFAULT_MAX_INSPECTION_DEPTH = 16;
export const DEFAULT_MAX_COLORS = 256;
export const DEFAULT_MAX_IMAGES = 256;
export const DEFAULT_MAX_FONTS = 100;

export interface NormalizedColorInspectionOptions {
  maxDepth: number;
  maxObjects: number;
  maxColors: number;
}

export interface NormalizedImageInspectionOptions {
  maxDepth: number;
  maxObjects: number;
  maxImages: number;
}

export interface NormalizedFontListOptions {
  search: string | null;
  maxResults: number;
}

function positiveInteger(value: unknown, fallback: number): number | null {
  const resolved = value ?? fallback;
  return Number.isInteger(resolved) && (resolved as number) >= 1 ? resolved as number : null;
}

export function normalizeColorInspectionOptions(
  options: ColorInspectionOptions = {},
): NormalizedColorInspectionOptions | null {
  const maxDepth = positiveInteger(options.maxDepth, DEFAULT_MAX_INSPECTION_DEPTH);
  const maxObjects = positiveInteger(options.maxObjects, DEFAULT_MAX_INSPECTION_OBJECTS);
  const maxColors = positiveInteger(options.maxColors, DEFAULT_MAX_COLORS);
  return maxDepth === null || maxObjects === null || maxColors === null ? null : { maxDepth, maxObjects, maxColors };
}

export function normalizeImageInspectionOptions(
  options: ImageInspectionOptions = {},
): NormalizedImageInspectionOptions | null {
  const maxDepth = positiveInteger(options.maxDepth, DEFAULT_MAX_INSPECTION_DEPTH);
  const maxObjects = positiveInteger(options.maxObjects, DEFAULT_MAX_INSPECTION_OBJECTS);
  const maxImages = positiveInteger(options.maxImages, DEFAULT_MAX_IMAGES);
  return maxDepth === null || maxObjects === null || maxImages === null ? null : { maxDepth, maxObjects, maxImages };
}

export function normalizeFontListOptions(options: FontListOptions = {}): NormalizedFontListOptions | null {
  if (options.search !== undefined && typeof options.search !== "string") return null;
  const maxResults = positiveInteger(options.maxResults, DEFAULT_MAX_FONTS);
  if (maxResults === null) return null;
  const search = options.search?.trim() || null;
  return { search, maxResults };
}

function compareStrings(left: string, right: string): number {
  const a = left.toLowerCase();
  const b = right.toLowerCase();
  return a < b ? -1 : a > b ? 1 : left < right ? -1 : left > right ? 1 : 0;
}

/** Normalize, sort, filter, and deduplicate the app-level raw TextFont list. */
export function normalizeFonts(
  raw: Array<Partial<FontSummary>>,
  options: NormalizedFontListOptions,
) {
  const search = options.search?.toLowerCase() ?? null;
  const fonts = raw
    .filter((font): font is FontSummary => typeof font.postScriptName === "string" && font.postScriptName.length > 0)
    .map((font) => ({
      postScriptName: font.postScriptName,
      family: typeof font.family === "string" && font.family.length > 0 ? font.family : null,
      style: typeof font.style === "string" && font.style.length > 0 ? font.style : null,
      typename: typeof font.typename === "string" && font.typename.length > 0 ? font.typename : null,
    }))
    .filter((font) => {
      if (!search) return true;
      return [font.postScriptName, font.family, font.style]
        .filter((value): value is string => value !== null)
        .some((value) => value.toLowerCase().includes(search));
    })
    .sort((left, right) => compareStrings(left.postScriptName, right.postScriptName));

  const unique: FontSummary[] = [];
  const seen = new Set<string>();
  for (const font of fonts) {
    const key = font.postScriptName.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(font);
  }
  return {
    matchedCount: unique.length,
    results: unique.slice(0, options.maxResults),
    truncated: unique.length > options.maxResults,
  };
}

const READ_HELPERS = `
  function __dpm_bounds(item) {
    try {
      var b = item.geometricBounds;
      return { left: b[0], top: b[1], right: b[2], bottom: b[3], width: Math.abs(b[2] - b[0]), height: Math.abs(b[1] - b[3]) };
    } catch (e) { return null; }
  }
  function __dpm_direct_items(container) {
    var out = [];
    try {
      for (var i = 0; i < container.pageItems.length; i++) {
        var item = container.pageItems[i];
        try { if (item.parent !== container) continue; } catch (e) {}
        out.push(item);
      }
    } catch (e) {}
    return out;
  }
  function __dpm_locator(item, layerPath, ancestry, collectionPath) {
    var typename = 'Unknown';
    var name = null;
    try { typename = item.typename || 'Unknown'; } catch (e) {}
    try { name = item.name || ''; } catch (e) {}
    return { kind: 'document-session-structural', typename: typename, name: name, layerPath: layerPath, ancestry: ancestry, collectionPath: collectionPath };
  }
`;

export function buildColorsJsx(options: NormalizedColorInspectionOptions): string {
  return `
    if (app.documents.length === 0) throw new Error('NO_DOCUMENT');
    ${READ_HELPERS}
    var d = app.activeDocument;
    var state = { objectsScanned: 0, references: 0, optionalFailures: 0, truncated: false, truncationReason: null, stop: false };
    function truncate(reason) { if (!state.truncated) state.truncationReason = reason; state.truncated = true; state.stop = true; }
    function emptyColor() {
      return { colorModel: 'UNKNOWN', typename: null, rgb: null, cmyk: null, grayscale: null, spotName: null, spotKind: null, tint: null, spotBaseColor: null, gradientName: null, gradientType: null, gradientStops: null, gradientStopsTruncated: false, registration: null };
    }
    function colorOf(color, depth) {
      var out = emptyColor();
      if (!color) return out;
      try { out.typename = color.typename || null; } catch (e) { state.optionalFailures++; return out; }
      // Color nesting is bounded before any DOM value reaches the serializer.
      if (depth >= 2) return out;
      try {
        if (out.typename === 'RGBColor') {
          out.colorModel = 'RGB'; out.rgb = { red: color.red, green: color.green, blue: color.blue };
        } else if (out.typename === 'CMYKColor') {
          out.colorModel = 'CMYK'; out.cmyk = { cyan: color.cyan, magenta: color.magenta, yellow: color.yellow, black: color.black };
        } else if (out.typename === 'GrayColor') {
          out.colorModel = 'GRAY'; out.grayscale = color.gray;
        } else if (out.typename === 'NoColor') {
          out.colorModel = 'NONE';
        } else if (out.typename === 'SpotColor') {
          out.colorModel = 'SPOT';
          try { out.tint = color.tint; } catch (e1) { state.optionalFailures++; }
          try {
            var spot = color.spot;
            out.spotName = spot.name || null;
            try { out.spotKind = String(spot.spotKind); } catch (e2) { state.optionalFailures++; }
            out.registration = out.spotName === '[Registration]';
            if (depth < 1) out.spotBaseColor = colorOf(spot.color, depth + 1);
          } catch (e3) { state.optionalFailures++; }
        } else if (out.typename === 'GradientColor') {
          out.colorModel = 'GRADIENT';
          try {
            var gradient = color.gradient;
            out.gradientName = gradient.name || null;
            try { out.gradientType = String(gradient.type); } catch (e4) { state.optionalFailures++; }
            out.gradientStops = [];
            for (var i = 0; i < gradient.gradientStops.length; i++) {
              if (i >= 16) { out.gradientStopsTruncated = true; break; }
              var stop = gradient.gradientStops[i];
              var stopOut = { rampPoint: null, midPoint: null, opacity: null, color: emptyColor() };
              try { stopOut.rampPoint = stop.rampPoint; } catch (e5) { state.optionalFailures++; }
              try { stopOut.midPoint = stop.midPoint; } catch (e6) { state.optionalFailures++; }
              try { stopOut.opacity = stop.opacity; } catch (e7) { state.optionalFailures++; }
              try { stopOut.color = colorOf(stop.color, depth + 1); } catch (e8) { state.optionalFailures++; }
              out.gradientStops.push(stopOut);
            }
          } catch (e9) { state.optionalFailures++; }
        }
      } catch (e10) { state.optionalFailures++; }
      return out;
    }
    function colorKey(color) {
      if (color.colorModel === 'RGB' && color.rgb) return 'RGB:' + color.rgb.red + ':' + color.rgb.green + ':' + color.rgb.blue;
      if (color.colorModel === 'CMYK' && color.cmyk) return 'CMYK:' + color.cmyk.cyan + ':' + color.cmyk.magenta + ':' + color.cmyk.yellow + ':' + color.cmyk.black;
      if (color.colorModel === 'GRAY') return 'GRAY:' + color.grayscale;
      if (color.colorModel === 'SPOT') return 'SPOT:' + color.spotName + ':' + color.tint;
      if (color.colorModel === 'GRADIENT') return 'GRADIENT:' + color.gradientName + ':' + color.gradientType;
      return color.colorModel + ':' + color.typename;
    }
    // References must not retain the same object that later owns the references array.
    // This is a bounded, schema-specific copy of already-extracted plain data;
    // it never accepts or walks an Illustrator DOM object.
    function copyColor(color, depth) {
      var out = emptyColor();
      out.colorModel = color.colorModel; out.typename = color.typename;
      if (color.rgb) out.rgb = { red: color.rgb.red, green: color.rgb.green, blue: color.rgb.blue };
      if (color.cmyk) out.cmyk = { cyan: color.cmyk.cyan, magenta: color.cmyk.magenta, yellow: color.cmyk.yellow, black: color.cmyk.black };
      out.grayscale = color.grayscale; out.spotName = color.spotName; out.spotKind = color.spotKind; out.tint = color.tint;
      out.registration = color.registration; out.gradientName = color.gradientName; out.gradientType = color.gradientType;
      out.gradientStopsTruncated = color.gradientStopsTruncated;
      if (depth >= 2) return out;
      if (color.spotBaseColor) out.spotBaseColor = copyColor(color.spotBaseColor, depth + 1);
      if (color.gradientStops) {
        out.gradientStops = [];
        for (var i = 0; i < color.gradientStops.length && i < 16; i++) {
          var stop = color.gradientStops[i];
          out.gradientStops.push({ rampPoint: stop.rampPoint, midPoint: stop.midPoint, opacity: stop.opacity, color: copyColor(stop.color, depth + 1) });
        }
        if (color.gradientStops.length > 16) out.gradientStopsTruncated = true;
      }
      return out;
    }
    var swatches = [];
    for (var si = 0; si < d.swatches.length; si++) {
      if (swatches.length >= ${options.maxColors}) { truncate('MAX_COLORS'); break; }
      var swatch = d.swatches[si];
      var swatchName = null;
      try { swatchName = swatch.name || ''; } catch (e) { state.optionalFailures++; }
      try { swatches.push({ source: 'swatch', swatchName: swatchName, locator: null, color: colorOf(swatch.color, 0) }); }
      catch (e1) { state.optionalFailures++; }
    }
    state.stop = false;
    var used = [];
    function addUsed(source, item, color, layerPath, ancestry, collectionPath) {
      var key = colorKey(color);
      var entry = null;
      for (var i = 0; i < used.length; i++) if (used[i].key === key) { entry = used[i]; break; }
      if (!entry) {
        if (used.length >= ${options.maxColors}) { truncate('MAX_COLORS'); return; }
        entry = { key: key, color: color, references: [] }; used.push(entry);
      }
      entry.references.push({ source: source, swatchName: null, locator: __dpm_locator(item, layerPath, ancestry, collectionPath), color: copyColor(color, 0) });
      state.references++;
    }
    function inspectItem(item, layerPath, ancestry, collectionPath) {
      var typename = 'Unknown';
      try { typename = item.typename; } catch (e) { state.optionalFailures++; return; }
      if (typename === 'PathItem') {
        try { if (item.filled) addUsed('path-fill', item, colorOf(item.fillColor, 0), layerPath, ancestry, collectionPath); } catch (e1) { state.optionalFailures++; }
        try { if (item.stroked) addUsed('path-stroke', item, colorOf(item.strokeColor, 0), layerPath, ancestry, collectionPath); } catch (e2) { state.optionalFailures++; }
      } else if (typename === 'TextFrame') {
        try { addUsed('text-fill', item, colorOf(item.textRange.characterAttributes.fillColor, 0), layerPath, ancestry, collectionPath); } catch (e3) { state.optionalFailures++; }
      }
    }
    function visit(container, layerPath, ancestry, collectionPath, depth) {
      if (state.stop) return;
      if (depth > ${options.maxDepth}) { truncate('MAX_DEPTH'); return; }
      var items = __dpm_direct_items(container);
      for (var i = 0; i < items.length; i++) {
        if (state.stop) return;
        if (state.objectsScanned >= ${options.maxObjects}) { truncate('OBJECT_TRAVERSAL_LIMIT'); return; }
        state.objectsScanned++;
        var item = items[i];
        var itemPath = collectionPath + '/pageItems/' + i;
        inspectItem(item, layerPath, ancestry, itemPath);
        try { if (item.typename === 'GroupItem') visit(item, layerPath, ancestry.concat([itemPath]), itemPath, depth + 1); } catch (e) { state.optionalFailures++; }
      }
    }
    function visitLayer(layer, layerPath, ancestry, depth) {
      visit(layer, layerPath, ancestry, 'layers/' + layerPath, depth);
      try { for (var i = 0; i < layer.layers.length; i++) visitLayer(layer.layers[i], layerPath + '/' + i, ancestry.concat(['layer:' + layerPath + '/' + i]), depth + 1); } catch (e) { state.optionalFailures++; }
    }
    for (var li = 0; li < d.layers.length && !state.stop; li++) visitLayer(d.layers[li], String(li), ['layer:' + li], 0);
    var usedColors = [];
    for (var ui = 0; ui < used.length; ui++) {
      var entry = used[ui];
      var summary = entry.color;
      summary.references = entry.references;
      summary.referenceCount = entry.references.length;
      usedColors.push(summary);
    }
    return { swatches: swatches, usedColors: usedColors, diagnostics: { swatchesRead: swatches.length, usedReferencesRead: state.references, optionalPropertyFailures: state.optionalFailures }, objectsScanned: state.objectsScanned, maxObjectsScanned: ${options.maxObjects}, truncated: state.truncated, truncationReason: state.truncationReason };
  `;
}

export function buildImagesJsx(options: NormalizedImageInspectionOptions): string {
  return `
    if (app.documents.length === 0) throw new Error('NO_DOCUMENT');
    ${READ_HELPERS}
    var d = app.activeDocument;
    var state = { objectsScanned: 0, optionalFailures: 0, truncated: false, truncationReason: null, stop: false };
    function truncate(reason) { if (!state.truncated) state.truncationReason = reason; state.truncated = true; state.stop = true; }
    var all = [];
    function imageInfo(item, typename, layerPath, ancestry, collectionPath) {
      var info = { locator: __dpm_locator(item, layerPath, ancestry, collectionPath), typename: typename, name: null, layerPath: layerPath, status: 'unknown', linked: null, embedded: null, filePath: null, fileExists: null, brokenLink: null, bounds: __dpm_bounds(item), displayedWidth: null, displayedHeight: null, intrinsicPixelWidth: null, intrinsicPixelHeight: null, intrinsicPixelsSupported: false, horizontalScale: null, verticalScale: null, scaleSupported: false, effectivePpi: null, effectivePpiSupported: false, colorSpace: null, colorSpaceSupported: false };
      try { info.name = item.name || ''; } catch (e) { state.optionalFailures++; }
      if (info.bounds) { info.displayedWidth = info.bounds.width; info.displayedHeight = info.bounds.height; }
      if (typename === 'PlacedItem') { info.status = 'linked'; info.linked = true; info.embedded = false; }
      else {
        try {
          if (typeof item.embedded === 'boolean') { info.embedded = item.embedded; info.linked = !item.embedded; info.status = item.embedded ? 'embedded' : 'linked'; }
        } catch (e1) { state.optionalFailures++; }
      }
      if (info.linked === true) {
        try {
          var file = item.file;
          info.filePath = file.fsName;
          info.fileExists = file.exists;
          info.brokenLink = file.exists === false;
        } catch (e2) { info.brokenLink = true; state.optionalFailures++; }
      }
      if (typename === 'RasterItem') {
        try {
          var cs = item.imageColorSpace;
          if (typeof ImageColorSpace !== 'undefined' && cs === ImageColorSpace.RGB) info.colorSpace = 'RGB';
          else if (typeof ImageColorSpace !== 'undefined' && cs === ImageColorSpace.CMYK) info.colorSpace = 'CMYK';
          else if (typeof ImageColorSpace !== 'undefined' && cs === ImageColorSpace.Grayscale) info.colorSpace = 'GRAY';
          else info.colorSpace = String(cs);
          info.colorSpaceSupported = true;
        } catch (e3) { state.optionalFailures++; }
      }
      return info;
    }
    function visit(container, layerPath, ancestry, collectionPath, depth) {
      if (state.stop) return;
      if (depth > ${options.maxDepth}) { truncate('MAX_DEPTH'); return; }
      var items = __dpm_direct_items(container);
      for (var i = 0; i < items.length; i++) {
        if (state.stop) return;
        if (state.objectsScanned >= ${options.maxObjects}) { truncate('OBJECT_TRAVERSAL_LIMIT'); return; }
        state.objectsScanned++;
        var item = items[i];
        var itemPath = collectionPath + '/pageItems/' + i;
        var typename = 'Unknown';
        try { typename = item.typename; } catch (e) { state.optionalFailures++; }
        if (typename === 'PlacedItem' || typename === 'RasterItem') {
          if (all.length >= ${options.maxImages}) { truncate('MAX_IMAGES'); return; }
          try { all.push(imageInfo(item, typename, layerPath, ancestry, itemPath)); } catch (e1) { state.optionalFailures++; }
        }
        try { if (typename === 'GroupItem') visit(item, layerPath, ancestry.concat([itemPath]), itemPath, depth + 1); } catch (e2) { state.optionalFailures++; }
      }
    }
    function visitLayer(layer, layerPath, ancestry, depth) {
      visit(layer, layerPath, ancestry, 'layers/' + layerPath, depth);
      try { for (var i = 0; i < layer.layers.length; i++) visitLayer(layer.layers[i], layerPath + '/' + i, ancestry.concat(['layer:' + layerPath + '/' + i]), depth + 1); } catch (e) { state.optionalFailures++; }
    }
    for (var li = 0; li < d.layers.length && !state.stop; li++) visitLayer(d.layers[li], String(li), ['layer:' + li], 0);
    var linked = [];
    var embedded = [];
    var brokenLinks = 0;
    for (var ai = 0; ai < all.length; ai++) {
      if (all[ai].status === 'linked') linked.push(all[ai]);
      if (all[ai].status === 'embedded') embedded.push(all[ai]);
      if (all[ai].brokenLink === true) brokenLinks++;
    }
    return { linked: linked, embedded: embedded, all: all, diagnostics: { brokenLinks: brokenLinks, optionalPropertyFailures: state.optionalFailures }, objectsScanned: state.objectsScanned, maxObjectsScanned: ${options.maxObjects}, truncated: state.truncated, truncationReason: state.truncationReason };
  `;
}

export function buildFontsJsx(): string {
  return `
    var fonts = [];
    var totalAvailable = 0;
    try {
      totalAvailable = app.textFonts.length;
      for (var i = 0; i < app.textFonts.length; i++) {
        var font = app.textFonts[i];
        var item = { postScriptName: '', family: null, style: null, typename: null };
        try { item.postScriptName = font.name || ''; } catch (e1) {}
        try { item.family = font.family || null; } catch (e2) {}
        try { item.style = font.style || null; } catch (e3) {}
        try { item.typename = font.typename || null; } catch (e4) {}
        if (item.postScriptName) fonts.push(item);
      }
    } catch (e) { throw new Error('FONT_ENUMERATION_FAILED:' + String(e)); }
    return { totalAvailable: totalAvailable, fonts: fonts };
  `;
}
