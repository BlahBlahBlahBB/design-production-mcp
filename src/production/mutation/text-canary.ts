import type { IllustratorBridge } from "../../executor/bridge.js";
import type { ObjectLocator } from "../../executor/read-schema.js";
import {
  type ExpectedTargetState,
  type MutationClassification,
  type MutationError,
  type MutationResult,
  SafeMutationContext,
  mutationError,
} from "./context.js";

export const TEXT_CONTENT_MUTATION: MutationClassification = {
  access: "DOCUMENT_WRITE",
  impact: "CONTENT",
  destructive: false,
};

export type TextCanaryTarget =
  | { kind: "index"; index: number; expected: ExpectedTargetState }
  | { kind: "name"; name: string; expected: ExpectedTargetState }
  | { kind: "locator"; locator: ObjectLocator; expected: ExpectedTargetState };

export interface TextCanaryRequest {
  operation: string;
  workPath: string;
  nextContents: string;
  targets: TextCanaryTarget[];
  classification?: MutationClassification;
}

export interface TextCanarySuccess {
  mutatedCount: number;
  targets: Array<{ index: number | null; name: string | null; contents: string }>;
}

interface JsxMutationFailure {
  ok: false;
  error: MutationError;
}

interface JsxMutationSuccess {
  ok: true;
  value: TextCanarySuccess;
}

type JsxMutationResult = JsxMutationFailure | JsxMutationSuccess;

function literal(value: string): string {
  return JSON.stringify(value.replaceAll("\\", "/"));
}

function invalidRequest(context: SafeMutationContext, request: TextCanaryRequest, message: string): MutationResult<TextCanarySuccess> {
  return {
    ok: false,
    contextState: context.state,
    error: mutationError("MUTATION_SCOPE_VIOLATION", "preflight", request.operation, message),
  };
}

function validateRequest(context: SafeMutationContext, request: TextCanaryRequest): MutationResult<TextCanarySuccess> | null {
  if (request.classification && (
    request.classification.access !== "DOCUMENT_WRITE"
    || request.classification.impact !== "CONTENT"
    || request.classification.destructive
  )) return invalidRequest(context, request, "The text canary only permits non-destructive document content writes.");
  if (!Array.isArray(request.targets) || request.targets.length === 0) return invalidRequest(context, request, "At least one deterministic target is required.");
  if (typeof request.nextContents !== "string") return invalidRequest(context, request, "Text replacement must be a string.");
  for (const target of request.targets) {
    if (target.kind === "index" && (!Number.isInteger(target.index) || target.index < 0)) {
      return invalidRequest(context, request, "Text frame index must be a non-negative integer.");
    }
    if (target.kind === "name" && target.name.trim() === "") return invalidRequest(context, request, "Text frame name is required.");
    if (target.kind === "locator" && target.locator.kind !== "document-session-structural") {
      return invalidRequest(context, request, "Only a document/session structural locator is supported.");
    }
    if (target.expected.contents === undefined) return invalidRequest(context, request, "Expected current text contents are required before writing.");
  }
  return null;
}

function buildTextCanaryJsx(request: TextCanaryRequest): string {
  const payload = JSON.stringify(request.targets);
  return `
    function mutationFailure(code, stage, message, partialMutationPossible, recovery) {
      return { ok: false, error: { code: code, stage: stage, operation: ${JSON.stringify(request.operation)}, message: message, partialMutationPossible: partialMutationPossible, recovery: recovery } };
    }
    function plainBounds(item) {
      try {
        var b = item.geometricBounds;
        return { left: b[0], top: b[1], right: b[2], bottom: b[3], width: Math.abs(b[2] - b[0]), height: Math.abs(b[1] - b[3]) };
      } catch (e) { return null; }
    }
    function directItems(container) {
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
    function effectiveEditable(item) {
      var current = item;
      for (var depth = 0; current && depth < 32; depth++) {
        try { if (current.locked === true) return false; } catch (e1) {}
        try { if (current.hidden === true) return false; } catch (e2) {}
        try { if (current.typename === 'Layer' && current.visible === false) return false; } catch (e3) {}
        var parent = null;
        try { parent = current.parent; } catch (e4) { break; }
        if (!parent || parent === current) break;
        current = parent;
      }
      return true;
    }
    function expectedMatches(item, expected, layerPath) {
      if (!expected) return true;
      try { if (expected.typename !== undefined && item.typename !== expected.typename) return false; } catch (e1) { return false; }
      try { if (expected.name !== undefined && (item.name || '') !== expected.name) return false; } catch (e2) { return false; }
      if (expected.layerPath !== undefined && layerPath !== expected.layerPath) return false;
      try { if (expected.contents !== undefined && item.contents !== expected.contents) return false; } catch (e3) { return false; }
      try { if (expected.locked !== undefined && item.locked !== expected.locked) return false; } catch (e4) { return false; }
      try { if (expected.hidden !== undefined && item.hidden !== expected.hidden) return false; } catch (e5) { return false; }
      if (expected.bounds !== undefined) {
        var actualBounds = plainBounds(item);
        if (!actualBounds || actualBounds.left !== expected.bounds.left || actualBounds.top !== expected.bounds.top || actualBounds.right !== expected.bounds.right || actualBounds.bottom !== expected.bounds.bottom) return false;
      }
      return true;
    }
    function resolveLocator(doc, locator) {
      var matches = [];
      var pathFound = false;
      function visit(container, layerPath, ancestry, collectionPath) {
        var items = directItems(container);
        for (var i = 0; i < items.length; i++) {
          var item = items[i];
          var itemPath = collectionPath + '/pageItems/' + i;
          if (itemPath === locator.collectionPath) {
            pathFound = true;
            var typename = 'Unknown';
            var name = '';
            try { typename = item.typename || 'Unknown'; } catch (e1) {}
            try { name = item.name || ''; } catch (e2) {}
            if (typename === locator.typename && (locator.name === null || locator.name === name) && layerPath === locator.layerPath) {
              matches.push({ item: item, layerPath: layerPath });
            }
          }
          try { if (item.typename === 'GroupItem') visit(item, layerPath, ancestry.concat([itemPath]), itemPath); } catch (e3) {}
        }
      }
      function visitLayer(layer, layerPath, ancestry) {
        visit(layer, layerPath, ancestry, 'layers/' + layerPath);
        try { for (var j = 0; j < layer.layers.length; j++) visitLayer(layer.layers[j], layerPath + '/' + j, ancestry.concat(['layer:' + layerPath + '/' + j])); } catch (e4) {}
      }
      for (var li = 0; li < doc.layers.length; li++) visitLayer(doc.layers[li], String(li), ['layer:' + li]);
      if (matches.length === 1) return { match: matches[0], code: null };
      if (matches.length > 1) return { match: null, code: 'TARGET_AMBIGUOUS' };
      return { match: null, code: pathFound ? 'TARGET_STALE' : 'TARGET_NOT_FOUND' };
    }
    if (app.documents.length === 0) return mutationFailure('NO_DOCUMENT', 'preflight', 'No active Illustrator document.', false, 'Open the verified work copy and create a new mutation context.');
    var d = app.activeDocument;
    var activePath = null;
    try { activePath = d.fullName.fsName.replace(/\\\\/g, '/'); } catch (e) {}
    if (activePath === null) return mutationFailure('ACTIVE_DOCUMENT_MISMATCH', 'preflight', 'Active document must be path-backed.', false, 'Open the verified work copy and create a new context.');
    if (activePath !== ${literal(request.workPath)}) return mutationFailure('ACTIVE_DOCUMENT_MISMATCH', 'preflight', 'Active document is not the authorized work copy.', false, 'Activate the authorized work copy and retry with a new context if needed.');
    var targets = ${payload};
    var resolved = [];
    // Resolve and validate every target before the first document mutation.
    for (var ti = 0; ti < targets.length; ti++) {
      var target = targets[ti];
      var found = null;
      var layerPath = null;
      if (target.kind === 'index') {
        if (target.index >= d.textFrames.length) return mutationFailure('TARGET_NOT_FOUND', 'resolution', 'Text frame index is not present.', false, 'Re-read text frames and select a current deterministic target.');
        found = d.textFrames[target.index];
      } else if (target.kind === 'name') {
        var namedMatches = [];
        for (var ni = 0; ni < d.textFrames.length; ni++) if ((d.textFrames[ni].name || '') === target.name) namedMatches.push(d.textFrames[ni]);
        if (namedMatches.length === 0) return mutationFailure('TARGET_NOT_FOUND', 'resolution', 'Named text frame is not present.', false, 'Re-read text frames and select a current deterministic target.');
        if (namedMatches.length > 1) return mutationFailure('TARGET_AMBIGUOUS', 'resolution', 'Named text frame is not unique.', false, 'Use a structural locator or an unambiguous target.');
        found = namedMatches[0];
      } else {
        var located = resolveLocator(d, target.locator);
        if (located.code) return mutationFailure(located.code, 'resolution', 'Structural locator did not resolve uniquely.', false, 'Re-read the document structure and use a fresh locator.');
        found = located.match.item;
        layerPath = located.match.layerPath;
      }
      try { if (found.typename !== 'TextFrame') return mutationFailure('TARGET_STALE', 'resolution', 'Resolved object is no longer a text frame.', false, 'Re-read the document structure and use a fresh locator.'); } catch (e1) { return mutationFailure('TARGET_STALE', 'resolution', 'Resolved object cannot be inspected.', false, 'Re-read the document structure and use a fresh locator.'); }
      if (!expectedMatches(found, target.expected, layerPath)) return mutationFailure('EXPECTED_STATE_MISMATCH', 'expected-state', 'Target current state does not match the verified snapshot.', false, 'Re-read the target and submit a new expected state.');
      if (!effectiveEditable(found)) return mutationFailure('TARGET_NOT_EDITABLE', 'editability', 'Target or its containing group/layer is locked or hidden.', false, 'Unlock and show the target hierarchy manually, then re-read it.');
      resolved.push({ item: found, index: target.kind === 'index' ? target.index : null });
    }
    for (var wi = 0; wi < resolved.length; wi++) resolved[wi].item.contents = ${JSON.stringify(request.nextContents)};
    var out = [];
    for (var vi = 0; vi < resolved.length; vi++) {
      var verified = resolved[vi].item;
      if (verified.contents !== ${JSON.stringify(request.nextContents)}) return mutationFailure('POST_CONDITION_FAILED', 'post-condition', 'Text contents did not match the requested replacement after mutation.', true, 'Quarantine this work copy and recreate it from MASTER before retrying.');
      var verifiedName = null;
      try { verifiedName = verified.name || ''; } catch (e2) {}
      out.push({ index: resolved[vi].index, name: verifiedName, contents: verified.contents });
    }
    return { ok: true, value: { mutatedCount: out.length, targets: out } };
  `;
}

export async function executeTextCanary(
  bridge: IllustratorBridge,
  context: SafeMutationContext,
  request: TextCanaryRequest,
): Promise<MutationResult<TextCanarySuccess>> {
  const identityFailure = context.prepare(request.operation, request.workPath);
  if (identityFailure) return { ok: false, error: identityFailure, contextState: context.state };
  const requestFailure = validateRequest(context, request);
  if (requestFailure) return requestFailure;

  const transport = await bridge.execute<JsxMutationResult>(buildTextCanaryJsx(request), 30_000);
  if (!transport.ok || !transport.value) {
    context.quarantine();
    const bridgeError = transport.error ?? "Mutation transport returned no result.";
    const timedOut = bridgeError.includes("ILLUSTRATOR_TIMEOUT");
    return {
      ok: false,
      contextState: context.state,
      error: mutationError(
        timedOut ? "MUTATION_OUTCOME_UNKNOWN" : "ILLUSTRATOR_EXECUTION_FAILED",
        "transport",
        request.operation,
        bridgeError,
        true,
        "Do not retry automatically. Quarantine this work copy and create a new verified context.",
        { bridgeError },
      ),
    };
  }
  if (!transport.value.ok) {
    if (transport.value.error.partialMutationPossible) context.quarantine();
    return { ok: false, error: transport.value.error, contextState: context.state };
  }
  if ((request.classification ?? TEXT_CONTENT_MUTATION).impact === "STRUCTURE") context.markStructuralMutation();
  return { ok: true, value: transport.value.value, contextState: context.state };
}
