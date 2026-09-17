/**
 * Fixed, internal operation builders fused from the identified MIT donors.
 * IE3JP: 1814485cfa24787215f0ec515a6853cb293e1e0a; Alexander:
 * fc7625410b62c833fce100f67cf18a97588279c5; Creold:
 * 9b3e3eeade9ba748f41612ec4697bb6a5c2489c2.  Callers must use the DPM
 * safe-donor-operation adapter; this module never accepts raw JSX or a menu
 * command supplied by a caller.
 */
import type { IllustratorBridge } from "../../../executor/bridge.js";
import { type MutationResult, SafeMutationContext } from "../../../production/mutation/context.js";
import { executeSafeDonorOperation } from "../adapters/safe-donor-operation.js";

export type BacklogOperation =
  | "convert_text_to_outlines" | "create_path_text" | "replace_formatted_text"
  | "apply_character_style" | "apply_paragraph_style" | "apply_graphic_style"
  | "create_gradient" | "create_swatch" | "replace_selection_color"
  | "create_layer" | "rename_layer" | "set_layer_visibility" | "set_layer_lock"
  | "delete_layer" | "move_selection_to_layer" | "z_order"
  | "import_svg_editable" | "rasterize_selection" | "image_trace_selection"
  | "export_document" | "preflight_summary" | "place_symbol" | "list_datasets"
  | "save_as" | "close_without_save" | "undo" | "redo"
  | "create_compound_path" | "release_compound_path" | "create_clipping_mask"
  | "release_clipping_mask" | "join_selected_paths" | "offset_selected_paths"
  | "duplicate_artboard" | "create_crop_marks";

export interface BacklogOperationRequest {
  operation: BacklogOperation;
  name?: string;
  content?: string;
  filePath?: string;
  format?: "png" | "jpg" | "svg" | "pdf";
  color?: { red: number; green: number; blue: number };
  zOrder?: "front" | "forward" | "backward" | "back";
  visible?: boolean;
  locked?: boolean;
  offset?: number;
  miterLimit?: number;
  join?: "round" | "bevel" | "miter";
  cropMarkStyle?: "western" | "japanese";
}

const literal = (value: unknown) => JSON.stringify(value);

/** JSX bodies retain the donor's Illustrator DOM operations but remove server plumbing/UI. */
export function buildBacklogOperationJsx(request: BacklogOperationRequest): string {
  const p = literal(request);
  return `
    var p=${p}, d=__dpmDonorDocument, s=d.selection || [];
    function fail(m,partial){return __dpmDonorFailure('ILLUSTRATOR_EXECUTION_FAILED','mutation',m,partial===true);}
    function needSelection(){if(!s || s.length===0)return fail('A verified structural selection is required.',false);return null;}
    try {
      if (parseFloat(app.version) < 26) return __dpmDonorFailure('ILLUSTRATOR_UNSUPPORTED','preflight','Illustrator 26.1 or later is required by this fused capability.',false);
      switch(p.operation) {
        case 'convert_text_to_outlines': { var e=needSelection();if(e)return e;var n=0;for(var i=s.length-1;i>=0;i--)if(s[i].typename==='TextFrame'){s[i].createOutline();n++;}return {ok:true,value:{converted:n}}; }
        case 'create_path_text': { var e=needSelection();if(e)return e;var t=d.textFrames.pathText(s[0]);t.contents=p.content||'';return {ok:true,value:{typename:t.typename,contents:t.contents}}; }
        case 'replace_formatted_text': { var e=needSelection();if(e)return e;var n=0;for(var i=0;i<s.length;i++)if(s[i].typename==='TextFrame'){s[i].contents=p.content||'';n++;}return {ok:true,value:{replaced:n}}; }
        case 'apply_character_style': case 'apply_paragraph_style': { var e=needSelection();if(e)return e;var st=p.operation==='apply_character_style'?d.characterStyles.getByName(p.name):d.paragraphStyles.getByName(p.name);for(var i=0;i<s.length;i++)if(s[i].typename==='TextFrame')st.applyTo(s[i].textRange);return {ok:true,value:{style:p.name}}; }
        case 'apply_graphic_style': { var e=needSelection();if(e)return e;var gs=d.graphicStyles.getByName(p.name);for(var i=0;i<s.length;i++)gs.applyTo(s[i]);return {ok:true,value:{style:p.name}}; }
        case 'create_gradient': { var g=d.gradients.add();g.name=p.name||'DPM Gradient';return {ok:true,value:{name:g.name}}; }
        case 'create_swatch': { var c=new RGBColor();c.red=p.color.red;c.green=p.color.green;c.blue=p.color.blue;var sw=d.swatches.add();sw.name=p.name||'DPM Swatch';sw.color=c;return {ok:true,value:{name:sw.name}}; }
        case 'replace_selection_color': { var e=needSelection();if(e)return e;var c=new RGBColor();c.red=p.color.red;c.green=p.color.green;c.blue=p.color.blue;for(var i=0;i<s.length;i++)if(s[i].filled)s[i].fillColor=c;return {ok:true,value:{changed:s.length}}; }
        case 'create_layer': { var l=d.layers.add();l.name=p.name||l.name;return {ok:true,value:{name:l.name}}; }
        case 'rename_layer': case 'set_layer_visibility': case 'set_layer_lock': case 'delete_layer': { var l=d.layers.getByName(p.name);if(p.operation==='rename_layer')l.name=p.content||l.name;else if(p.operation==='set_layer_visibility')l.visible=p.visible===true;else if(p.operation==='set_layer_lock')l.locked=p.locked===true;else l.remove();return {ok:true,value:{operation:p.operation}}; }
        case 'move_selection_to_layer': { var e=needSelection();if(e)return e;var l=d.layers.getByName(p.name);for(var i=0;i<s.length;i++)s[i].move(l,ElementPlacement.PLACEATEND);return {ok:true,value:{moved:s.length}}; }
        case 'z_order': { var e=needSelection();if(e)return e;var m={front:ZOrderMethod.BRINGTOFRONT,forward:ZOrderMethod.BRINGFORWARD,backward:ZOrderMethod.SENDBACKWARD,back:ZOrderMethod.SENDTOBACK};for(var i=0;i<s.length;i++)s[i].zOrder(m[p.zOrder]);return {ok:true,value:{changed:s.length}}; }
        case 'import_svg_editable': { var f=new File(p.filePath);if(!f.exists)return __dpmDonorFailure('TARGET_NOT_FOUND','preflight','SVG file not found.',false);var target=d,src=app.open(f);for(var i=src.pageItems.length-1;i>=0;i--)src.pageItems[i].duplicate(target.activeLayer,ElementPlacement.PLACEATEND);src.close(SaveOptions.DONOTSAVECHANGES);target.activate();return {ok:true,value:{imported:true}}; }
        case 'rasterize_selection': { var e=needSelection();if(e)return e;var r=d.rasterize(s,null,new RasterizeOptions());return {ok:true,value:{typename:r.typename}}; }
        case 'image_trace_selection': { var e=needSelection();if(e)return e;var traced=s[0].trace();traced.tracing.expandTracing();return {ok:true,value:{traced:true}}; }
        case 'export_document': { var f=new File(p.filePath),fmt=p.format;if(fmt==='png'){var o=new ExportOptionsPNG24();d.exportFile(f,ExportType.PNG24,o);}else if(fmt==='jpg'){var j=new ExportOptionsJPEG();d.exportFile(f,ExportType.JPEG,j);}else if(fmt==='svg'){var v=new ExportOptionsSVG();d.exportFile(f,ExportType.SVG,v);}else if(fmt==='pdf'){d.saveAs(f,new PDFSaveOptions());}else return __dpmDonorFailure('INVALID_REQUEST','preflight','Unsupported export format.',false);return {ok:true,value:{path:f.fsName,format:fmt}}; }
        case 'preflight_summary': { var missing=0,overprint=0;for(var i=0;i<d.placedItems.length;i++)try{if(!d.placedItems[i].file.exists)missing++;}catch(x){missing++;}for(var j=0;j<d.pathItems.length;j++)try{if(d.pathItems[j].overprintFill||d.pathItems[j].overprintStroke)overprint++;}catch(y){}return {ok:true,value:{placedItems:d.placedItems.length,missingLinks:missing,textFrames:d.textFrames.length,swatches:d.swatches.length,overprintItems:overprint}}; }
        case 'place_symbol': { var sym=d.symbols.getByName(p.name);var it=d.symbolItems.add(sym);return {ok:true,value:{name:it.name||'',typename:it.typename}}; }
        case 'list_datasets': { var a=[];for(var i=0;i<d.dataSets.length;i++)a.push(d.dataSets[i].name);return {ok:true,value:{datasets:a}}; }
        case 'save_as': { var f=new File(p.filePath);d.saveAs(f);return {ok:true,value:{path:f.fsName}}; }
        case 'close_without_save': d.close(SaveOptions.DONOTSAVECHANGES);return {ok:true,value:{closed:true}};
        case 'undo': app.undo();return {ok:true,value:{undone:true}}; case 'redo': app.redo();return {ok:true,value:{redone:true}};
        case 'create_compound_path': { var e=needSelection();if(e)return e;app.executeMenuCommand('compoundPath');return {ok:true,value:{created:true}}; }
        case 'release_compound_path': { var e=needSelection();if(e)return e;app.executeMenuCommand('releaseCompoundPath');return {ok:true,value:{released:true}}; }
        case 'create_clipping_mask': { var e=needSelection();if(e)return e;app.executeMenuCommand('makeMask');return {ok:true,value:{created:true}}; }
        case 'release_clipping_mask': { var e=needSelection();if(e)return e;app.executeMenuCommand('releaseMask');return {ok:true,value:{released:true}}; }
        case 'join_selected_paths': { var e=needSelection();if(e)return e;app.executeMenuCommand('join');return {ok:true,value:{joined:true}}; }
        case 'offset_selected_paths': { var e=needSelection();if(e)return e;var j={round:0,bevel:1,miter:2}[p.join||'miter'];var effect='<LiveEffect name="Adobe Offset Path"><Dict data="R mlim '+(p.miterLimit||4)+' R ofst '+(p.offset||0)+' I jntp '+j+' "/></LiveEffect>';for(var i=0;i<s.length;i++)s[i].applyEffect(effect);app.executeMenuCommand('expandStyle');return {ok:true,value:{offset:p.offset||0,changed:s.length}}; }
        case 'duplicate_artboard': { var a=d.artboards[d.artboards.getActiveArtboardIndex()],r=a.artboardRect,dx=r[2]-r[0]+20;var b=d.artboards.add([r[0]+dx,r[1],r[2]+dx,r[3]]);b.name=(a.name||'Artboard')+' copy';return {ok:true,value:{name:b.name,rect:b.artboardRect}}; }
        case 'create_crop_marks': { var e=needSelection();if(e)return e;app.preferences.setBooleanPreference('cropMarkStyle',(p.cropMarkStyle||'western')==='japanese');var before=d.groupItems.length;app.executeMenuCommand('TrimMark v25');return {ok:true,value:{style:p.cropMarkStyle||'western',created:d.groupItems.length>before}}; }
      }
    } catch(error) { return fail(String(error),true); }
  `;
}

/**
 * The internal registration point for every Phase 2.2 fixed operation.  This
 * deliberately accepts a closed request union rather than JSX, Action text,
 * or a caller-selected menu command.  Public MCP schemas remain deferred
 * until their Illustrator 26.1 validation phase.
 */
export async function executeBacklogOperation(
  bridge: IllustratorBridge,
  context: SafeMutationContext,
  workPath: string,
  request: BacklogOperationRequest,
): Promise<MutationResult<unknown>> {
  const readOnly = request.operation === "preflight_summary" || request.operation === "list_datasets";
  const destructive = request.operation === "delete_layer"
    || request.operation === "close_without_save"
    || request.operation === "undo"
    || request.operation === "redo"
    || request.operation === "release_compound_path"
    || request.operation === "release_clipping_mask";

  return executeSafeDonorOperation(bridge, context, {
    operation: `donor-${request.operation}`,
    workPath,
    jsx: buildBacklogOperationJsx(request),
    classification: {
      access: readOnly ? "READ" : "DOCUMENT_WRITE",
      impact: readOnly ? "NONE" : "STRUCTURE",
      destructive,
    },
  });
}
