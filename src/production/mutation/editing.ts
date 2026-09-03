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
  function directIndex(container, item) { var n=0; for(var i=0;i<container.pageItems.length;i++) { var x=container.pageItems[i]; try { if(x.parent!==container)continue; }catch(e){} if(x===item)return n; n++; } return -1; }
  function summary(d, item) { var layer=item.layer; var lp=layerPathFor(d,layer); var index=directIndex(layer,item); var cp='layers/'+lp+'/pageItems/'+index; var name=null; try{name=item.name||'';}catch(e){} var type='Unknown';try{type=item.typename||'Unknown';}catch(e){} return {typename:type,name:name,layerPath:lp,ancestry:['layer:'+lp],collectionPath:cp,locator:{kind:'document-session-structural',typename:type,name:name,layerPath:lp,ancestry:['layer:'+lp],collectionPath:cp},locked:null,hidden:null,bounds:bounds(item),contentsPreview:null,contentsLength:null}; }
  function editable(item) { var current=item; for(var i=0;current&&i<32;i++){try{if(current.locked===true)return false;}catch(e1){}try{if(current.hidden===true)return false;}catch(e2){}try{if(current.typename==='Layer'&&current.visible===false)return false;}catch(e3){}try{current=current.parent;}catch(e4){break;}}return true; }
  function resolve(d, locator) { var layer=d.layers[parseInt(locator.layerPath.split('/')[0],10)]; if(!layer)return null; var parts=locator.collectionPath.split('/'); var index=parseInt(parts[parts.length-1],10); var n=0; for(var i=0;i<layer.pageItems.length;i++){var item=layer.pageItems[i];try{if(item.parent!==layer)continue;}catch(e){}if(n===index){try{if(item.typename===locator.typename&&(locator.name===null||locator.name===(item.name||'')))return item;}catch(e2){}return null;}n++;}return null; }
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
