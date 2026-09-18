import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { executeToolJsx } from './tool-executor.js';
import { colorSchema, coerceBoolean, READ_ANNOTATIONS, WRITE_ANNOTATIONS } from './modify/shared.js';

/*
 * Typography deliberately has one batch reader and one batch writer.  The reader
 * mirrors the locally captured official GetTypographyMetrics payload; the writer
 * is a direct Classic DOM layer, not an imitation of an official write tool.
 */

const uuids = z.array(z.string()).min(1).describe('Text-frame UUIDs. Pass every target in one array, including one target.');
const numberValue = z.number().finite();

const characterSchema = z.object({
  font_family: z.string().min(1).optional(),
  font_style: z.string().min(1).optional(),
  font_name: z.string().min(1).optional().describe('Exact Illustrator textFont name; takes precedence over family/style.'),
  font_size: numberValue.positive().optional(),
  leading: numberValue.positive().optional().describe('Manual leading in points. Supplying it disables auto_leading unless auto_leading is explicitly supplied.'),
  auto_leading: coerceBoolean.optional(),
  tracking: numberValue.optional(),
  kerning: numberValue.optional().describe('Manual kerning value in 1/1000 em. Applied to each character range.'),
  kerning_method: z.enum(['auto', 'optical', 'metrics', 'none']).optional(),
  horizontal_scale: numberValue.positive().optional(),
  vertical_scale: numberValue.positive().optional(),
  baseline_shift: numberValue.optional(),
  rotation: numberValue.optional(),
  capitalization: z.enum(['normal', 'all_caps', 'small_caps', 'all_small_caps']).optional(),
  baseline_position: z.enum(['normal', 'superscript', 'subscript']).optional(),
  underline: coerceBoolean.optional(),
  strike_through: coerceBoolean.optional(),
  no_break: coerceBoolean.optional(),
  language: z.string().min(1).optional(),
  tsume: numberValue.min(0).max(100).optional(),
  aki_left: numberValue.optional(),
  aki_right: numberValue.optional(),
  proportional_metrics: coerceBoolean.optional(),
  fill: colorSchema,
  stroke: colorSchema,
  stroke_weight: numberValue.min(0).optional(),
  overprint_fill: coerceBoolean.optional(),
  overprint_stroke: coerceBoolean.optional(),
  ligature: coerceBoolean.optional(),
  discretionary_ligature: coerceBoolean.optional(),
  contextual_ligature: coerceBoolean.optional(),
  fractions: coerceBoolean.optional(),
  ordinals: coerceBoolean.optional(),
  swash: coerceBoolean.optional(),
  titling: coerceBoolean.optional(),
  connection_forms: coerceBoolean.optional(),
  stylistic_alternates: coerceBoolean.optional(),
  alternate_glyphs: z.string().optional(),
  figure_style: z.string().optional(),
}).strict();

const paragraphSchema = z.object({
  paragraph_alignment: z.enum(['left', 'center', 'right', 'justify_last_left', 'justify_last_center', 'justify_last_right', 'justify_all']).optional(),
  first_line_indent: numberValue.optional(),
  left_indent: numberValue.optional(),
  right_indent: numberValue.optional(),
  space_before: numberValue.optional(),
  space_after: numberValue.optional(),
  hyphenation: coerceBoolean.optional(),
  hyphenate_capitalized_words: coerceBoolean.optional(),
  hyphenate_limit: numberValue.int().min(0).optional(),
  hyphenation_preference: numberValue.optional(),
  hyphenation_zone: numberValue.optional(),
  maximum_consecutive_hyphens: numberValue.int().min(0).optional(),
  minimum_before_hyphen: numberValue.int().min(0).optional(),
  minimum_after_hyphen: numberValue.int().min(0).optional(),
  minimum_word_length: numberValue.int().min(0).optional(),
  single_word_justification: z.enum(['left', 'center', 'right', 'justify_last_left', 'justify_last_center', 'justify_last_right', 'justify_all']).optional(),
  desired_word_spacing: numberValue.optional(), minimum_word_spacing: numberValue.optional(), maximum_word_spacing: numberValue.optional(),
  desired_letter_spacing: numberValue.optional(), minimum_letter_spacing: numberValue.optional(), maximum_letter_spacing: numberValue.optional(),
  desired_glyph_scaling: numberValue.optional(), minimum_glyph_scaling: numberValue.optional(), maximum_glyph_scaling: numberValue.optional(),
  every_line_composer: coerceBoolean.optional(),
  auto_leading_amount: numberValue.optional(),
  leading_type: z.enum(['bottom_to_bottom', 'top_to_top']).optional(),
  bunri_kinshi: coerceBoolean.optional(),
  kinsoku_order: z.number().int().optional(),
  kurikaeshi_moji_shori: coerceBoolean.optional(),
  mojikumi: z.string().optional(),
}).strict();

const readJsx = `
var preflight = preflightChecks();
if (preflight) writeResultFile(RESULT_PATH, preflight);
else try {
  var params = readParamsFile(PARAMS_PATH), doc = app.activeDocument;
  function safe(o, p) { try { return o[p]; } catch (_) { return undefined; } }
  function same(a, b) { return jsonStringify(a) === jsonStringify(b); }
  function uniform(values) { var result = { value: undefined, mixed: false }; if (!values.length) return result; result.value = values[0]; for (var i = 1; i < values.length; i++) if (!same(result.value, values[i])) { result.value = null; result.mixed = true; break; } return result; }
  function fontEntry(attrs) {
    var font = safe(attrs, 'textFont'), family = '', style = '', missing = false;
    try { family = font.family || ''; style = font.style || ''; } catch (_) { missing = true; }
    if (!missing) { var found = false; for (var i = 0; i < app.textFonts.length; i++) { if (app.textFonts[i].name === font.name) { found = true; break; } } missing = !found; }
    // Classic ExtendScript has no font embedding-permission property.  Null means
    // "not exposed", never a fabricated embeddable result.
    return { font_family: family, font_style: style, is_font_missing: missing, is_font_embeddable: null, embeddable_status: 'NOT_EXPOSED_BY_CLASSIC_DOM' };
  }
  function caps(value) { try { if (value === FontCapsOption.ALLCAPS) return 'all_caps'; if (value === FontCapsOption.SMALLCAPS) return 'small_caps'; if (value === FontCapsOption.ALLSMALLCAPS) return 'all_small_caps'; } catch (_) {} return 'normal'; }
  function kern(value) { try { if (value === AutoKernType.AUTO) return 'auto'; if (value === AutoKernType.OPTICAL) return 'optical'; if (value === AutoKernType.METRICSROMANONLY) return 'metrics'; if (value === AutoKernType.NOAUTOKERN) return 'none'; } catch (_) {} return String(value); }
  function justify(value) { try { if (value === Justification.LEFT) return 'left'; if (value === Justification.CENTER) return 'center'; if (value === Justification.RIGHT) return 'right'; if (value === Justification.FULLJUSTIFYLASTLINELEFT) return 'justify_last_left'; if (value === Justification.FULLJUSTIFYLASTLINECENTER) return 'justify_last_center'; if (value === Justification.FULLJUSTIFYLASTLINERIGHT) return 'justify_last_right'; if (value === Justification.FULLJUSTIFY) return 'justify_all'; } catch (_) {} return String(value); }
  function leadingType(value) { try { if (value === AutoLeadingType.BOTTOMTOBOTTOM) return 'bottom_to_bottom'; if (value === AutoLeadingType.TOPTOTOP) return 'top_to_top'; } catch (_) {} return String(value); }
  function metric(tf, uuid) {
    var chars = tf.characters, attrs = [], runs = [], seenFonts = {};
    for (var ci = 0; ci < chars.length; ci++) {
      var ca = chars[ci].characterAttributes, f = fontEntry(ca), key = jsonStringify(f);
      attrs.push(ca);
      if (!seenFonts[key]) { runs.push(f); seenFonts[key] = true; }
    }
    var source = attrs.length ? attrs : [tf.textRange.characterAttributes], properties = {
      text_length: tf.contents.length,
      text_content: tf.contents,
      font_runs: runs
    };
    try { properties.has_text_overflow = tf.overflows; } catch (_) {}
    if (runs.length) { properties.font_family = runs[0].font_family; properties.font_style = runs[0].font_style; properties.is_font_missing = runs[0].is_font_missing; properties.is_font_embeddable = runs[0].is_font_embeddable; }
    var fields = [ ['font_caps', 'capitalization', caps], ['font_size', 'size'], ['tracking', 'tracking'], ['kerning', 'kerningMethod', kern], ['leading', 'leading'], ['auto_leading', 'autoLeading'], ['baseline_shift', 'baselineShift'], ['horizontal_scale', 'horizontalScale'], ['vertical_scale', 'verticalScale'] ];
    var mixed = [];
    for (var fi = 0; fi < fields.length; fi++) { var values = []; for (var ai = 0; ai < source.length; ai++) { var value = safe(source[ai], fields[fi][1]); if (typeof fields[fi][2] === 'function') value = fields[fi][2](value); values.push(value); } var u = uniform(values); if (typeof u.value !== 'undefined') properties[fields[fi][0]] = u.value; if (u.mixed) mixed.push(fields[fi][0]); }
    var paraValues = [], leadingTypes = [];
    for (var pi = 0; pi < tf.paragraphs.length; pi++) { var pa = tf.paragraphs[pi].paragraphAttributes; paraValues.push(justify(safe(pa, 'justification'))); leadingTypes.push(leadingType(safe(pa, 'leadingType'))); }
    var alignment = uniform(paraValues), lt = uniform(leadingTypes); if (typeof alignment.value !== 'undefined') properties.paragraph_alignment = alignment.value; if (typeof lt.value !== 'undefined') properties.leading_type = lt.value; if (alignment.mixed) mixed.push('paragraph_alignment'); if (lt.mixed) mixed.push('leading_type');
    if (mixed.length) properties.mixed_fields = mixed;
    return { uuid: uuid, properties: properties };
  }
  var out = [], failed = [];
  for (var i = 0; i < params.uuids.length; i++) { var item = findItemByUUID(params.uuids[i]); if (!item) failed.push({uuid:params.uuids[i],reason:'No object found matching UUID'}); else if (item.typename !== 'TextFrame') failed.push({uuid:params.uuids[i],reason:'Object is not a TextFrame'}); else out.push(metric(item, params.uuids[i])); }
  writeResultFile(RESULT_PATH, { success: failed.length === 0, details: { requested_count: params.uuids.length, returned_count: out.length, failed_count: failed.length }, typography_metrics: out, failed_objects: failed });
} catch (e) { writeResultFile(RESULT_PATH, { error:true, message:'get_typography_metrics failed: '+e.message, line:e.line }); }
`;

const writeJsx = `
var preflight = preflightChecks();
if (preflight) writeResultFile(RESULT_PATH, preflight);
else try {
  var params = readParamsFile(PARAMS_PATH), doc = app.activeDocument;
  function safeGet(o, p) { try { return o[p]; } catch (_) { return undefined; } }
  function makeColor(c) { if (!c || c.type === 'none') return new NoColor(); if (c.type === 'rgb') { var rgb = new RGBColor(); rgb.red=c.r; rgb.green=c.g; rgb.blue=c.b; return rgb; } if (c.type === 'cmyk') { var cmyk = new CMYKColor(); cmyk.cyan=c.c; cmyk.magenta=c.m; cmyk.yellow=c.y; cmyk.black=c.k; return cmyk; } var gray = new GrayColor(); gray.gray=c.value; return gray; }
  function colorValue(c) { try { return colorToObject(c); } catch (_) { return null; } }
  function enumValue(group, value) {
    if (group === 'kerning') { if (value === 'auto') return AutoKernType.AUTO; if (value === 'optical') return AutoKernType.OPTICAL; if (value === 'metrics') return AutoKernType.METRICSROMANONLY; return AutoKernType.NOAUTOKERN; }
    if (group === 'caps') { if (value === 'all_caps') return FontCapsOption.ALLCAPS; if (value === 'small_caps') return FontCapsOption.SMALLCAPS; if (value === 'all_small_caps') return FontCapsOption.ALLSMALLCAPS; return FontCapsOption.NORMALCAPS; }
    if (group === 'baseline') { if (value === 'superscript') return FontBaselineOption.SUPERSCRIPT; if (value === 'subscript') return FontBaselineOption.SUBSCRIPT; return FontBaselineOption.NORMALBASELINE; }
    if (group === 'justify') { if (value === 'left') return Justification.LEFT; if (value === 'center') return Justification.CENTER; if (value === 'right') return Justification.RIGHT; if (value === 'justify_last_left') return Justification.FULLJUSTIFYLASTLINELEFT; if (value === 'justify_last_center') return Justification.FULLJUSTIFYLASTLINECENTER; if (value === 'justify_last_right') return Justification.FULLJUSTIFYLASTLINERIGHT; return Justification.FULLJUSTIFY; }
    if (group === 'leading') return value === 'top_to_top' ? AutoLeadingType.TOPTOTOP : AutoLeadingType.BOTTOMTOBOTTOM;
  }
  function resolveFont(c, current) {
    if (!c.font_name && !c.font_family) return current;
    for (var i = 0; i < app.textFonts.length; i++) { var f = app.textFonts[i]; if (c.font_name && f.name === c.font_name) return f; if (!c.font_name && f.family === c.font_family && (!c.font_style || f.style === c.font_style)) return f; }
    return null;
  }
  function valueFor(key, value) { if (key === 'fillColor' || key === 'strokeColor') return makeColor(value); if (key === 'kerningMethod') return enumValue('kerning', value); if (key === 'capitalization') return enumValue('caps', value); if (key === 'baselinePosition') return enumValue('baseline', value); if (key === 'justification') return enumValue('justify', value); if (key === 'leadingType') return enumValue('leading', value); return value; }
  function reportValue(attrs, key) { var v = safeGet(attrs, key); if (key === 'fillColor' || key === 'strokeColor') return colorValue(v); try { if (key === 'kerningMethod') { if (v === AutoKernType.AUTO) return 'auto'; if (v === AutoKernType.OPTICAL) return 'optical'; if (v === AutoKernType.METRICSROMANONLY) return 'metrics'; if (v === AutoKernType.NOAUTOKERN) return 'none'; } if (key === 'capitalization') { if (v === FontCapsOption.ALLCAPS) return 'all_caps'; if (v === FontCapsOption.SMALLCAPS) return 'small_caps'; if (v === FontCapsOption.ALLSMALLCAPS) return 'all_small_caps'; return 'normal'; } if (key === 'baselinePosition') { if (v === FontBaselineOption.SUPERSCRIPT) return 'superscript'; if (v === FontBaselineOption.SUBSCRIPT) return 'subscript'; return 'normal'; } if (key === 'justification') { if (v === Justification.LEFT) return 'left'; if (v === Justification.CENTER) return 'center'; if (v === Justification.RIGHT) return 'right'; if (v === Justification.FULLJUSTIFYLASTLINELEFT) return 'justify_last_left'; if (v === Justification.FULLJUSTIFYLASTLINECENTER) return 'justify_last_center'; if (v === Justification.FULLJUSTIFYLASTLINERIGHT) return 'justify_last_right'; if (v === Justification.FULLJUSTIFY) return 'justify_all'; } if (key === 'singleWordJustification') { if (v === Justification.LEFT) return 'left'; if (v === Justification.CENTER) return 'center'; if (v === Justification.RIGHT) return 'right'; if (v === Justification.FULLJUSTIFYLASTLINELEFT) return 'justify_last_left'; if (v === Justification.FULLJUSTIFYLASTLINECENTER) return 'justify_last_center'; if (v === Justification.FULLJUSTIFYLASTLINERIGHT) return 'justify_last_right'; if (v === Justification.FULLJUSTIFY) return 'justify_all'; } if (key === 'leadingType') return v === AutoLeadingType.TOPTOTOP ? 'top_to_top' : 'bottom_to_bottom'; } catch (_) {} return v; }
  function equality(expected, actual) { if (expected && expected.type) return jsonStringify(expected) === jsonStringify(actual); if (typeof expected === 'number' && typeof actual === 'number') return Math.abs(expected - actual) < 0.001; return String(expected) === String(actual); }
  var characterMap = { font_size:'size', leading:'leading', auto_leading:'autoLeading', tracking:'tracking', kerning_method:'kerningMethod', horizontal_scale:'horizontalScale', vertical_scale:'verticalScale', baseline_shift:'baselineShift', rotation:'rotation', capitalization:'capitalization', baseline_position:'baselinePosition', underline:'underline', strike_through:'strikeThrough', no_break:'noBreak', language:'language', tsume:'Tsume', aki_left:'akiLeft', aki_right:'akiRight', proportional_metrics:'proportionalMetrics', fill:'fillColor', stroke:'strokeColor', stroke_weight:'strokeWeight', overprint_fill:'overprintFill', overprint_stroke:'overprintStroke', ligature:'ligature', discretionary_ligature:'discretionaryLigature', contextual_ligature:'contextualLigature', fractions:'fractions', ordinals:'ordinals', swash:'swash', titling:'titling', connection_forms:'connectionForms', stylistic_alternates:'stylisticAlternates', alternate_glyphs:'alternateGlyphs', figure_style:'figureStyle' };
  var paragraphMap = { paragraph_alignment:'justification', first_line_indent:'firstLineIndent', left_indent:'leftIndent', right_indent:'rightIndent', space_before:'spaceBefore', space_after:'spaceAfter', hyphenation:'hyphenation', hyphenate_capitalized_words:'hyphenateCapitalizedWords', hyphenate_limit:'hyphenateLimit', hyphenation_preference:'hyphenationPreference', hyphenation_zone:'hyphenationZone', maximum_consecutive_hyphens:'maximumConsecutiveHyphens', minimum_before_hyphen:'minimumBeforeHyphen', minimum_after_hyphen:'minimumAfterHyphen', minimum_word_length:'minimumWordLength', single_word_justification:'singleWordJustification', desired_word_spacing:'desiredWordSpacing', minimum_word_spacing:'minimumWordSpacing', maximum_word_spacing:'maximumWordSpacing', desired_letter_spacing:'desiredLetterSpacing', minimum_letter_spacing:'minimumLetterSpacing', maximum_letter_spacing:'maximumLetterSpacing', desired_glyph_scaling:'desiredGlyphScaling', minimum_glyph_scaling:'minimumGlyphScaling', maximum_glyph_scaling:'maximumGlyphScaling', every_line_composer:'everyLineComposer', auto_leading_amount:'autoLeadingAmount', leading_type:'leadingType', bunri_kinshi:'bunriKinshi', kinsoku_order:'kinsokuOrder', kurikaeshi_moji_shori:'kurikaeshiMojiShori', mojikumi:'mojikumi' };
  var otKeys = { ligature:true, discretionary_ligature:true, contextual_ligature:true, fractions:true, ordinals:true, swash:true, titling:true, connection_forms:true, stylistic_alternates:true, alternate_glyphs:true, figure_style:true };
  var versionKeys = { bunri_kinshi:true, kinsoku_order:true, kurikaeshi_moji_shori:true, mojikumi:true, every_line_composer:true };
  function failureCode(key, isCharacter, message) { if (isCharacter && otKeys[key]) return 'FONT_DEPENDENT'; if (versionKeys[key]) return 'VERSION_DEPENDENT'; if (String(message).indexOf('Enumerated value expected') >= 0 || String(message).indexOf('greater than maximum') >= 0) return 'INVALID_VALUE'; return 'NOT_EXPOSED_BY_CLASSIC_DOM'; }
  function apply(attrs, map, values, isCharacter, log) { for (var k in map) if (values && typeof values[k] !== 'undefined') { var prop = map[k], expected = values[k]; try { attrs[prop] = valueFor(prop, expected); var actual = reportValue(attrs, prop); log.verified_properties.push({ property:k, readback:actual, matches: equality(expected, actual) }); if (!equality(expected, actual)) log.failed_properties.push({ property:k, code:'READBACK_MISMATCH', readback:actual }); } catch (e) { log.unsupported_properties.push({ property:k, code:failureCode(k, isCharacter, e.message), message:e.message }); } } }
  var results=[], failed=[];
  for (var i=0; i<params.uuids.length; i++) { var uuid=params.uuids[i], item=findItemByUUID(uuid); if (!item) { failed.push({uuid:uuid,reason:'No object found matching UUID'}); continue; } if (item.typename !== 'TextFrame') { failed.push({uuid:uuid,reason:'Object is not a TextFrame'}); continue; } if (item.locked || item.hidden) { failed.push({uuid:uuid,reason:item.locked?'locked':'hidden'}); continue; }
    var log={uuid:uuid, verified_properties:[], failed_properties:[], unsupported_properties:[]}, c=params.character, p=params.paragraph;
    if (c) { if (c.font_name || c.font_family) { var font=resolveFont(c, item.textRange.characterAttributes.textFont); if (!font) log.unsupported_properties.push({property:'font_family',code:'FONT_DEPENDENT',message:'Requested font family/style is unavailable in this Illustrator installation.'}); else { try { item.textRange.characterAttributes.textFont=font; for (var fc=0; fc<item.characters.length; fc++) item.characters[fc].characterAttributes.textFont=font; var actualFont=item.textRange.characterAttributes.textFont; log.verified_properties.push({property:'font_family',readback:{font_family:actualFont.family,font_style:actualFont.style,font_name:actualFont.name},matches:true}); } catch(e) { log.unsupported_properties.push({property:'font_family',code:'FONT_DEPENDENT',message:e.message}); } } }
      if (typeof c.leading !== 'undefined' && typeof c.auto_leading === 'undefined') { item.textRange.characterAttributes.autoLeading = false; for (var li=0; li<item.characters.length; li++) item.characters[li].characterAttributes.autoLeading = false; log.verified_properties.push({property:'auto_leading',readback:false,matches:true,implicit_for:'leading'}); }
      apply(item.textRange.characterAttributes, characterMap, c, true, log); for (var ci=0; ci<item.characters.length; ci++) apply(item.characters[ci].characterAttributes, characterMap, c, true, {verified_properties:[],failed_properties:[],unsupported_properties:[]});
      if (typeof c.kerning !== 'undefined') { try { for (var ki=0; ki<item.characters.length; ki++) item.characters[ki].kerning=c.kerning; var kr=[]; for (var kj=0; kj<item.characters.length; kj++) kr.push(item.characters[kj].kerning); var ok=true; for (var kk=0; kk<kr.length; kk++) if (String(kr[kk]) !== String(c.kerning)) ok=false; log.verified_properties.push({property:'kerning',readback:kr,matches:ok}); if (!ok) log.failed_properties.push({property:'kerning',code:'READBACK_MISMATCH',readback:kr}); } catch(e) { log.unsupported_properties.push({property:'kerning',code:'NOT_EXPOSED_BY_CLASSIC_DOM',message:e.message}); } }
    }
    if (p) for (var pi=0; pi<item.paragraphs.length; pi++) apply(item.paragraphs[pi].paragraphAttributes, paragraphMap, p, false, log);
    log.success=log.failed_properties.length===0 && log.unsupported_properties.length===0; results.push(log);
  }
  var allSucceeded = failed.length === 0; for (var ri = 0; ri < results.length; ri++) if (!results[ri].success) allSucceeded = false;
  writeResultFile(RESULT_PATH,{success:allSucceeded,details:{requested_count:params.uuids.length,updated_count:results.length,failed_count:failed.length},results:results,failed_objects:failed});
} catch(e) { writeResultFile(RESULT_PATH,{error:true,message:'set_typography failed: '+e.message,line:e.line}); }
`;

export function register(server: McpServer): void {
  server.registerTool('get_typography_metrics', {
    title: 'Get Typography Metrics',
    description: 'Read typography for one or more TextFrames in one background JSX execution. Compatible with the official GetTypographyMetrics response shape: text length/content, overflow, all font runs, and uniform or explicitly mixed character/paragraph metrics. Classic DOM cannot read font embedding permissions, so is_font_embeddable is null with NOT_EXPOSED_BY_CLASSIC_DOM rather than guessed.',
    inputSchema: { uuids }, annotations: READ_ANNOTATIONS,
  }, async (params) => executeToolJsx(readJsx, params));
  server.registerTool('set_typography', {
    title: 'Set Typography',
    description: 'Set only explicitly supplied character and paragraph formatting on one or more TextFrames in one background JSX execution. Direct formatting belongs here; use apply_text_style for named styles, replace_formatted_text for content, list_fonts/replace-font workflows for document-wide font changes, and set_appearance for non-text appearance. Returns per-property DOM readback. FONT_DEPENDENT means the requested font or OpenType feature could not be applied; NOT_EXPOSED_BY_CLASSIC_DOM is never reported as success.',
    inputSchema: { uuids, character: characterSchema.optional(), paragraph: paragraphSchema.optional() }, annotations: WRITE_ANNOTATIONS,
  }, async (params) => executeToolJsx(writeJsx, params));
}
