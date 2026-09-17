import type { IllustratorBridge } from "../../executor/bridge.js";
import type { Bounds, ObjectLocator, ObjectSummary } from "../../executor/read-schema.js";
import { type ExpectedTargetState, type MutationResult, SafeMutationContext, mutationError } from "./context.js";

export type EditableColor =
  | { model: "RGB"; red: number; green: number; blue: number }
  | { model: "CMYK"; cyan: number; magenta: number; yellow: number; black: number }
  | { model: "GRAY"; gray: number }
  | { model: "NONE" };

export interface Styling { fill?: EditableColor; stroke?: EditableColor; strokeWidth?: number; }
export interface PrimitiveBase extends Styling { artboardIndex?: number; name?: string; }
export interface RectangleRequest extends PrimitiveBase { x: number; y: number; width: number; height: number; }
export interface EllipseRequest extends PrimitiveBase { x: number; y: number; width: number; height: number; }
export interface LineRequest extends Omit<PrimitiveBase, "fill"> { x1: number; y1: number; x2: number; y2: number; fill?: never; }
export interface TextFrameRequest extends PrimitiveBase { x: number; y: number; contents: string; fontPostScriptName?: string; fontSize?: number; }
export interface ObjectUpdateRequest { locator: ObjectLocator; expected: ExpectedTargetState; artboardIndex?: number; x?: number; y?: number; width?: number; height?: number; name?: string; }
export interface FillStrokeRequest { locator: ObjectLocator; expected: ExpectedTargetState; fill?: EditableColor; stroke?: EditableColor; strokeWidth?: number; }
export interface TargetRequest { locator: ObjectLocator; expected: ExpectedTargetState; }
export interface SelectObjectsRequest { locators: ObjectLocator[]; replaceSelection?: boolean; }
export interface DuplicateObjectsRequest { targets: TargetRequest[]; offsetX?: number; offsetY?: number; copies?: number; }
export interface GroupObjectsRequest { targets: TargetRequest[]; name?: string; }
export interface UngroupObjectRequest { target: TargetRequest; }
export type AlignmentMode = "LEFT" | "HORIZONTAL_CENTER" | "RIGHT" | "TOP" | "VERTICAL_CENTER" | "BOTTOM";
export type AlignmentReference = "SELECTION_BOUNDS" | "ARTBOARD" | "KEY_OBJECT";
export interface AlignObjectsRequest { targets: TargetRequest[]; mode: AlignmentMode; reference: AlignmentReference; artboardIndex?: number; keyObject?: TargetRequest; }
export interface DistributeObjectsRequest { targets: TargetRequest[]; axis: "HORIZONTAL" | "VERTICAL"; mode: "CENTERS" | "GAPS"; }

interface JsxFailure { ok: false; error: { code: string; stage: string; message: string; partialMutationPossible: boolean; recovery: string }; }
interface JsxSuccess<T> { ok: true; value: T; }
type JsxResult<T> = JsxFailure | JsxSuccess<T>;

function finite(value: unknown): value is number { return typeof value === "number" && Number.isFinite(value); }
function validColor(color: EditableColor | undefined): boolean {
  if (!color) return true;
  if (color.model === "NONE") return true;
  const values = color.model === "RGB" ? [color.red, color.green, color.blue]
    : color.model === "CMYK" ? [color.cyan, color.magenta, color.yellow, color.black] : [color.gray];
  return values.every(finite);
}
function invalid<T>(context: SafeMutationContext, operation: string, message: string): MutationResult<T> {
  return { ok: false, contextState: context.state, error: mutationError("INVALID_REQUEST", "preflight", operation, message) };
}
function literal(value: string): string { return JSON.stringify(value.replaceAll("\\", "/")); }
function transportFailure<T>(context: SafeMutationContext, operation: string, error: string): MutationResult<T> {
  context.quarantine();
  return { ok: false, contextState: context.state, error: mutationError(error.includes("ILLUSTRATOR_TIMEOUT") ? "MUTATION_OUTCOME_UNKNOWN" : "ILLUSTRATOR_EXECUTION_FAILED", "transport", operation, error, true, "Do not retry automatically; create a new verified work-copy session.", { bridgeError: error }) };
}

const JSX_HELPERS = `
  function fail(code, stage, message, partial) { return {ok:false,error:{code:code,stage:stage,message:message,partialMutationPossible:partial,recovery:'Re-read the verified work copy and create a new session if outcome is unknown.'}}; }
  function workDocument(expected) {
    if (app.documents.length === 0) return null;
    var d = app.activeDocument; var actual = null;
    try { actual = d.fullName.fsName.replace(/\\\\/g, '/'); } catch (e) {}
    return actual === expected ? d : null;
  }
  function artboardPoint(d, index, x, y) {
    var actual = index === null ? d.artboards.getActiveArtboardIndex() : index;
    if (actual < 0 || actual >= d.artboards.length) return null;
    var r = d.artboards[actual].artboardRect;
    return { x: r[0] + x, y: r[1] - y, index: actual };
  }
  function color(value) {
    if (!value || value.model === 'NONE') return new NoColor();
    var c;
    if (value.model === 'RGB') { c = new RGBColor(); c.red=value.red; c.green=value.green; c.blue=value.blue; return c; }
    if (value.model === 'CMYK') { c = new CMYKColor(); c.cyan=value.cyan; c.magenta=value.magenta; c.yellow=value.yellow; c.black=value.black; return c; }
    if (value.model === 'GRAY') { c = new GrayColor(); c.gray=value.gray; return c; }
    return null;
  }
  function applyStyle(item, style) {
    if (!style) return true;
    var textAttrs = null;
    try { if (item.typename === 'TextFrame') textAttrs = item.textRange.characterAttributes; } catch (e) {}
    if (style.fill !== undefined) { var f = color(style.fill); if (!f) return false; if (textAttrs) textAttrs.fillColor = f; else { item.filled = style.fill.model !== 'NONE'; item.fillColor = f; } }
    if (style.stroke !== undefined) { var s = color(style.stroke); if (!s) return false; if (textAttrs) textAttrs.strokeColor = s; else { item.stroked = style.stroke.model !== 'NONE'; item.strokeColor = s; } }
    if (style.strokeWidth !== undefined) { if (textAttrs) textAttrs.strokeWeight = style.strokeWidth; else item.strokeWidth = style.strokeWidth; }
    return true;
  }
  function styleMatches(item, style) {
    function same(actual, wanted) {
      if (wanted.model === 'NONE') { try { return actual.typename === 'NoColor'; } catch(e) { return false; } }
      try {
        if (wanted.model === 'RGB') return actual.typename === 'RGBColor' && actual.red === wanted.red && actual.green === wanted.green && actual.blue === wanted.blue;
        if (wanted.model === 'CMYK') return actual.typename === 'CMYKColor' && actual.cyan === wanted.cyan && actual.magenta === wanted.magenta && actual.yellow === wanted.yellow && actual.black === wanted.black;
        if (wanted.model === 'GRAY') return actual.typename === 'GrayColor' && actual.gray === wanted.gray;
      } catch(e) { return false; }
      return false;
    }
    var attrs = null; try { if (item.typename === 'TextFrame') attrs = item.textRange.characterAttributes; } catch(e) {}
    try { if (style.fill !== undefined && !same(attrs ? attrs.fillColor : item.fillColor, style.fill)) return false; } catch(e1) { return false; }
    try { if (style.stroke !== undefined && !same(attrs ? attrs.strokeColor : item.strokeColor, style.stroke)) return false; } catch(e2) { return false; }
    try { if (style.strokeWidth !== undefined && (attrs ? attrs.strokeWeight : item.strokeWidth) !== style.strokeWidth) return false; } catch(e3) { return false; }
    return true;
  }
  function bounds(item) { try { var b=item.geometricBounds; return {left:b[0],top:b[1],right:b[2],bottom:b[3],width:Math.abs(b[2]-b[0]),height:Math.abs(b[1]-b[3])}; } catch(e) { return null; } }
  // Illustrator can re-materialize geometric bounds with tiny floating-point
  // variation after a read. Preserve expected-state protection while avoiding
  // false conflicts from values below one hundredth of a point.
  function sameBound(actual, wanted) { return Math.abs(actual - wanted) <= 0.01; }
  function layerPathFor(d, layer) { function visit(parent, prefix) { for (var i=0;i<parent.layers.length;i++) { var candidate=parent.layers[i]; var current=prefix === '' ? String(i) : prefix+'/'+i; if (candidate===layer) return current; var child=visit(candidate,current); if(child!==null)return child; } return null; } return visit(d,''); }
  function directItems(container) { var out=[]; for(var i=0;i<container.pageItems.length;i++){var x=container.pageItems[i];try{if(x.parent!==container)continue;}catch(e){}out.push(x);}return out; }
  function directIndex(container, item) { var items=directItems(container); for(var i=0;i<items.length;i++)if(items[i]===item)return i; return -1; }
  function collectionPathFor(d,item) { var chain=[];var current=item;for(var n=0;n<64;n++){var parent=current.parent;var index=directIndex(parent,current);if(index<0)return null;chain.unshift('pageItems/'+index);if(parent.typename==='Layer'){var lp=layerPathFor(d,parent);return 'layers/'+lp+'/'+chain.join('/');}current=parent;}return null; }
  function summary(d, item) { var layer=item.layer; var lp=layerPathFor(d,layer); var cp=collectionPathFor(d,item); var name=null; try{name=item.name||'';}catch(e){} var type='Unknown';try{type=item.typename||'Unknown';}catch(e){} return {typename:type,name:name,layerPath:lp,ancestry:['layer:'+lp],collectionPath:cp,locator:{kind:'document-session-structural',typename:type,name:name,layerPath:lp,ancestry:['layer:'+lp],collectionPath:cp},locked:null,hidden:null,bounds:bounds(item),contentsPreview:null,contentsLength:null}; }
  function editable(item) { var current=item; for(var i=0;current&&i<32;i++){try{if(current.locked===true)return false;}catch(e1){}try{if(current.hidden===true)return false;}catch(e2){}try{if(current.typename==='Layer'&&current.visible===false)return false;}catch(e3){}try{current=current.parent;}catch(e4){break;}}return true; }
  function resolve(d, locator) { if(!locator||!locator.collectionPath)return null; var parts=locator.collectionPath.split('/'); if(parts.length<4||parts[0]!=='layers')return null; var container=d.layers[parseInt(parts[1],10)]; if(!container)return null; for(var i=2;i<parts.length;i+=2){if(parts[i]!=='pageItems'||i+1>=parts.length)return null;var items=directItems(container);var item=items[parseInt(parts[i+1],10)];if(!item)return null;if(i+2===parts.length){try{if(item.typename===locator.typename&&(locator.name===null||locator.name===(item.name||'')))return item;}catch(e){}return null;}container=item;}return null; }
  function expected(item, state) { if(!state)return true; try{if(state.typename!==undefined&&item.typename!==state.typename)return false;}catch(e1){return false;}try{if(state.name!==undefined&&(item.name||'')!==state.name)return false;}catch(e2){return false;} if(state.bounds!==undefined){var b=bounds(item);if(!b||!sameBound(b.left,state.bounds.left)||!sameBound(b.top,state.bounds.top)||!sameBound(b.right,state.bounds.right)||!sameBound(b.bottom,state.bounds.bottom))return false;}return true; }
`;

async function run<T>(bridge: IllustratorBridge, context: SafeMutationContext, operation: string, workPath: string, jsx: string, targetDependent: boolean, structural: boolean): Promise<MutationResult<T>> {
  const preflight = context.prepare(operation, workPath, targetDependent);
  if (preflight) return { ok: false, error: preflight, contextState: context.state };
  const result = await bridge.execute<JsxResult<T>>(jsx, 30_000);
  if (!result.ok || !result.value) return transportFailure(context, operation, result.error ?? "ILLUSTRATOR_EXECUTION_FAILED");
  if (!result.value.ok) {
    const failure = result.value.error;
    if (!failure) return transportFailure(context, operation, "ILLUSTRATOR_EXECUTION_FAILED: mutation wrapper returned an invalid result");
    if (failure.partialMutationPossible) context.quarantine();
    return { ok: false, contextState: context.state, error: mutationError(failure.code as never, failure.stage as never, operation, failure.message, failure.partialMutationPossible, failure.recovery) };
  }
  if (structural) context.markStructuralMutation();
  return { ok: true, value: result.value.value, contextState: context.state };
}

function primitiveValid(context: SafeMutationContext, operation: string, request: PrimitiveBase & { x: number; y: number; width?: number; height?: number }): MutationResult<ObjectSummary> | null {
  if (!finite(request.x) || !finite(request.y)) return invalid(context, operation, "x and y must be finite.");
  if (request.width !== undefined && (!finite(request.width) || request.width <= 0)) return invalid(context, operation, "width must be greater than zero.");
  if (request.height !== undefined && (!finite(request.height) || request.height <= 0)) return invalid(context, operation, "height must be greater than zero.");
  if (!validColor(request.fill) || !validColor(request.stroke) || (request.strokeWidth !== undefined && (!finite(request.strokeWidth) || request.strokeWidth < 0))) return invalid(context, operation, "Unsupported or invalid color/style value.");
  return null;
}

export async function createRectangle(bridge: IllustratorBridge, context: SafeMutationContext, workPath: string, request: RectangleRequest): Promise<MutationResult<ObjectSummary>> {
  const bad = primitiveValid(context, "create-rectangle", request); if (bad) return bad;
  return run(bridge, context, "create-rectangle", workPath, `${JSX_HELPERS} var d=workDocument(${literal(workPath)}); if(!d)return fail('ACTIVE_DOCUMENT_MISMATCH','preflight','Active document is not the authorized work copy.',false); var p=artboardPoint(d,${request.artboardIndex ?? "null"},${request.x},${request.y}); if(!p)return fail('INVALID_REQUEST','preflight','Invalid artboard index.',false); var item=d.activeLayer.pathItems.rectangle(p.y,p.x,${request.width},${request.height}); item.name=${JSON.stringify(request.name ?? "")}; var style=${JSON.stringify(styleOf(request))}; if(!applyStyle(item,style))return fail('ILLUSTRATOR_UNSUPPORTED','mutation','Unsupported color model.',false); var after=summary(d,item); if(!after.bounds||after.bounds.width!==${request.width}||after.bounds.height!==${request.height}||!styleMatches(item,style))return fail('POST_CONDITION_FAILED','post-condition','Created rectangle did not verify.',true); return {ok:true,value:after};`, false, true);
}
export async function createEllipse(bridge: IllustratorBridge, context: SafeMutationContext, workPath: string, request: EllipseRequest): Promise<MutationResult<ObjectSummary>> {
  const bad = primitiveValid(context, "create-ellipse", request); if (bad) return bad;
  return run(bridge, context, "create-ellipse", workPath, `${JSX_HELPERS} var d=workDocument(${literal(workPath)}); if(!d)return fail('ACTIVE_DOCUMENT_MISMATCH','preflight','Active document is not the authorized work copy.',false); var p=artboardPoint(d,${request.artboardIndex ?? "null"},${request.x},${request.y}); if(!p)return fail('INVALID_REQUEST','preflight','Invalid artboard index.',false); var item=d.activeLayer.pathItems.ellipse(p.y,p.x,${request.width},${request.height}); item.name=${JSON.stringify(request.name ?? "")}; var style=${JSON.stringify(styleOf(request))}; if(!applyStyle(item,style))return fail('ILLUSTRATOR_UNSUPPORTED','mutation','Unsupported color model.',false); var after=summary(d,item); if(!after.bounds||after.bounds.width!==${request.width}||after.bounds.height!==${request.height}||!styleMatches(item,style))return fail('POST_CONDITION_FAILED','post-condition','Created ellipse did not verify.',true); return {ok:true,value:after};`, false, true);
}
export async function createLine(bridge: IllustratorBridge, context: SafeMutationContext, workPath: string, request: LineRequest): Promise<MutationResult<ObjectSummary>> {
  if ((request as { fill?: unknown }).fill !== undefined || ![request.x1,request.y1,request.x2,request.y2].every(finite) || !validColor(request.stroke) || (request.strokeWidth !== undefined && (!finite(request.strokeWidth)||request.strokeWidth<0))) return invalid(context,"create-line","Line coordinates and stroke must be finite; fill is unsupported.");
  return run(bridge, context, "create-line", workPath, `${JSX_HELPERS} var d=workDocument(${literal(workPath)}); if(!d)return fail('ACTIVE_DOCUMENT_MISMATCH','preflight','Active document is not the authorized work copy.',false); var a=artboardPoint(d,${request.artboardIndex ?? "null"},${request.x1},${request.y1}); var b=artboardPoint(d,${request.artboardIndex ?? "null"},${request.x2},${request.y2}); if(!a||!b)return fail('INVALID_REQUEST','preflight','Invalid artboard index.',false); var item=d.activeLayer.pathItems.add(); item.setEntirePath([[a.x,a.y],[b.x,b.y]]); item.filled=false; item.name=${JSON.stringify(request.name ?? "")}; var style=${JSON.stringify(styleOf(request))}; if(!applyStyle(item,style))return fail('ILLUSTRATOR_UNSUPPORTED','mutation','Unsupported color model.',false); if(!styleMatches(item,style))return fail('POST_CONDITION_FAILED','post-condition','Created line did not verify.',true); return {ok:true,value:summary(d,item)};`, false, true);
}
export async function createTextFrame(bridge: IllustratorBridge, context: SafeMutationContext, workPath: string, request: TextFrameRequest): Promise<MutationResult<ObjectSummary>> {
  if (!finite(request.x)||!finite(request.y)||typeof request.contents!=="string"||!validColor(request.fill)||!validColor(request.stroke)|| (request.fontSize!==undefined&&(!finite(request.fontSize)||request.fontSize<=0))) return invalid(context,"create-text-frame","Text position, contents, style, and font size are invalid.");
  return run(bridge, context, "create-text-frame", workPath, `${JSX_HELPERS} var d=workDocument(${literal(workPath)}); if(!d)return fail('ACTIVE_DOCUMENT_MISMATCH','preflight','Active document is not the authorized work copy.',false); var p=artboardPoint(d,${request.artboardIndex ?? "null"},${request.x},${request.y}); if(!p)return fail('INVALID_REQUEST','preflight','Invalid artboard index.',false); var item=d.textFrames.add(); item.position=[p.x,p.y]; item.contents=${JSON.stringify(request.contents)}; item.name=${JSON.stringify(request.name ?? "")}; ${request.fontPostScriptName ? `try { item.textRange.characterAttributes.textFont=app.textFonts.getByName(${JSON.stringify(request.fontPostScriptName)}); } catch(e) { return fail('TARGET_NOT_FOUND','preflight','Requested font is not installed.',false); }` : ""} ${request.fontSize ? `item.textRange.characterAttributes.size=${request.fontSize};` : ""} var style=${JSON.stringify(styleOf(request))}; if(!applyStyle(item,style))return fail('ILLUSTRATOR_UNSUPPORTED','mutation','Unsupported color model.',false); if(item.contents!==${JSON.stringify(request.contents)}||!styleMatches(item,style))return fail('POST_CONDITION_FAILED','post-condition','Created text did not verify.',true); return {ok:true,value:summary(d,item)};`, false, true);
}
function styleOf(value: Styling): Styling { return { fill:value.fill, stroke:value.stroke, strokeWidth:value.strokeWidth }; }

export async function updateObject(bridge: IllustratorBridge, context: SafeMutationContext, workPath: string, request: ObjectUpdateRequest): Promise<MutationResult<ObjectSummary>> {
  if (!request.locator || !request.expected || ([request.x,request.y,request.width,request.height].some(v=>v!==undefined&&!finite(v))) || (request.width!==undefined&&request.width<=0) || (request.height!==undefined&&request.height<=0)) return invalid(context,"update-object","Locator, expected state, and geometry must be valid.");
  return run(bridge, context,"update-object",workPath,`${JSX_HELPERS} var d=workDocument(${literal(workPath)}); if(!d)return fail('ACTIVE_DOCUMENT_MISMATCH','preflight','Active document is not the authorized work copy.',false); var item=resolve(d,${JSON.stringify(request.locator)}); if(!item)return fail('TARGET_STALE','resolution','Locator did not resolve uniquely.',false); if(item.typename!=='PathItem')return fail('ILLUSTRATOR_UNSUPPORTED','preflight','B1 geometry updates support PathItem only.',false); if(!expected(item,${JSON.stringify(request.expected)}))return fail('EXPECTED_STATE_MISMATCH','expected-state','Target no longer matches its verified state.',false); if(!editable(item))return fail('TARGET_NOT_EDITABLE','editability','Target hierarchy is locked or hidden.',false); ${request.x!==undefined||request.y!==undefined ? `var before=bounds(item); var ai=${request.artboardIndex ?? "null"}; var ab=ai===null?d.artboards.getActiveArtboardIndex():ai; if(ab<0||ab>=d.artboards.length)return fail('INVALID_REQUEST','preflight','Invalid artboard index.',false); var rect=d.artboards[ab].artboardRect; item.position=[${request.x !== undefined ? `rect[0]+${request.x}` : "before.left"},${request.y !== undefined ? `rect[1]-${request.y}` : "before.top"}];` : ""} ${request.width!==undefined?`item.width=${request.width};`:""} ${request.height!==undefined?`item.height=${request.height};`:""} ${request.name!==undefined?`item.name=${JSON.stringify(request.name)};`:""} var after=summary(d,item); if(!after.bounds${request.width!==undefined?`||after.bounds.width!==${request.width}`:""}${request.height!==undefined?`||after.bounds.height!==${request.height}`:""}${request.name!==undefined?`||after.name!==${JSON.stringify(request.name)}`:""})return fail('POST_CONDITION_FAILED','post-condition','Geometry update did not verify.',true); return {ok:true,value:after};`,true,false);
}
export async function setFillStroke(bridge: IllustratorBridge, context: SafeMutationContext, workPath: string, request: FillStrokeRequest): Promise<MutationResult<ObjectSummary>> {
  if (!request.locator||!request.expected||(!request.fill&&!request.stroke&&request.strokeWidth===undefined)||!validColor(request.fill)||!validColor(request.stroke)||(request.strokeWidth!==undefined&&(!finite(request.strokeWidth)||request.strokeWidth<0))) return invalid(context,"set-fill-stroke","Locator, expected state, and supported style are required.");
  return run(bridge,context,"set-fill-stroke",workPath,`${JSX_HELPERS} var d=workDocument(${literal(workPath)}); if(!d)return fail('ACTIVE_DOCUMENT_MISMATCH','preflight','Active document is not the authorized work copy.',false); var item=resolve(d,${JSON.stringify(request.locator)}); if(!item)return fail('TARGET_STALE','resolution','Locator did not resolve uniquely.',false); if(item.typename!=='PathItem'&&item.typename!=='TextFrame')return fail('ILLUSTRATOR_UNSUPPORTED','preflight','B1 style updates support PathItem and TextFrame only.',false); if(!expected(item,${JSON.stringify(request.expected)}))return fail('EXPECTED_STATE_MISMATCH','expected-state','Target no longer matches its verified state.',false); if(!editable(item))return fail('TARGET_NOT_EDITABLE','editability','Target hierarchy is locked or hidden.',false); var style=${JSON.stringify(styleOf(request))}; if(!applyStyle(item,style))return fail('ILLUSTRATOR_UNSUPPORTED','preflight','Unsupported color model.',false); if(!styleMatches(item,style))return fail('POST_CONDITION_FAILED','post-condition','Style update did not verify.',true); return {ok:true,value:summary(d,item)};`,true,false);
}

export function expectedFromSummary(summary: ObjectSummary): ExpectedTargetState { return { typename:summary.typename, name:summary.name, bounds:summary.bounds ?? undefined, locked:summary.locked ?? undefined, hidden:summary.hidden ?? undefined }; }

function targetArrayValid(targets: TargetRequest[], minimum: number): boolean {
  return Array.isArray(targets) && targets.length >= minimum && targets.every((target) => !!target?.locator && !!target.expected);
}
function b2Prelude(workPath: string, targets: TargetRequest[], supported: boolean): string {
  return `${JSX_HELPERS} var d=workDocument(${literal(workPath)}); if(!d)return fail('ACTIVE_DOCUMENT_MISMATCH','preflight','Active document is not the authorized work copy.',false); var input=${JSON.stringify(targets)}; var items=[]; var seen=[]; for(var i=0;i<input.length;i++){var item=resolve(d,input[i].locator);if(!item)return fail('TARGET_STALE','resolution','A locator did not resolve uniquely.',false);for(var s=0;s<seen.length;s++)if(seen[s]===item)return fail('TARGET_AMBIGUOUS','resolution','The same target was supplied more than once.',false);seen.push(item);${supported ? "if(item.typename!=='PathItem'&&item.typename!=='TextFrame'&&item.typename!=='GroupItem')return fail('UNSUPPORTED_OBJECT_TYPE','preflight','This operation supports PathItem, TextFrame, and GroupItem only.',false);" : ""}if(!expected(item,input[i].expected))return fail('EXPECTED_STATE_MISMATCH','expected-state','A target no longer matches its verified state.',false);if(!editable(item))return fail('TARGET_NOT_EDITABLE','editability','A target hierarchy is locked or hidden.',false);items.push(item);} `;
}

export async function selectObjects(bridge: IllustratorBridge, context: SafeMutationContext, workPath: string, request: SelectObjectsRequest): Promise<MutationResult<{ selectionCount: number }>> {
  if (!Array.isArray(request.locators) || request.locators.length === 0) return invalid(context, "select-objects", "locators must be a non-empty array.");
  return run(bridge, context, "select-objects", workPath, `${JSX_HELPERS} var d=workDocument(${literal(workPath)});if(!d)return fail('ACTIVE_DOCUMENT_MISMATCH','preflight','Active document is not the authorized work copy.',false);var locators=${JSON.stringify(request.locators)};var items=[];for(var i=0;i<locators.length;i++){var item=resolve(d,locators[i]);if(!item)return fail('TARGET_STALE','resolution','A locator did not resolve uniquely.',false);if(!editable(item))return fail('TARGET_NOT_EDITABLE','editability','A selected item is locked or hidden.',false);for(var j=0;j<items.length;j++)if(items[j]===item)return fail('TARGET_AMBIGUOUS','resolution','The same item was supplied twice.',false);items.push(item);}if(${request.replaceSelection !== false})d.selection=null;for(var k=0;k<items.length;k++){try{items[k].selected=true;}catch(e){return fail('TARGET_NOT_EDITABLE','mutation','Illustrator could not select a target.',false);}}var selected=d.selection||[];for(var q=0;q<items.length;q++){var found=false;for(var z=0;z<selected.length;z++)if(selected[z]===items[q])found=true;if(!found)return fail('POST_CONDITION_FAILED','post-condition','Selection did not contain every requested object.',false);}return {ok:true,value:{selectionCount:selected.length}};`, true, false);
}

export async function clearSelection(bridge: IllustratorBridge, context: SafeMutationContext, workPath: string): Promise<MutationResult<{ selectionCount: number }>> {
  return run(bridge, context, "clear-selection", workPath, `${JSX_HELPERS} var d=workDocument(${literal(workPath)});if(!d)return fail('ACTIVE_DOCUMENT_MISMATCH','preflight','Active document is not the authorized work copy.',false);d.selection=null;var selected=d.selection||[];if(selected.length!==0)return fail('POST_CONDITION_FAILED','post-condition','Illustrator selection was not cleared.',false);return {ok:true,value:{selectionCount:0}};`, false, false);
}

export async function duplicateObjects(bridge: IllustratorBridge, context: SafeMutationContext, workPath: string, request: DuplicateObjectsRequest): Promise<MutationResult<ObjectSummary[]>> {
  const copies=request.copies ?? 1, offsetX=request.offsetX ?? 0, offsetY=request.offsetY ?? 0;
  if (!targetArrayValid(request.targets,1) || !Number.isInteger(copies) || copies < 1 || copies > 100 || !finite(offsetX) || !finite(offsetY)) return invalid(context,"duplicate-objects","Targets, copies (1-100), and finite offsets are required.");
  return run(bridge,context,"duplicate-objects",workPath,`${b2Prelude(workPath,request.targets,true)}var out=[];for(var i=0;i<items.length;i++){var before=bounds(items[i]);if(!before)return fail('UNSUPPORTED_OBJECT_TYPE','preflight','Target does not expose reliable bounds.',false);for(var c=1;c<=${copies};c++){var copy;try{copy=items[i].duplicate();copy.position=[before.left+${offsetX}*c,before.top-${offsetY}*c];}catch(e){return fail('ILLUSTRATOR_EXECUTION_FAILED','mutation','Illustrator could not duplicate the target.',true);}var after=bounds(copy);if(!after||!sameBound(after.left,before.left+${offsetX}*c)||!sameBound(after.top,before.top-${offsetY}*c))return fail('POST_CONDITION_FAILED','post-condition','Duplicate offset did not verify.',true);out.push(summary(d,copy));}}return {ok:true,value:out};`,true,true);
}

export async function groupObjects(bridge: IllustratorBridge, context: SafeMutationContext, workPath: string, request: GroupObjectsRequest): Promise<MutationResult<ObjectSummary>> {
  if (!targetArrayValid(request.targets,2)) return invalid(context,"group-objects","At least two locator/expected targets are required.");
  if (request.name !== undefined && typeof request.name !== "string") return invalid(context,"group-objects","name must be a string when supplied.");
  return run(bridge,context,"group-objects",workPath,`${b2Prelude(workPath,request.targets,true)}var parent=items[0].parent;for(var i=1;i<items.length;i++)if(items[i].parent!==parent)return fail('TARGET_PARENT_MISMATCH','preflight','All group targets must share one direct parent.',false);var ordered=[];for(var j=0;j<items.length;j++)ordered.push({item:items[j],index:directIndex(parent,items[j])});ordered.sort(function(a,b){return a.index-b.index;});var group;try{group=parent.groupItems.add();for(var k=0;k<ordered.length;k++)ordered[k].item.move(group,ElementPlacement.PLACEATEND);${request.name !== undefined ? `group.name=${JSON.stringify(request.name)};` : ""}}catch(e){return fail('ILLUSTRATOR_EXECUTION_FAILED','mutation','Illustrator could not create the group.',true);}var children=directItems(group);if(children.length!==items.length${request.name !== undefined ? `||group.name!==${JSON.stringify(request.name)}` : ""})return fail('POST_CONDITION_FAILED','post-condition','Group contents did not verify.',true);return {ok:true,value:summary(d,group)};`,true,true);
}

export async function ungroupObject(bridge: IllustratorBridge, context: SafeMutationContext, workPath: string, request: UngroupObjectRequest): Promise<MutationResult<{ childCount: number }>> {
  if (!request.target?.locator || !request.target.expected) return invalid(context,"ungroup-object","A GroupItem locator and expected state are required.");
  return run(bridge,context,"ungroup-object",workPath,`${b2Prelude(workPath,[request.target],false)}var group=items[0];if(group.typename!=='GroupItem')return fail('UNSUPPORTED_GROUP_TYPE','preflight','Only a normal GroupItem can be ungrouped.',false);var clipped=false;try{clipped=group.clipped===true;}catch(e){}var children=directItems(group);for(var i=0;i<children.length;i++){try{if(children[i].typename==='PathItem'&&children[i].clipping===true)clipped=true;}catch(e2){}}if(clipped)return fail('UNSUPPORTED_GROUP_TYPE','preflight','Clipping groups are not supported for ungroup.',false);var parent=group.parent;var count=children.length;try{for(var j=0;j<children.length;j++)children[j].move(parent,ElementPlacement.PLACEATEND);group.remove();}catch(e3){return fail('ILLUSTRATOR_EXECUTION_FAILED','mutation','Illustrator could not ungroup the target.',true);}if(resolve(d,input[0].locator)!==null)return fail('POST_CONDITION_FAILED','post-condition','Original group still resolves after ungroup.',true);return {ok:true,value:{childCount:count}};`,true,true);
}

export async function alignObjects(bridge: IllustratorBridge, context: SafeMutationContext, workPath: string, request: AlignObjectsRequest): Promise<MutationResult<ObjectSummary[]>> {
  if (!targetArrayValid(request.targets,request.reference === "ARTBOARD" ? 1 : 2) || !["LEFT","HORIZONTAL_CENTER","RIGHT","TOP","VERTICAL_CENTER","BOTTOM"].includes(request.mode) || !["SELECTION_BOUNDS","ARTBOARD","KEY_OBJECT"].includes(request.reference) || (request.reference==="KEY_OBJECT"&&!request.keyObject) || (request.reference==="ARTBOARD"&&(request.artboardIndex!==undefined&&(!Number.isInteger(request.artboardIndex)||request.artboardIndex<0)))) return invalid(context,"align-objects","Targets, mode, and reference are invalid.");
  const key=request.keyObject ? `var key=resolve(d,${JSON.stringify(request.keyObject.locator)});if(!key||!expected(key,${JSON.stringify(request.keyObject.expected)}))return fail('EXPECTED_STATE_MISMATCH','expected-state','Key object is stale.',false);var member=false;for(var km=0;km<items.length;km++)if(items[km]===key)member=true;if(!member)return fail('INVALID_ALIGNMENT_REFERENCE','preflight','Key object must be one of the targets.',false);` : "";
  return run(bridge,context,"align-objects",workPath,`${b2Prelude(workPath,request.targets,true)}${key}var left=Infinity,right=-Infinity,top=-Infinity,bottom=Infinity;for(var i=0;i<items.length;i++){var b=bounds(items[i]);if(!b)return fail('UNSUPPORTED_OBJECT_TYPE','preflight','Target does not expose reliable bounds.',false);left=Math.min(left,b.left);right=Math.max(right,b.right);top=Math.max(top,b.top);bottom=Math.min(bottom,b.bottom);}var ref={left:left,right:right,top:top,bottom:bottom};if(${JSON.stringify(request.reference)}==='ARTBOARD'){var ai=${request.artboardIndex ?? "d.artboards.getActiveArtboardIndex()"};if(ai<0||ai>=d.artboards.length)return fail('INVALID_ALIGNMENT_REFERENCE','preflight','Invalid artboard index.',false);var ar=d.artboards[ai].artboardRect;ref={left:ar[0],top:ar[1],right:ar[2],bottom:ar[3]};}else if(${JSON.stringify(request.reference)}==='KEY_OBJECT'){var kb=bounds(key);ref=kb;}for(var j=0;j<items.length;j++){if(${JSON.stringify(request.reference)}==='KEY_OBJECT'&&items[j]===key)continue;var before=bounds(items[j]);var dx=0,dy=0;var mode=${JSON.stringify(request.mode)};if(mode==='LEFT')dx=ref.left-before.left;else if(mode==='HORIZONTAL_CENTER')dx=(ref.left+ref.right-before.left-before.right)/2;else if(mode==='RIGHT')dx=ref.right-before.right;else if(mode==='TOP')dy=ref.top-before.top;else if(mode==='VERTICAL_CENTER')dy=(ref.top+ref.bottom-before.top-before.bottom)/2;else dy=ref.bottom-before.bottom;try{items[j].position=[before.left+dx,before.top+dy];}catch(e){return fail('ILLUSTRATOR_EXECUTION_FAILED','mutation','Illustrator could not align target.',true);}var after=bounds(items[j]);var actual=mode==='LEFT'?after.left:mode==='HORIZONTAL_CENTER'?(after.left+after.right)/2:mode==='RIGHT'?after.right:mode==='TOP'?after.top:mode==='VERTICAL_CENTER'?(after.top+after.bottom)/2:after.bottom;var wanted=mode==='LEFT'?ref.left:mode==='HORIZONTAL_CENTER'?(ref.left+ref.right)/2:mode==='RIGHT'?ref.right:mode==='TOP'?ref.top:mode==='VERTICAL_CENTER'?(ref.top+ref.bottom)/2:ref.bottom;if(!sameBound(actual,wanted))return fail('POST_CONDITION_FAILED','post-condition','Aligned geometry did not verify.',true);}var out=[];for(var q=0;q<items.length;q++)out.push(summary(d,items[q]));return {ok:true,value:out};`,true,false);
}

export async function distributeObjects(bridge: IllustratorBridge, context: SafeMutationContext, workPath: string, request: DistributeObjectsRequest): Promise<MutationResult<ObjectSummary[]>> {
  if (!targetArrayValid(request.targets,3) || !["HORIZONTAL","VERTICAL"].includes(request.axis) || !["CENTERS","GAPS"].includes(request.mode)) return invalid(context,"distribute-objects","At least three targets plus a supported axis and mode are required.");
  return run(bridge,context,"distribute-objects",workPath,`${b2Prelude(workPath,request.targets,true)}var axis=${JSON.stringify(request.axis)},mode=${JSON.stringify(request.mode)}, ordered=[];for(var i=0;i<items.length;i++){var b=bounds(items[i]);if(!b)return fail('UNSUPPORTED_OBJECT_TYPE','preflight','Target does not expose reliable bounds.',false);ordered.push({item:items[i],b:b});}ordered.sort(function(a,b){return axis==='HORIZONTAL'?a.b.left-b.b.left:b.b.top-a.b.top;});var first=ordered[0].b,last=ordered[ordered.length-1].b;var step;if(mode==='CENTERS'){var start=axis==='HORIZONTAL'?(first.left+first.right)/2:(first.top+first.bottom)/2;var end=axis==='HORIZONTAL'?(last.left+last.right)/2:(last.top+last.bottom)/2;step=(end-start)/(ordered.length-1);for(var j=1;j<ordered.length-1;j++){var before=ordered[j].b;var actual=axis==='HORIZONTAL'?(before.left+before.right)/2:(before.top+before.bottom)/2;var delta=start+step*j-actual;try{ordered[j].item.position=axis==='HORIZONTAL'?[before.left+delta,before.top]:[before.left,before.top+delta];}catch(e){return fail('ILLUSTRATOR_EXECUTION_FAILED','mutation','Illustrator could not distribute target.',true);}}}else{var span=axis==='HORIZONTAL'?last.right-first.left:first.top-last.bottom;var used=0;for(var k=0;k<ordered.length;k++)used+=axis==='HORIZONTAL'?ordered[k].b.width:ordered[k].b.height;step=(span-used)/(ordered.length-1);if(step<0)return fail('ILLUSTRATOR_UNSUPPORTED','preflight','Objects overlap; equal gaps are unsupported.',false);var cursor=axis==='HORIZONTAL'?first.right:first.bottom;for(var q=1;q<ordered.length-1;q++){var before2=ordered[q].b;var wanted=axis==='HORIZONTAL'?cursor+step:cursor-step-(axis==='HORIZONTAL'?0:before2.height);var delta2=axis==='HORIZONTAL'?wanted-before2.left:wanted-before2.top;try{ordered[q].item.position=axis==='HORIZONTAL'?[before2.left+delta2,before2.top]:[before2.left,before2.top+delta2];}catch(e2){return fail('ILLUSTRATOR_EXECUTION_FAILED','mutation','Illustrator could not distribute target.',true);}var now=bounds(ordered[q].item);cursor=axis==='HORIZONTAL'?now.right:now.bottom;}}var verify=[];for(var z=0;z<ordered.length;z++)verify.push(bounds(ordered[z].item));for(var v=1;v<verify.length-1;v++){var previous=verify[v-1],current=verify[v],next=verify[v+1];var a=mode==='CENTERS'?(axis==='HORIZONTAL'?(current.left+current.right-previous.left-previous.right)/2:(previous.top+previous.bottom-current.top-current.bottom)/2):(axis==='HORIZONTAL'?current.left-previous.right:previous.bottom-current.top);var b2=mode==='CENTERS'?(axis==='HORIZONTAL'?(next.left+next.right-current.left-current.right)/2:(current.top+current.bottom-next.top-next.bottom)/2):(axis==='HORIZONTAL'?next.left-current.right:current.bottom-next.top);if(!sameBound(a,b2))return fail('POST_CONDITION_FAILED','post-condition','Distributed spacing did not verify.',true);}var out=[];for(var w=0;w<items.length;w++)out.push(summary(d,items[w]));return {ok:true,value:out};`,true,false);
}
