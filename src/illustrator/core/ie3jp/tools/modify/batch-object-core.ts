import { COLOR_HELPERS_JSX, FONT_HELPERS_JSX, TEXT_APPEARANCE_HELPERS_JSX } from './shared.js';

/** Shared ES3 mutation path used by both the compatibility and batch tools. */
export const BATCH_OBJECT_CORE_JSX = `
${COLOR_HELPERS_JSX}
${FONT_HELPERS_JSX}
${TEXT_APPEARANCE_HELPERS_JSX}
function visualAppearanceForItem(item, coordSystem, abRect) {
  var state = verifyItem(item, coordSystem, abRect); state.uuid = ensureUUID(item); state.type = item.typename;
  state.opacity = item.opacity; state.hidden = item.hidden; state.locked = item.locked;
  if (item.typename === "TextFrame") { var text = readTextAppearance(item); state.fill = text.fill; state.stroke = text.stroke; state.character_count = text.character_count; state.fill_mixed = text.fill_mixed; state.stroke_mixed = text.stroke_mixed; }
  else { try { state.fill = item.filled ? colorToObject(item.fillColor) : { type: "none" }; } catch (ignoreFill) {} try { state.stroke = item.stroked ? colorToObject(item.strokeColor) : { type: "none" }; } catch (ignoreStroke) {} }
  return state;
}
/*
 * The Smart Text transaction performs the authoritative measurement and final
 * verification after the requested mutation has completed.  Its internal
 * modify_objects path therefore needs only bounded direct readback for the
 * requested text mutation, not a full character-by-character appearance scan.
 */
function mutationCompletionForItem(item, props, errors) {
  var completion = { mutation_complete: true };
  if (typeof props.contents === "string") {
    var expected = props.contents.split(String.fromCharCode(10)).join(String.fromCharCode(13));
    if (String(item.contents) !== expected) errors.push("contents: post-write readback mismatch");
    else completion.contents = true;
  }
  if (props.font_name) {
    try {
      var actualFont = item.textRange.characterAttributes.textFont;
      if (!actualFont || actualFont.name !== props.font_name) errors.push("font_name: post-write readback mismatch");
      else completion.font_name = true;
    } catch (completionFontError) { errors.push("font_name: " + completionFontError.message); }
  }
  if (typeof props.font_size === "number") {
    try {
      var actualSize = item.textRange.characterAttributes.size;
      if (Math.abs(actualSize - props.font_size) > 0.01) errors.push("font_size: post-write readback mismatch");
      else completion.font_size = true;
    } catch (completionSizeError) { errors.push("font_size: " + completionSizeError.message); }
  }
  return completion;
}
function modifyOneObject(uuid, props, coordSystem, abRect, smartTextCompletionOnly) {
  var item = findItemByUUID(uuid); if (!item) return { success: false, uuid: uuid, errors: ["No object found matching UUID: " + uuid] };
  props = props || {}; var errors = [];
  if (props.locked === false) try { item.locked = false; } catch(e0) { errors.push("locked: " + e0.message); }
  if (typeof props.hidden === "boolean") try { item.hidden = props.hidden; } catch(e1) { errors.push("hidden: " + e1.message); }
  if (props.position) try { item.position = webToAiPoint(props.position.x, props.position.y, coordSystem, abRect); } catch(e2) { errors.push("position: " + e2.message); }
  if (props.size) try { if (typeof props.size.width === "number") item.width = props.size.width; if (typeof props.size.height === "number") item.height = props.size.height; } catch(e3) { errors.push("size: " + e3.message); }
  if (typeof props.fill !== "undefined") try { applyOptionalFill(item, props.fill); } catch(e4) { errors.push("fill: " + e4.message); }
  if (typeof props.stroke !== "undefined") try { if (item.typename === "TextFrame") applyTextAppearance(item, void 0, props.stroke); else applyStroke(item, props.stroke, item.stroked); } catch(e5) { errors.push("stroke: " + e5.message); }
  if (typeof props.opacity === "number") try { item.opacity = props.opacity; } catch(e6) { errors.push("opacity: " + e6.message); }
  if (typeof props.rotation === "number") try { var mode = props.rotation_mode || "delta", current = parseFloat(getNoteMeta(item.note || "", "rot")) || 0, delta = mode === "absolute" ? props.rotation - current : props.rotation; if (Math.abs(delta) > 0.001) item.rotate(delta); setNoteMeta(item, "rot", String(Math.round((mode === "absolute" ? props.rotation : current + props.rotation) * 1000) / 1000)); } catch(e7) { errors.push("rotation: " + e7.message); }
  if (typeof props.name === "string") try { item.name = props.name; } catch(e8) { errors.push("name: " + e8.message); }
  if (typeof props.contents === "string") try { item.contents = props.contents.split(String.fromCharCode(10)).join(String.fromCharCode(13)); } catch(e9) { errors.push("contents: " + e9.message); }
  if (props.font_name) try { var font = app.textFonts.getByName(props.font_name); for (var fr = 0; fr < item.textRanges.length; fr++) item.textRanges[fr].characterAttributes.textFont = font; } catch(e10) { errors.push("font_name: " + e10.message); }
  if (typeof props.font_size === "number") try { for (var fs = 0; fs < item.textRanges.length; fs++) item.textRanges[fs].characterAttributes.size = props.font_size; } catch(e11) { errors.push("font_size: " + e11.message); }
  if (props.locked === true) try { item.locked = true; } catch(e12) { errors.push("locked: " + e12.message); }
  if (smartTextCompletionOnly) {
    var completion = mutationCompletionForItem(item, props, errors);
    return { success: errors.length === 0, uuid: uuid, errors: errors, completion: completion };
  }
  return { success: errors.length === 0, uuid: uuid, errors: errors, verified: visualAppearanceForItem(item, coordSystem, abRect) };
}
function modifyObjectOperations(operations, coordSystem, smartTextCompletionOnly) {
  var abRect = coordSystem === "artboard-web" ? getActiveArtboardRect() : null, results = [], failed = [];
  for (var oi = 0; oi < operations.length; oi++) { var op = operations[oi], result; try { result = modifyOneObject(op.uuid, op.properties, coordSystem, abRect, smartTextCompletionOnly === true); } catch(e) { result = { success: false, uuid: op.uuid, errors: [e.message] }; } results.push(result); if (!result.success) failed.push({ uuid: result.uuid, errors: result.errors }); }
  return { success: failed.length === 0, success_count: results.length - failed.length, fail_count: failed.length, failed_objects: failed, results: results, coordinateSystem: coordSystem };
}
`;
