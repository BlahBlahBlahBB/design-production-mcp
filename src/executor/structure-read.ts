import type { FindObjectsCriteria, FindObjectsOptions, TraversalOptions } from "./read-schema.js";

export const DEFAULT_MAX_DEPTH = 16;
export const DEFAULT_MAX_OBJECTS = 2_000;
export const DEFAULT_MAX_RESULTS = 100;

export interface NormalizedTraversalOptions {
  maxDepth: number;
  maxObjects: number;
}

export function normalizeTraversalOptions(options: TraversalOptions = {}): NormalizedTraversalOptions | null {
  const maxDepth = options.maxDepth ?? DEFAULT_MAX_DEPTH;
  const maxObjects = options.maxObjects ?? DEFAULT_MAX_OBJECTS;
  if (!Number.isInteger(maxDepth) || maxDepth < 0 || !Number.isInteger(maxObjects) || maxObjects < 1) return null;
  return { maxDepth, maxObjects };
}

export function normalizeFindOptions(options: FindObjectsOptions = {}) {
  const traversal = normalizeTraversalOptions(options);
  const maxResults = options.maxResults ?? DEFAULT_MAX_RESULTS;
  if (!traversal || !Number.isInteger(maxResults) || maxResults < 1) return null;
  return { ...traversal, maxResults };
}

const COMMON_HELPERS = `
  function __dpm_bounds(item) {
    try {
      var b = item.geometricBounds;
      return { left: b[0], top: b[1], right: b[2], bottom: b[3], width: Math.abs(b[2] - b[0]), height: Math.abs(b[1] - b[3]) };
    } catch (e) { return null; }
  }
  function __dpm_text_preview(item) {
    if (item.typename !== 'TextFrame') return { preview: null, length: null };
    try {
      var contents = item.contents;
      return { preview: contents.length > 160 ? contents.substring(0, 160) + '...' : contents, length: contents.length };
    } catch (e) { return { preview: null, length: null }; }
  }
  function __dpm_summary(item, layerPath, ancestry, collectionPath) {
    var name = null;
    var typename = 'Unknown';
    var locked = null;
    var hidden = null;
    try { name = item.name || ''; } catch (e) {}
    try { typename = item.typename || 'Unknown'; } catch (e) {}
    try { locked = item.locked; } catch (e) {}
    try { hidden = item.hidden; } catch (e) {}
    var text = __dpm_text_preview(item);
    var locator = { kind: 'document-session-structural', typename: typename, name: name, layerPath: layerPath, ancestry: ancestry, collectionPath: collectionPath };
    return {
      typename: typename, name: name, locator: locator, layerPath: layerPath, ancestry: ancestry,
      collectionPath: collectionPath, locked: locked, hidden: hidden, bounds: __dpm_bounds(item),
      contentsPreview: text.preview, contentsLength: text.length
    };
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
`;

export function buildGroupsJsx(options: NormalizedTraversalOptions): string {
  return `
    if (app.documents.length === 0) throw new Error('NO_ACTIVE_DOCUMENT');
    ${COMMON_HELPERS}
    var d = app.activeDocument;
    var state = { objectCount: 0, truncated: false, truncationReason: null };
    var groups = [];
    function visit(container, layerPath, parentGroupPath, ancestry, collectionPath, depth) {
      if (depth > ${options.maxDepth}) { state.truncated = true; state.truncationReason = 'MAX_DEPTH'; return; }
      var items = __dpm_direct_items(container);
      for (var i = 0; i < items.length; i++) {
        if (state.objectCount >= ${options.maxObjects}) { state.truncated = true; state.truncationReason = 'OBJECT_TRAVERSAL_LIMIT'; return; }
        state.objectCount++;
        var item = items[i];
        var itemPath = collectionPath + '/pageItems/' + i;
        if (item.typename !== 'GroupItem') continue;
        var groupPath = itemPath;
        var summary = __dpm_summary(item, layerPath, ancestry, groupPath);
        var clipped = null;
        var clippedSupported = false;
        try { var clippedValue = item.clipped; if (typeof clippedValue === 'boolean') { clipped = clippedValue; clippedSupported = true; } } catch (e) {}
        var clippingMask = null;
        var clippingMaskSupported = false;
        var children = __dpm_direct_items(item);
        try {
          clippingMaskSupported = true;
          clippingMask = false;
          for (var j = 0; j < children.length; j++) {
            if (children[j].typename === 'PathItem' && children[j].clipping === true) { clippingMask = true; break; }
          }
        } catch (e) { clippingMask = null; clippingMaskSupported = false; }
        var childGroupCount = 0;
        for (var k = 0; k < children.length; k++) if (children[k].typename === 'GroupItem') childGroupCount++;
        summary.parentGroupPath = parentGroupPath;
        summary.clipped = clipped;
        summary.clippedSupported = clippedSupported;
        summary.clippingMask = clippingMask;
        summary.clippingMaskSupported = clippingMaskSupported;
        summary.childObjectCount = children.length;
        summary.childGroupCount = childGroupCount;
        groups.push(summary);
        visit(item, layerPath, groupPath, ancestry.concat([groupPath]), groupPath, depth + 1);
      }
    }
    for (var l = 0; l < d.layers.length; l++) visit(d.layers[l], String(l), null, ['layer:' + l], 'layers/' + l, 0);
    return { groups: groups, objectCount: state.objectCount, truncated: state.truncated, truncationReason: state.truncationReason };
  `;
}

export function buildDocumentStructureJsx(options: NormalizedTraversalOptions): string {
  return `
    if (app.documents.length === 0) throw new Error('NO_ACTIVE_DOCUMENT');
    ${COMMON_HELPERS}
    var d = app.activeDocument;
    var state = { objectCount: 0, truncated: false, truncationReason: null };
    function visitItems(container, layerPath, ancestry, collectionPath, depth) {
      var out = [];
      if (depth > ${options.maxDepth}) { state.truncated = true; state.truncationReason = 'MAX_DEPTH'; return out; }
      var items = __dpm_direct_items(container);
      for (var i = 0; i < items.length; i++) {
        if (state.objectCount >= ${options.maxObjects}) { state.truncated = true; state.truncationReason = 'OBJECT_TRAVERSAL_LIMIT'; return out; }
        state.objectCount++;
        var item = items[i];
        var itemPath = collectionPath + '/pageItems/' + i;
        var node = __dpm_summary(item, layerPath, ancestry, itemPath);
        node.nodeType = 'object';
        node.children = [];
        node.truncated = false;
        if (item.typename === 'GroupItem') {
          node.children = visitItems(item, layerPath, ancestry.concat([itemPath]), itemPath, depth + 1);
          node.truncated = state.truncated && depth + 1 > ${options.maxDepth};
        }
        out.push(node);
      }
      return out;
    }
    function visitLayer(layer, layerPath, ancestry, depth) {
      var node = {
        nodeType: 'layer', typename: 'Layer', name: '', locator: { kind: 'document-session-structural', typename: 'Layer', name: '', layerPath: layerPath, ancestry: ancestry, collectionPath: 'layers/' + layerPath },
        layerPath: layerPath, ancestry: ancestry, collectionPath: 'layers/' + layerPath, locked: null, hidden: null, bounds: null,
        contentsPreview: null, contentsLength: null, children: [], truncated: false
      };
      try { node.name = layer.name || ''; node.locator.name = node.name; } catch (e) {}
      try { node.locked = layer.locked; } catch (e) {}
      try { node.hidden = !layer.visible; } catch (e) {}
      if (depth > ${options.maxDepth}) { node.truncated = true; state.truncated = true; state.truncationReason = 'MAX_DEPTH'; return node; }
      node.children = visitItems(layer, layerPath, ancestry, 'layers/' + layerPath, depth);
      for (var j = 0; j < layer.layers.length; j++) node.children.push(visitLayer(layer.layers[j], layerPath + '/' + j, ancestry.concat(['layer:' + layerPath + '/' + j]), depth + 1));
      return node;
    }
    var layers = [];
    for (var i = 0; i < d.layers.length; i++) layers.push(visitLayer(d.layers[i], String(i), ['layer:' + i], 0));
    var docPath = null;
    try { docPath = d.fullName.fsName; } catch (e) {}
    return { document: { name: d.name, path: docPath }, layers: layers, objectCount: state.objectCount, truncated: state.truncated, truncationReason: state.truncationReason };
  `;
}

export function buildFindObjectsJsx(
  criteria: FindObjectsCriteria,
  options: ReturnType<typeof normalizeFindOptions> & {},
): string {
  if (!options) throw new Error("invalid find options");
  return `
    if (app.documents.length === 0) throw new Error('NO_ACTIVE_DOCUMENT');
    ${COMMON_HELPERS}
    var d = app.activeDocument;
    var criteria = ${JSON.stringify(criteria)};
    var state = { objectCount: 0, matchedCount: 0, truncated: false, truncationReason: null };
    var results = [];
    function matchString(actual, filter) { return filter.mode === 'exact' ? actual === filter.value : actual.indexOf(filter.value) >= 0; }
    function matches(item, layerName, layerPath) {
      var name = '';
      var typename = 'Unknown';
      var locked = null;
      var hidden = null;
      try { name = item.name || ''; } catch (e) {}
      try { typename = item.typename || 'Unknown'; } catch (e) {}
      try { locked = item.locked; } catch (e) {}
      try { hidden = item.hidden; } catch (e) {}
      if (criteria.name && !matchString(name, criteria.name)) return false;
      if (criteria.typename) {
        var types = criteria.typename instanceof Array ? criteria.typename : [criteria.typename];
        var typeMatch = false;
        for (var ti = 0; ti < types.length; ti++) if (typename === types[ti]) typeMatch = true;
        if (!typeMatch) return false;
      }
      if (criteria.layerName && criteria.layerName !== layerName) return false;
      if (criteria.layerPath && criteria.layerPath !== layerPath) return false;
      if (criteria.locked !== undefined && criteria.locked !== locked) return false;
      if (criteria.hidden !== undefined && criteria.hidden !== hidden) return false;
      if (criteria.text) {
        if (typename !== 'TextFrame') return false;
        var contents = '';
        try { contents = item.contents; } catch (e) { return false; }
        if (!matchString(contents, criteria.text)) return false;
      }
      return true;
    }
    function visit(container, layerName, layerPath, ancestry, collectionPath, depth) {
      if (depth > ${options.maxDepth}) { state.truncated = true; state.truncationReason = 'MAX_DEPTH'; return; }
      var items = __dpm_direct_items(container);
      for (var i = 0; i < items.length; i++) {
        if (state.objectCount >= ${options.maxObjects}) { state.truncated = true; state.truncationReason = 'OBJECT_TRAVERSAL_LIMIT'; return; }
        var item = items[i];
        var itemPath = collectionPath + '/pageItems/' + i;
        state.objectCount++;
        if (matches(item, layerName, layerPath)) {
          state.matchedCount++;
          if (results.length < ${options.maxResults}) results.push(__dpm_summary(item, layerPath, ancestry, itemPath));
          else { state.truncated = true; state.truncationReason = 'MAX_RESULTS'; return; }
        }
        if (item.typename === 'GroupItem') visit(item, layerName, layerPath, ancestry.concat([itemPath]), itemPath, depth + 1);
      }
    }
    for (var l = 0; l < d.layers.length; l++) visit(d.layers[l], d.layers[l].name || '', String(l), ['layer:' + l], 'layers/' + l, 0);
    return { matchedCount: state.matchedCount, results: results, truncated: state.truncated, truncationReason: state.truncationReason, criteriaApplied: criteria };
  `;
}
