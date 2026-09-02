import type { IllustratorReadBridge, IllustratorStatus, ScriptResult } from "./bridge.js";
import { convertCoordinateForArtboards } from "./coordinate-model.js";
import { validateFindCriteria } from "./object-finding.js";
import type {
  ArtboardInfo,
  ConvertCoordinateRequest,
  CoordinateConversion,
  DocumentStructure,
  DocumentInfo,
  FindObjectsCriteria,
  FindObjectsOptions,
  FindObjectsResult,
  LayerInfo,
  SelectionInfo,
  TextFrameDetail,
  TextFrameSummary,
  TextFrameTarget,
  TraversalOptions,
} from "./read-schema.js";
import {
  buildDocumentStructureJsx,
  buildFindObjectsJsx,
  buildGroupsJsx,
  normalizeFindOptions,
  normalizeTraversalOptions,
} from "./structure-read.js";
import {
  type ExecuteOptions,
  type TransportResult,
  SerializedJsxTransport,
} from "./local-transport.js";

interface DetectPayload {
  name: string;
  version: string;
  documents: number;
}

interface JsxTransport {
  execute<T>(jsxBody: string, options?: ExecuteOptions): Promise<TransportResult<T>>;
}

const READ_HELPERS = `
  function __dpm_bounds(item) {
    try {
      var b = item.geometricBounds;
      return { left: b[0], top: b[1], right: b[2], bottom: b[3], width: Math.abs(b[2] - b[0]), height: Math.abs(b[1] - b[3]) };
    } catch (e) { return null; }
  }
  function __dpm_position(item) {
    try { var p = item.position; return { x: p[0], y: p[1] }; } catch (e) { return null; }
  }
  function __dpm_text_frame_summary(t, index) {
    var item = {
      index: index, name: '', contents: '', typename: 'TextFrame', locked: null, hidden: null,
      position: __dpm_position(t), bounds: __dpm_bounds(t), textKind: null,
      fontFamily: null, fontName: null, fontSize: null, overflow: null, overflowSupported: false
    };
    try { item.name = t.name || ''; } catch (e) {}
    try { item.contents = t.contents; } catch (e) {}
    try { item.typename = t.typename; } catch (e) {}
    try { item.locked = t.locked; } catch (e) {}
    try { item.hidden = t.hidden; } catch (e) {}
    try { item.textKind = String(t.kind); } catch (e) {}
    try {
      var a = t.textRange.characterAttributes;
      try { item.fontFamily = a.textFont.family; } catch (e1) {}
      try { item.fontName = a.textFont.name; } catch (e2) {}
      try { item.fontSize = a.size; } catch (e3) {}
    } catch (e) {}
    try {
      var overflowValue = t.overflows;
      if (typeof overflowValue === 'boolean') { item.overflow = overflowValue; item.overflowSupported = true; }
    } catch (e) {}
    return item;
  }
  function __dpm_text_frame_detail(t, index) {
    var item = __dpm_text_frame_summary(t, index);
    item.typography = {
      fontFamily: item.fontFamily, fontName: item.fontName, fontStyle: null, fontSize: item.fontSize,
      tracking: null, leading: null, justification: null, paragraphCount: null
    };
    try { item.typography.paragraphCount = t.paragraphs.length; } catch (e) {}
    try {
      var a = t.textRange.characterAttributes;
      try { item.typography.fontStyle = a.textFont.style; } catch (e1) {}
      try { item.typography.tracking = a.tracking; } catch (e2) {}
      try { item.typography.leading = a.leading; } catch (e3) {}
    } catch (e) {}
    try { item.typography.justification = String(t.paragraphs[0].paragraphAttributes.justification); } catch (e) {}
    return item;
  }
`;

export class LocalIllustratorBridge implements IllustratorReadBridge {
  readonly id = "local-extendscript";

  constructor(private readonly transport: JsxTransport = new SerializedJsxTransport()) {}

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

  async getDocumentSummary(): Promise<ScriptResult<{
    name: string;
    path: string | null;
    saved: boolean;
    colorSpace: string;
    artboards: number;
    textFrames: number;
    layers: number;
  }>> {
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

  async getDocumentInfo(): Promise<ScriptResult<DocumentInfo>> {
    return this.execute<DocumentInfo>(`
      if (app.documents.length === 0) throw new Error('NO_DOCUMENT');
      var d = app.activeDocument;
      var path = null;
      var modified = null;
      var modifiedSupported = false;
      var width = null;
      var height = null;
      var rulerUnits = null;
      var activeArtboardIndex = null;
      try { path = d.fullName.fsName; } catch (e) {}
      try {
        var modifiedValue = d.modified;
        if (typeof modifiedValue === 'boolean') { modified = modifiedValue; modifiedSupported = true; }
      } catch (e) {}
      try { width = d.width; } catch (e) {}
      try { height = d.height; } catch (e) {}
      try { rulerUnits = String(d.rulerUnits); } catch (e) {}
      try { activeArtboardIndex = d.artboards.getActiveArtboardIndex(); } catch (e) {}
      return {
        name: d.name, path: path, saved: d.saved, modified: modified, modifiedSupported: modifiedSupported,
        colorSpace: String(d.documentColorSpace), width: width, height: height, rulerUnits: rulerUnits,
        artboardCount: d.artboards.length, layerCount: d.layers.length, textFrameCount: d.textFrames.length,
        placedImageCount: d.placedItems.length, activeArtboardIndex: activeArtboardIndex
      };
    `);
  }

  async getArtboards(): Promise<ScriptResult<ArtboardInfo[]>> {
    return this.execute<ArtboardInfo[]>(`
      if (app.documents.length === 0) throw new Error('NO_DOCUMENT');
      var d = app.activeDocument;
      var activeIndex = null;
      try { activeIndex = d.artboards.getActiveArtboardIndex(); } catch (e) {}
      var out = [];
      for (var i = 0; i < d.artboards.length; i++) {
        var a = d.artboards[i];
        var r = a.artboardRect;
        out.push({ index: i, name: a.name || '', rect: [r[0], r[1], r[2], r[3]], width: Math.abs(r[2] - r[0]), height: Math.abs(r[1] - r[3]), active: activeIndex === i });
      }
      return out;
    `);
  }

  async getLayers(): Promise<ScriptResult<LayerInfo[]>> {
    return this.execute<LayerInfo[]>(`
      if (app.documents.length === 0) throw new Error('NO_DOCUMENT');
      var d = app.activeDocument;
      function __dpm_layer(layer, index, path) {
        var item = { index: index, path: path, name: '', visible: null, locked: null, printable: null, objectCount: null, childLayers: [] };
        try { item.name = layer.name || ''; } catch (e) {}
        try { item.visible = layer.visible; } catch (e) {}
        try { item.locked = layer.locked; } catch (e) {}
        try { item.printable = layer.printable; } catch (e) {}
        try { item.objectCount = layer.pageItems.length; } catch (e) {}
        try { for (var j = 0; j < layer.layers.length; j++) item.childLayers.push(__dpm_layer(layer.layers[j], j, path + '/' + j)); } catch (e) {}
        return item;
      }
      var out = [];
      for (var i = 0; i < d.layers.length; i++) out.push(__dpm_layer(d.layers[i], i, String(i)));
      return out;
    `);
  }

  async getSelection(): Promise<ScriptResult<SelectionInfo>> {
    return this.execute<SelectionInfo>(`
      if (app.documents.length === 0) throw new Error('NO_DOCUMENT');
      ${READ_HELPERS}
      var d = app.activeDocument;
      var selection = d.selection;
      var out = [];
      if (selection) {
        for (var i = 0; i < selection.length; i++) {
          var item = selection[i];
          var info = { index: i, typename: '', name: null, bounds: __dpm_bounds(item), locked: null, hidden: null };
          try { info.typename = item.typename; } catch (e) {}
          try { info.name = item.name || ''; } catch (e) {}
          try { info.locked = item.locked; } catch (e) {}
          try { info.hidden = item.hidden; } catch (e) {}
          out.push(info);
        }
      }
      return { selectionCount: out.length, items: out };
    `);
  }

  async listTextFrames(): Promise<ScriptResult<TextFrameSummary[]>> {
    return this.execute(`
      if (app.documents.length === 0) throw new Error('NO_DOCUMENT');
      ${READ_HELPERS}
      var d = app.activeDocument;
      var out = [];
      for (var i = 0; i < d.textFrames.length; i++) {
        out.push(__dpm_text_frame_summary(d.textFrames[i], i));
      }
      return out;
    `);
  }

  async getTextFrameDetail(target: TextFrameTarget): Promise<ScriptResult<TextFrameDetail>> {
    const index = target.index;
    const name = target.name;
    if (index !== undefined && name !== undefined) {
      return { ok: false, error: "AMBIGUOUS_TEXT_FRAME_TARGET" };
    }
    if (index !== undefined && (!Number.isInteger(index) || index < 0)) {
      return { ok: false, error: "INVALID_TEXT_FRAME_INDEX" };
    }
    if (name !== undefined && name.trim() === "") {
      return { ok: false, error: "INVALID_TEXT_FRAME_NAME" };
    }

    if (index !== undefined) {
      return this.execute<TextFrameDetail>(`
        if (app.documents.length === 0) throw new Error('NO_DOCUMENT');
        ${READ_HELPERS}
        var d = app.activeDocument;
        var targetIndex = ${index};
        if (targetIndex >= d.textFrames.length) throw new Error('TEXT_FRAME_INDEX_OUT_OF_RANGE:' + targetIndex);
        return __dpm_text_frame_detail(d.textFrames[targetIndex], targetIndex);
      `);
    }

    if (name === undefined) return { ok: false, error: "INVALID_TEXT_FRAME_TARGET" };

    return this.execute<TextFrameDetail>(`
      if (app.documents.length === 0) throw new Error('NO_DOCUMENT');
      ${READ_HELPERS}
      var d = app.activeDocument;
      var targetName = ${JSON.stringify(name)};
      var found = null;
      var foundIndex = -1;
      for (var i = 0; i < d.textFrames.length; i++) {
        if ((d.textFrames[i].name || '') === targetName) {
          if (found !== null) throw new Error('TEXT_FRAME_NAME_AMBIGUOUS:' + targetName);
          found = d.textFrames[i];
          foundIndex = i;
        }
      }
      if (found === null) throw new Error('TEXT_FRAME_NOT_FOUND_BY_NAME:' + targetName);
      return __dpm_text_frame_detail(found, foundIndex);
    `);
  }

  async getGroups(options: TraversalOptions = {}): Promise<ScriptResult<import("./read-schema.js").GroupsResult>> {
    const normalized = normalizeTraversalOptions(options);
    if (!normalized) return { ok: false, error: "INVALID_TRAVERSAL_OPTIONS" };
    return this.execute(buildGroupsJsx(normalized));
  }

  async getDocumentStructure(options: TraversalOptions = {}): Promise<ScriptResult<DocumentStructure>> {
    const normalized = normalizeTraversalOptions(options);
    if (!normalized) return { ok: false, error: "INVALID_TRAVERSAL_OPTIONS" };
    return this.execute(buildDocumentStructureJsx(normalized));
  }

  async findObjects(
    criteria: FindObjectsCriteria,
    options: FindObjectsOptions = {},
  ): Promise<ScriptResult<FindObjectsResult>> {
    const criteriaError = validateFindCriteria(criteria);
    if (criteriaError) return { ok: false, error: criteriaError };
    const normalized = normalizeFindOptions(options);
    if (!normalized) return { ok: false, error: "INVALID_FIND_OPTIONS" };
    return this.execute(buildFindObjectsJsx(criteria, normalized));
  }

  async convertCoordinate(request: ConvertCoordinateRequest): Promise<ScriptResult<CoordinateConversion>> {
    const artboards = await this.getArtboards();
    if (!artboards.ok) return { ok: false, error: artboards.error ?? "ARTBOARD_READ_FAILED" };
    if (!artboards.value) return { ok: false, error: "ARTBOARD_READ_FAILED" };
    return convertCoordinateForArtboards(request, artboards.value);
  }
}
