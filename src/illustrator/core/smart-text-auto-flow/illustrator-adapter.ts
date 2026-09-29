import { executeJsx, type JsxResult } from '../ie3jp/executor/jsx-runner.js';
import {
  createVerticalFlowIllustratorAdapter,
  type VerticalFlowIllustratorItem,
  type VerticalFlowJsxRunner,
} from '../ie3jp/tools/modify/vertical-flow-illustrator-adapter.js';
import type { LayoutBounds, LayoutItemSnapshot } from './types.js';
import type { SmartTextAutoFlowAdapter, SmartTextMutationSnapshot, SmartTextState } from './transaction.js';

export const SMART_TEXT_OPERATION_TIMEOUT_MS = 60_000;

/**
 * Bounded snapshot/restore companion to the frozen C5 adapter.  It deliberately
 * uses no persistent Illustrator wrappers and does not alter shared transport.
 */
export const smartTextAutoFlowJsxCode = `
var preflight = preflightChecks();
if (preflight) writeResultFile(RESULT_PATH, preflight);
else try {
  var params = readParamsFile(PARAMS_PATH), doc = app.activeDocument;
  function fail(message) { throw new Error(message); }
  function number(value, label) { if (typeof value !== "number" || !isFinite(value)) fail(label + " is unreadable"); return value; }
  function uuidFor(item) { var uuid = _getNativeUUID(item) || extractUUIDFromNote(item.note || ""); if (!uuid) fail("UUID is unavailable"); return uuid; }
  function bounds(item) {
    var raw = item.geometricBounds;
    if (!raw || raw.length !== 4) fail("geometric bounds are unreadable");
    var left=number(raw[0], "bounds left"), top=number(raw[1], "bounds top"), right=number(raw[2], "bounds right"), bottom=number(raw[3], "bounds bottom");
    if (right <= left || top <= bottom) fail("bounds must be positive");
    return { left:left, top:top, right:right, bottom:bottom, width:right-left, height:top-bottom };
  }
  function textBounds(frame) {
    if (frame.typename !== "TextFrame" || frame.kind !== TextType.AREATEXT) return bounds(frame);
    var path = frame.textPath, left=number(path.left, "text left"), top=number(path.top, "text top"), width=number(path.width, "text width"), height=number(path.height, "text height");
    if (width <= 0 || height <= 0) fail("AreaText bounds must be positive");
    return { left:left, top:top, right:left+width, bottom:top-height, width:width, height:height };
  }
  function singleOversetObservation(frame) {
    var complete=frame.textRange, lines=frame.lines;
    var contents=complete ? complete.contents : null, end=complete ? complete.end : null;
    if (typeof contents !== "string" || typeof end !== "number" || !lines || typeof lines.length !== "number") fail("AreaText visible-line fit state is unreadable");
    if (lines.length === 0) return true;
    var last=lines[lines.length-1], lastEnd=last ? last.end : null;
    if (typeof lastEnd !== "number") fail("Last visible AreaText line endpoint is unreadable");
    var ignoredReturn=contents.charAt(contents.length-1) === "\\r" && lastEnd === end-1;
    return !(lastEnd === end || ignoredReturn);
  }
  function parentGroups(item) {
    var result=[], current=item.parent;
    while (current && current.typename !== "Document" && current.typename !== "Layer") {
      if (current.typename === "GroupItem") result.push(uuidFor(current));
      current=current.parent;
    }
    return result;
  }
  function itemType(item) {
    if (item.typename === "TextFrame") return item.kind === TextType.AREATEXT ? "AREA_TEXT" : "POINT_TEXT";
    if (item.typename === "GroupItem") return "GROUP";
    if (item.typename === "PathItem") return "PATH";
    if (item.typename === "CompoundPathItem") return "COMPOUND_PATH";
    if (item.typename === "PlacedItem" || item.typename === "RasterItem") return "IMAGE";
    return "OTHER";
  }
  function effectiveBoolean(item, key) {
    var current=item;
    while (current && current.typename !== "Document") { try { if (current[key] === true) return true; } catch (_) { return true; } current=current.parent; }
    return false;
  }
  function snapshotItem(item) {
    var type=itemType(item), b=type === "AREA_TEXT" ? textBounds(item) : bounds(item), clipped=false;
    try { clipped=item.typename === "GroupItem" && item.clipped === true; } catch (_) { clipped=true; }
    return { uuid:uuidFor(item), type:type, bounds:b, artboardIndex:getArtboardIndexForItem(item), parentGroupUuids:parentGroups(item), locked:effectiveBoolean(item, "locked"), hidden:effectiveBoolean(item, "hidden"), clipped:clipped, isClippingGroup:clipped, role:"CONTENT" };
  }
  var characterKeys=["size","leading","autoLeading","tracking","horizontalScale","verticalScale","baselineShift","rotation","underline","strikeThrough","noBreak","language","Tsume","akiLeft","akiRight","proportionalMetrics","overprintFill","overprintStroke","ligature","discretionaryLigature","contextualLigature","fractions","ordinals","swash","titling","connectionForms","stylisticAlternates","alternateGlyphs","figureStyle","strokeWeight"];
  var paragraphKeys=["firstLineIndent","leftIndent","rightIndent","spaceBefore","spaceAfter","hyphenation","hyphenateCapitalizedWords","hyphenateLimit","hyphenationPreference","hyphenationZone","maximumConsecutiveHyphens","minimumBeforeHyphen","minimumAfterHyphen","minimumWordLength","desiredWordSpacing","minimumWordSpacing","maximumWordSpacing","desiredLetterSpacing","minimumLetterSpacing","maximumLetterSpacing","desiredGlyphScaling","minimumGlyphScaling","maximumGlyphScaling","everyLineComposer","autoLeadingAmount","bunriKinshi","kinsokuOrder","kurikaeshiMojiShori","mojikumi"];
  function savedColor(color) { try { return colorToObject(color); } catch (_) { return null; } }
  function restoredColor(value) { if (!value || value.type === "none") return new NoColor(); if (value.type === "rgb") { var rgb=new RGBColor(); rgb.red=value.r; rgb.green=value.g; rgb.blue=value.b; return rgb; } if (value.type === "cmyk") { var cmyk=new CMYKColor(); cmyk.cyan=value.c; cmyk.magenta=value.m; cmyk.yellow=value.y; cmyk.black=value.k; return cmyk; } if (value.type === "gray") { var gray=new GrayColor(); gray.gray=value.value; return gray; } return null; }
  function attrsState(attrs) { var result={}; for (var i=0;i<characterKeys.length;i++) { var key=characterKeys[i]; try { var value=attrs[key]; if (typeof value === "number" || typeof value === "boolean" || typeof value === "string") result[key]=value; } catch (_) {} } try { result.fontName=attrs.textFont.name; } catch (_) {} try { result.capitalization=attrs.capitalization; } catch (_) {} try { result.baselinePosition=attrs.baselinePosition; } catch (_) {} try { result.kerningMethod=attrs.kerningMethod; } catch (_) {} result.fillColor=savedColor(attrs.fillColor); result.strokeColor=savedColor(attrs.strokeColor); return result; }
  function paragraphState(attrs) { var result={}; for (var i=0;i<paragraphKeys.length;i++) { var key=paragraphKeys[i]; try { var value=attrs[key]; if (typeof value === "number" || typeof value === "boolean" || typeof value === "string") result[key]=value; } catch (_) {} } try { result.justification=attrs.justification; } catch (_) {} try { result.singleWordJustification=attrs.singleWordJustification; } catch (_) {} try { result.leadingType=attrs.leadingType; } catch (_) {} return result; }
  function textState(frame) {
    var chars=[], paragraphs=[], b=textBounds(frame);
    for (var ci=0;ci<frame.characters.length;ci++) { var character=frame.characters[ci], state=attrsState(character.characterAttributes); try { state.kerning=character.kerning; } catch (_) {} chars.push(state); }
    for (var pi=0;pi<frame.paragraphs.length;pi++) paragraphs.push(paragraphState(frame.paragraphs[pi].paragraphAttributes));
    return { uuid:uuidFor(frame), height:b.height, contents:String(frame.contents), formatting:{chars:chars, paragraphs:paragraphs} };
  }
  function applyAttrs(attrs, state) { for (var key in state) if (key !== "fontName" && key !== "kerning" && key !== "fillColor" && key !== "strokeColor") { try { attrs[key]=state[key]; } catch (_) {} } if (state.fontName) try { attrs.textFont=app.textFonts.getByName(state.fontName); } catch (_) {} var fill=restoredColor(state.fillColor), stroke=restoredColor(state.strokeColor); if (fill) try { attrs.fillColor=fill; } catch (_) {} if (stroke) try { attrs.strokeColor=stroke; } catch (_) {} }
  function restoreText(state) {
    var frame=findItemByUUID(state.uuid); if (!frame || frame.typename !== "TextFrame") fail("TextFrame restore target is unavailable");
    frame.contents=state.contents;
    var chars=state.formatting && state.formatting.chars ? state.formatting.chars : [], paragraphs=state.formatting && state.formatting.paragraphs ? state.formatting.paragraphs : [];
    if (frame.characters.length !== chars.length || frame.paragraphs.length !== paragraphs.length) fail("AreaText restore text structure changed");
    for (var ci=0;ci<chars.length;ci++) { applyAttrs(frame.characters[ci].characterAttributes, chars[ci]); if (typeof chars[ci].kerning !== "undefined") try { frame.characters[ci].kerning=chars[ci].kerning; } catch (_) {} }
    for (var pi=0;pi<paragraphs.length;pi++) applyAttrs(frame.paragraphs[pi].paragraphAttributes, paragraphs[pi]);
    if (frame.kind === TextType.AREATEXT) frame.textPath.height=number(state.height, "restore height"); app.redraw();
    var restored=textBounds(frame); if (Math.abs(restored.height-state.height)>0.01 || String(frame.contents)!==String(state.contents)) fail("AreaText restore did not verify");
  }
  function collectItems() {
    var result=[], seen={};
    function visit(item) { var uuid=uuidFor(item); if (seen[uuid]) return; seen[uuid]=true; result.push(snapshotItem(item)); if (item.typename === "GroupItem") for (var i=0;i<item.pageItems.length;i++) visit(item.pageItems[i]); }
    for (var li=0;li<doc.layers.length;li++) for (var pi=0;pi<doc.layers[li].pageItems.length;pi++) visit(doc.layers[li].pageItems[pi]);
    return result;
  }
  if (params.operation === "snapshot") {
    var ids=params.uuids || [], states=[];
    if (!ids.length) fail("AreaText target UUIDs are required");
    for (var i=0;i<ids.length;i++) { var frame=findItemByUUID(ids[i]); if (!frame || frame.typename !== "TextFrame") fail("Target is not TextFrame: " + ids[i]); states.push(textState(frame)); }
    writeResultFile(RESULT_PATH,{items:collectItems(),textStates:states});
  } else if (params.operation === "restore") {
    var statesToRestore=params.textStates || [];
    for (var ri=0;ri<statesToRestore.length;ri++) restoreText(statesToRestore[ri]);
    writeResultFile(RESULT_PATH,{restored:true});
  } else if (params.operation === "verify_restore") {
    var checks=params.textStates || [], verified=true;
    for (var vi=0;vi<checks.length;vi++) { var check=findItemByUUID(checks[vi].uuid); if (!check || check.typename !== "TextFrame") { verified=false; break; } var current=textBounds(check); if (Math.abs(current.height-checks[vi].height)>0.01 || String(check.contents)!==String(checks[vi].contents)) { verified=false; break; } }
    writeResultFile(RESULT_PATH,{verified:verified});
  } else if (params.operation === "observe_set_height") {
    var observed=findItemByUUID(params.uuid);
    if (!observed || observed.typename !== "TextFrame" || observed.kind !== TextType.AREATEXT) fail("Target is not AreaText");
    var requestedHeight=number(params.height, "AreaText height");
    if (requestedHeight <= 0) fail("AreaText height must be positive");
    observed.textPath.height=requestedHeight;
    app.redraw();
    var actualHeight=textBounds(observed).height;
    var first=singleOversetObservation(observed), second=singleOversetObservation(observed);
    if (first !== second) fail("AreaText overset observation did not stabilize");
    writeResultFile(RESULT_PATH,{requestedHeight:requestedHeight,actualHeight:actualHeight,overset:first});
  } else if (params.operation === "selected_text_uuids") {
    var selected=[]; for (var si=0;si<doc.selection.length;si++) if (doc.selection[si].typename === "TextFrame") selected.push(uuidFor(doc.selection[si]));
    writeResultFile(RESULT_PATH,{uuids:selected});
  } else fail("Unknown smart text auto flow operation");
} catch (error) { writeResultFile(RESULT_PATH,{error:true,message:"smart text auto flow adapter failed: "+error.message,line:error.line}); }
`;

function asObject(result: JsxResult, operation: string): Record<string, unknown> {
  if (!result || typeof result !== 'object' || Array.isArray(result)) throw new Error(`${operation} returned invalid data`);
  return result;
}

function number(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`${label} is unreadable`);
  return value;
}

function layoutBounds(value: unknown): LayoutBounds {
  if (!value || typeof value !== 'object') throw new Error('item bounds are unreadable');
  const bounds = value as Record<string, unknown>;
  return { left: number(bounds.left, 'bounds.left'), top: number(bounds.top, 'bounds.top'), right: number(bounds.right, 'bounds.right'), bottom: number(bounds.bottom, 'bounds.bottom'), width: number(bounds.width, 'bounds.width'), height: number(bounds.height, 'bounds.height') };
}

function itemSnapshot(value: unknown): LayoutItemSnapshot {
  if (!value || typeof value !== 'object') throw new Error('layout item is unreadable');
  const item = value as Record<string, unknown>;
  const validTypes = new Set(['AREA_TEXT', 'POINT_TEXT', 'GROUP', 'PATH', 'COMPOUND_PATH', 'IMAGE', 'OTHER']);
  if (typeof item.uuid !== 'string' || !validTypes.has(String(item.type)) || !Array.isArray(item.parentGroupUuids)) throw new Error('layout item identity is unreadable');
  return {
    uuid: item.uuid,
    type: item.type as LayoutItemSnapshot['type'],
    bounds: layoutBounds(item.bounds),
    artboardIndex: typeof item.artboardIndex === 'number' ? item.artboardIndex : undefined,
    parentGroupUuids: item.parentGroupUuids.map((uuid) => {
      if (typeof uuid !== 'string') throw new Error('parent group UUID is unreadable');
      return uuid;
    }),
    locked: item.locked === true,
    hidden: item.hidden === true,
    clipped: item.clipped === true,
    isClippingGroup: item.isClippingGroup === true,
    role: item.role === 'DECORATIVE' || item.role === 'BACKGROUND' || item.role === 'UNKNOWN' ? item.role : 'CONTENT',
  };
}

function textState(value: unknown): SmartTextState {
  if (!value || typeof value !== 'object') throw new Error('text state is unreadable');
  const state = value as Record<string, unknown>;
  if (typeof state.uuid !== 'string' || typeof state.contents !== 'string') throw new Error('text state identity is unreadable');
  return { uuid: state.uuid, contents: state.contents, height: number(state.height, 'text height'), formatting: state.formatting };
}

function observedSetHeight(value: Record<string, unknown>, requestedHeight: number): {
  requestedHeight: number;
  actualHeight: number;
  overset: boolean;
} {
  const returnedRequestedHeight = number(value.requestedHeight, 'observe_set_height requested height');
  const actualHeight = number(value.actualHeight, 'observe_set_height actual height');
  if (
    Math.abs(returnedRequestedHeight - requestedHeight) > 0.01 ||
    Math.abs(actualHeight - requestedHeight) > 0.01
  ) {
    throw new Error('observe_set_height did not verify requested height');
  }
  if (typeof value.overset !== 'boolean') throw new Error('observe_set_height returned unreadable overset state');
  return { requestedHeight: returnedRequestedHeight, actualHeight, overset: value.overset };
}

export function createSmartTextAutoFlowIllustratorAdapter(
  runJsx: VerticalFlowJsxRunner = executeJsx,
): SmartTextAutoFlowAdapter<VerticalFlowIllustratorItem> {
  const vertical = createVerticalFlowIllustratorAdapter(runJsx);
  const execute = async (operation: string, extra: Record<string, unknown> = {}): Promise<Record<string, unknown>> =>
    asObject(await runJsx(smartTextAutoFlowJsxCode, { operation, ...extra }, { timeout: SMART_TEXT_OPERATION_TIMEOUT_MS, activate: false }), operation);
  return {
    ...vertical,
    async observeSetHeight(target, height) {
      return observedSetHeight(
        await execute('observe_set_height', { uuid: target.uuid, height }),
        height,
      );
    },
    async snapshotMutation(targetUuids): Promise<SmartTextMutationSnapshot> {
      const result = await execute('snapshot', { uuids: targetUuids });
      if (!Array.isArray(result.items) || !Array.isArray(result.textStates)) throw new Error('snapshot returned invalid data');
      return { items: result.items.map(itemSnapshot), textStates: result.textStates.map(textState) };
    },
    async restoreTextStates(states): Promise<void> {
      const result = await execute('restore', { textStates: states });
      if (result.restored !== true) throw new Error('text restoration did not verify');
    },
    async verifyTextStates(states): Promise<boolean> {
      return (await execute('verify_restore', { textStates: states })).verified === true;
    },
  };
}

/** Read-only bridge for the legacy selection-based formatted replacement path. */
export async function selectedTextFrameUuids(
  runJsx: VerticalFlowJsxRunner = executeJsx,
): Promise<string[]> {
  const result = asObject(await runJsx(smartTextAutoFlowJsxCode, { operation: 'selected_text_uuids' }, { timeout: SMART_TEXT_OPERATION_TIMEOUT_MS, activate: false }), 'selected_text_uuids');
  if (!Array.isArray(result.uuids) || !result.uuids.every((uuid) => typeof uuid === 'string')) throw new Error('selected_text_uuids returned invalid data');
  return result.uuids as string[];
}
