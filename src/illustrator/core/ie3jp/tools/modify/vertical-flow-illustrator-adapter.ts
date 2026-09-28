import { executeJsx, type JsxResult } from '../../executor/jsx-runner.js';
import { EXPLICIT_BOUNDS_JSX } from '../geometry.js';
import type { AreaTextEligibility, AreaTextSnapshot, AsyncAreaTextMeasurementAdapter } from './area-text-measurement.js';
import type { AsyncVerticalFlowExecutorAdapter, VerticalFlowItemSnapshot } from './vertical-flow-executor.js';

export interface VerticalFlowIllustratorItem {
  uuid: string;
}

export type VerticalFlowJsxRunner = (
  jsxCode: string,
  params?: unknown,
  options?: { timeout?: number; activate?: boolean },
) => Promise<JsxResult>;

const VERTICAL_FLOW_OPERATION_TIMEOUT_MS = 60_000;

/**
 * One small, operation-dispatched JSX surface for the frozen async adapter.
 * Each invocation resolves its UUID afresh, so no Illustrator DOM wrapper is
 * retained between executeJsx calls.
 */
export const verticalFlowAdapterJsxCode = `
var preflight = preflightChecks();
if (preflight) writeResultFile(RESULT_PATH, preflight);
else try {
  var params = readParamsFile(PARAMS_PATH);
  ${EXPLICIT_BOUNDS_JSX}

  function fail(message) { throw new Error(message); }
  function number(value, label) {
    if (typeof value !== "number" || !isFinite(value)) fail(label + " is unreadable");
    return value;
  }
  function readBoolean(value, label) {
    if (typeof value !== "boolean") fail(label + " is unreadable");
    return value;
  }
  function itemFor(uuid) {
    if (typeof uuid !== "string" || uuid.length === 0) fail("UUID is required");
    return findItemByUUID(uuid);
  }
  function requiredItem(uuid) {
    var item = itemFor(uuid);
    if (!item) fail("Object not found: " + uuid);
    return item;
  }
  function areaText(item) {
    if (!item || item.typename !== "TextFrame" || item.kind !== TextType.AREATEXT) fail("Target is not AreaText");
    return item;
  }
  function textPathBounds(frame) {
    var path = frame.textPath;
    var left = number(path.left, "AreaText TextPath left");
    var top = number(path.top, "AreaText TextPath top");
    var width = number(path.width, "AreaText TextPath width");
    var height = number(path.height, "AreaText TextPath height");
    if (width <= 0 || height <= 0) fail("AreaText TextPath dimensions must be positive");
    return { left:left, top:top, right:left + width, bottom:top - height, width:width, height:height };
  }
  function ancestorUuids(item) {
    var uuids = [], current = item.parent;
    while (current && current.typename !== "Document" && current.typename !== "Layer") {
      if (current.typename === "GroupItem") {
        var uuid = _getNativeUUID(current) || extractUUIDFromNote(current.note || "");
        if (!uuid) fail("Ancestor UUID is unavailable");
        uuids.push(uuid);
      }
      current = current.parent;
    }
    return uuids;
  }
  function isMovable(item) {
    if (item.locked === true || item.hidden === true) return false;
    var current = item.parent;
    while (current && current.typename !== "Document") {
      if (current.locked === true || current.hidden === true) return false;
      if (current.typename === "GroupItem" && current.clipped === true) return false;
      current = current.parent;
    }
    return true;
  }
  function itemSnapshot(uuid) {
    var item = requiredItem(uuid);
    var isArea = item.typename === "TextFrame" && item.kind === TextType.AREATEXT;
    var bounds = isArea ? textPathBounds(item) : dpmReadBounds(item, "geometric");
    if (bounds.width <= 0 || bounds.height <= 0) fail("Object bounds must be positive");
    var movable = isMovable(item);
    return { uuid:uuid, bounds:{ left:bounds.left, top:bounds.top, right:bounds.right, bottom:bounds.bottom }, kind:isArea ? "AREA_TEXT" : "FIXED", editable:movable, movable:movable, ancestorUuids:ancestorUuids(item) };
  }
  function formatting(frame) {
    var fontSizes = [], leading = [], autoLeading = [], tracking = [], paragraphs = [];
    for (var ci = 0; ci < frame.characters.length; ci++) {
      var attrs = frame.characters[ci].characterAttributes;
      if (!attrs) fail("Character attributes are unreadable");
      fontSizes.push(number(attrs.size, "Character font size"));
      var currentLeading = attrs.leading;
      leading.push(typeof currentLeading === "number" && isFinite(currentLeading) ? currentLeading : null);
      autoLeading.push(readBoolean(attrs.autoLeading, "Character auto leading"));
      var currentTracking = attrs.tracking;
      tracking.push(typeof currentTracking === "number" && isFinite(currentTracking) ? currentTracking : null);
    }
    for (var pi = 0; pi < frame.paragraphs.length; pi++) {
      var paragraph = frame.paragraphs[pi].paragraphAttributes;
      if (!paragraph) fail("Paragraph attributes are unreadable");
      paragraphs.push({ justification:String(paragraph.justification), spaceBefore:paragraph.spaceBefore, spaceAfter:paragraph.spaceAfter });
    }
    return { fontSizes:fontSizes, leading:leading, autoLeading:autoLeading, tracking:tracking, paragraphs:paragraphs };
  }
  function areaSnapshot(uuid) {
    var frame = areaText(requiredItem(uuid));
    var bounds = textPathBounds(frame);
    var contents = frame.contents;
    if (typeof contents !== "string") fail("AreaText contents are unreadable");
    return { uuid:uuid, top:bounds.top, left:bounds.left, width:bounds.width, height:bounds.height, contents:contents, formatting:formatting(frame) };
  }
  function singleOversetObservation(frame) {
    var complete = frame.textRange, lines = frame.lines;
    var contents = complete ? complete.contents : null;
    var end = complete ? complete.end : null;
    if (typeof contents !== "string" || typeof end !== "number" || !lines || typeof lines.length !== "number") fail("AreaText visible-line fit state is unreadable");
    if (lines.length === 0) return true;
    var last = lines[lines.length - 1];
    var lastEnd = last ? last.end : null;
    if (typeof lastEnd !== "number") fail("Last visible AreaText line endpoint is unreadable");
    var ignoredReturn = contents.charAt(contents.length - 1) === "\\r" && lastEnd === end - 1;
    return !(lastEnd === end || ignoredReturn);
  }
  function overset(uuid) {
    var frame = areaText(requiredItem(uuid));
    // AreaText lines can remain stale across separate async JSX invocations
    // immediately after TextPath geometry changes. Match the proven C3
    // discipline: force Illustrator to lay out, then require two independent
    // visible-line observations from the same current DOM wrapper to agree.
    app.redraw();
    var firstHeight = textPathBounds(frame).height;
    var firstOverset = singleOversetObservation(frame);
    app.redraw();
    var secondHeight = textPathBounds(frame).height;
    var secondOverset = singleOversetObservation(frame);
    if (Math.abs(firstHeight - secondHeight) > 0.01) fail("AreaText height changed during overset stabilization");
    if (firstOverset !== secondOverset) fail("AreaText overset observation did not stabilize");
    return { overset:secondOverset, observationCount:2, actualHeight:secondHeight };
  }
  function probeHeight(uuid, requestedHeight) {
    var frame = areaText(requiredItem(uuid));
    var height = number(requestedHeight, "AreaText height");
    if (height <= 0) fail("AreaText height must be positive");
    frame.textPath.height = height;
    app.redraw();
    var actualHeight = textPathBounds(frame).height;
    if (Math.abs(actualHeight - height) > 0.01) fail("AreaText TextPath height did not verify");
    return { requestedHeight:height, actualHeight:actualHeight, overset:singleOversetObservation(frame) };
  }
  function eligibility(uuid) {
    var item = requiredItem(uuid);
    if (item.typename !== "TextFrame") return { eligible:false, reason:"Target is not a TextFrame" };
    if (item.kind !== TextType.AREATEXT) return { eligible:false, reason:"Target is not AreaText" };
    if (!isMovable(item)) return { eligible:false, reason:"Target is locked, hidden, clipped, or has unsafe ancestry" };
    try {
      var count = item.story.textFrames.length;
      if (typeof count !== "number" || count < 0 || Math.floor(count) !== count) return { eligible:false, reason:"Unable to determine AreaText threading state" };
      return count === 1 ? { eligible:true } : { eligible:false, reason:"Threaded AreaText is unsupported" };
    } catch (_) { return { eligible:false, reason:"Unable to determine AreaText threading state" }; }
  }

  var result;
  if (params.operation === "resolve") result = { found:Boolean(itemFor(params.uuid)) };
  else if (params.operation === "snapshot_item") result = itemSnapshot(params.uuid);
  else if (params.operation === "check_eligibility") result = eligibility(params.uuid);
  else if (params.operation === "snapshot_area_text") result = areaSnapshot(params.uuid);
  else if (params.operation === "is_overset") result = overset(params.uuid);
  else if (params.operation === "probe_height") result = probeHeight(params.uuid, params.height);
  else if (params.operation === "set_height") {
    var frame = areaText(requiredItem(params.uuid));
    var height = number(params.height, "AreaText height");
    if (height <= 0) fail("AreaText height must be positive");
    frame.textPath.height = height;
    if (Math.abs(frame.textPath.height - height) > 0.01) fail("AreaText TextPath height did not verify");
    app.redraw();
    result = { applied:true };
  } else if (params.operation === "translate_y") {
    var target = requiredItem(params.uuid);
    var deltaY = number(params.delta_y, "Vertical translation");
    target.translate(0, deltaY);
    result = { applied:true };
  } else fail("Unknown vertical-flow adapter operation");
  writeResultFile(RESULT_PATH, result);
} catch (error) {
  writeResultFile(RESULT_PATH, { error:true, message:"layout_vertical_flow adapter failed: " + error.message, line:error.line });
}
`;

function objectResult(result: JsxResult, operation: string): Record<string, unknown> {
  if (!result || typeof result !== 'object' || Array.isArray(result)) throw new Error(`${operation} returned an invalid JSX result`);
  return result;
}

function readBoolean(result: Record<string, unknown>, key: string, operation: string): boolean {
  if (typeof result[key] !== 'boolean') throw new Error(`${operation} returned an unreadable ${key}`);
  return result[key] as boolean;
}

function readNumber(result: Record<string, unknown>, key: string, operation: string): number {
  if (typeof result[key] !== 'number' || !Number.isFinite(result[key])) throw new Error(`${operation} returned an unreadable ${key}`);
  return result[key] as number;
}

function readStabilizedOverset(result: Record<string, unknown>): boolean {
  if (readNumber(result, 'observationCount', 'is_overset') !== 2) {
    throw new Error('is_overset returned an invalid stabilization observation count');
  }
  return readBoolean(result, 'overset', 'is_overset');
}

function readHeightProbe(result: Record<string, unknown>, requestedHeight: number): { requestedHeight: number; actualHeight: number; overset: boolean } {
  const returnedRequestedHeight = readNumber(result, 'requestedHeight', 'probe_height');
  const actualHeight = readNumber(result, 'actualHeight', 'probe_height');
  if (Math.abs(returnedRequestedHeight - requestedHeight) > 0.01 || Math.abs(actualHeight - requestedHeight) > 0.01) {
    throw new Error('probe_height did not verify the requested AreaText height');
  }
  return { requestedHeight: returnedRequestedHeight, actualHeight, overset: readBoolean(result, 'overset', 'probe_height') };
}

function asSnapshot(result: Record<string, unknown>): VerticalFlowItemSnapshot {
  const bounds = result.bounds as Record<string, unknown> | undefined;
  if (!bounds || typeof result.uuid !== 'string' || (result.kind !== 'AREA_TEXT' && result.kind !== 'FIXED') ||
    !Array.isArray(result.ancestorUuids)) throw new Error('snapshot_item returned invalid item state');
  return {
    uuid: result.uuid,
    bounds: {
      left: readNumber(bounds, 'left', 'snapshot_item'), top: readNumber(bounds, 'top', 'snapshot_item'),
      right: readNumber(bounds, 'right', 'snapshot_item'), bottom: readNumber(bounds, 'bottom', 'snapshot_item'),
    },
    kind: result.kind,
    editable: readBoolean(result, 'editable', 'snapshot_item'),
    movable: readBoolean(result, 'movable', 'snapshot_item'),
    ancestorUuids: result.ancestorUuids.map((uuid) => {
      if (typeof uuid !== 'string') throw new Error('snapshot_item returned an invalid ancestor UUID');
      return uuid;
    }),
  };
}

function asAreaSnapshot(result: Record<string, unknown>): AreaTextSnapshot {
  if (typeof result.uuid !== 'string' || typeof result.contents !== 'string' || !result.formatting || typeof result.formatting !== 'object') {
    throw new Error('snapshot_area_text returned invalid AreaText state');
  }
  return {
    uuid: result.uuid,
    top: readNumber(result, 'top', 'snapshot_area_text'),
    left: readNumber(result, 'left', 'snapshot_area_text'),
    width: readNumber(result, 'width', 'snapshot_area_text'),
    height: readNumber(result, 'height', 'snapshot_area_text'),
    contents: result.contents,
    formatting: result.formatting as AreaTextSnapshot['formatting'],
  };
}

export function createVerticalFlowIllustratorAdapter(
  runJsx: VerticalFlowJsxRunner = executeJsx,
): AsyncVerticalFlowExecutorAdapter<VerticalFlowIllustratorItem> {
  const execute = async (operation: string, extra: Record<string, unknown> = {}): Promise<Record<string, unknown>> =>
    objectResult(await runJsx(verticalFlowAdapterJsxCode, { operation, ...extra }, { timeout: VERTICAL_FLOW_OPERATION_TIMEOUT_MS, activate: false }), operation);
  const areaText: AsyncAreaTextMeasurementAdapter<VerticalFlowIllustratorItem> = {
    async checkEligibility(target): Promise<AreaTextEligibility> {
      const result = await execute('check_eligibility', { uuid: target.uuid });
      const eligible = readBoolean(result, 'eligible', 'check_eligibility');
      if (eligible) return { eligible: true };
      return { eligible: false, reason: typeof result.reason === 'string' ? result.reason : 'AreaText is outside the supported V1 scope' };
    },
    async snapshot(target): Promise<AreaTextSnapshot> {
      return asAreaSnapshot(await execute('snapshot_area_text', { uuid: target.uuid }));
    },
    async probeHeight(target, height) {
      return readHeightProbe(await execute('probe_height', { uuid: target.uuid, height }), height);
    },
    async isOverset(target): Promise<boolean> {
      return readStabilizedOverset(await execute('is_overset', { uuid: target.uuid }));
    },
    async setHeight(target, height): Promise<void> {
      const result = await execute('set_height', { uuid: target.uuid, height });
      if (result.applied !== true) throw new Error('set_height did not confirm application');
    },
  };
  return {
    async resolve(uuid): Promise<VerticalFlowIllustratorItem | null> {
      const result = await execute('resolve', { uuid });
      return readBoolean(result, 'found', 'resolve') ? { uuid } : null;
    },
    async snapshotItem(target): Promise<VerticalFlowItemSnapshot> {
      return asSnapshot(await execute('snapshot_item', { uuid: target.uuid }));
    },
    areaText,
    async translateY(target, deltaY): Promise<void> {
      const result = await execute('translate_y', { uuid: target.uuid, delta_y: deltaY });
      if (result.applied !== true) throw new Error('translate_y did not confirm application');
    },
  };
}
