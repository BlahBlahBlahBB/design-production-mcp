/**
 * Kept as one ExtendScript-compatible source string so the exact classifier used
 * in Illustrator can also be executed by the automated Node tests.
 */
export const SCRIPT_CLASSIFIER_JSX = `
function dpmCodePointAt(text, index) {
  if (!text || index < 0 || index >= text.length) return -1;
  var first = text.charCodeAt(index);
  if (first >= 55296 && first <= 56319 && index + 1 < text.length) {
    var second = text.charCodeAt(index + 1);
    if (second >= 56320 && second <= 57343) return 65536 + ((first - 55296) * 1024) + (second - 56320);
  }
  return first;
}
function dpmClassifyCodePoint(cp) {
  if (cp === 9 || cp === 10 || cp === 13 || cp === 32 || cp === 0xA0 || cp === 0x3000 ||
      (cp >= 0x2000 && cp <= 0x200A) || cp === 0x2028 || cp === 0x2029 || cp === 0x202F || cp === 0x205F) return 'whitespace';
  if ((cp >= 0x3400 && cp <= 0x4DBF) ||
      (cp >= 0x4E00 && cp <= 0x9FFF) ||
      (cp >= 0xF900 && cp <= 0xFAFF) ||
      (cp >= 0x20000 && cp <= 0x2FA1F) ||
      (cp >= 0x30000 && cp <= 0x323AF) ||
      (cp >= 0x3000 && cp <= 0x303F) ||
      (cp >= 0xFF01 && cp <= 0xFF0F) ||
      (cp >= 0xFF1A && cp <= 0xFF20) ||
      (cp >= 0xFF3B && cp <= 0xFF40) ||
      (cp >= 0xFF5B && cp <= 0xFF65)) return 'han';
  if ((cp >= 0x41 && cp <= 0x5A) || (cp >= 0x61 && cp <= 0x7A) ||
      (cp >= 0x30 && cp <= 0x39) ||
      (cp >= 0x21 && cp <= 0x2F) || (cp >= 0x3A && cp <= 0x40) ||
      (cp >= 0x5B && cp <= 0x60) || (cp >= 0x7B && cp <= 0x7E) ||
      (cp >= 0x00C0 && cp <= 0x00D6) || (cp >= 0x00D8 && cp <= 0x00F6) ||
      (cp >= 0x00F8 && cp <= 0x024F) ||
      (cp >= 0x1E00 && cp <= 0x1EFF)) return 'latin';
  return 'other';
}
function dpmClassifyTextCharacter(characters, index) {
  var value = '';
  try { value = characters[index].contents || ''; } catch (_) {}
  var cp = dpmCodePointAt(value, 0);
  if (cp >= 0xD800 && cp <= 0xDBFF) {
    var next = '';
    try { next = characters[index + 1].contents || ''; } catch (_) {}
    var low = dpmCodePointAt(next, 0);
    if (low >= 0xDC00 && low <= 0xDFFF) cp = 65536 + ((cp - 55296) * 1024) + (low - 56320);
  } else if (cp >= 0xDC00 && cp <= 0xDFFF && index > 0) {
    var previous = '';
    try { previous = characters[index - 1].contents || ''; } catch (_) {}
    var high = dpmCodePointAt(previous, 0);
    if (high >= 0xD800 && high <= 0xDBFF) cp = 65536 + ((high - 55296) * 1024) + (cp - 56320);
  }
  return dpmClassifyCodePoint(cp);
}
function dpmResolveScriptFont(rule, fonts) {
  if (!rule.font_name && !rule.font_family) return { font:null, styles:[] };
  var styles = [];
  for (var i = 0; i < fonts.length; i++) {
    var font = fonts[i];
    if (rule.font_name && font.name === rule.font_name) return { font:font, styles:[] };
    if (!rule.font_name && font.family === rule.font_family) {
      styles.push(font.style);
      if (font.style === rule.font_style) return { font:font, styles:styles };
    }
  }
  return { font:null, styles:styles };
}
function dpmAddScriptOutcome(states, property, kind, code, readback) {
  var state = states[property] || (states[property] = { property:property, attempted:0, applied:0, failed:0, unsupported:0, code:null, readback:undefined });
  if (kind === 'applied') { state.attempted++; state.applied++; state.readback = readback; }
  else if (kind === 'failed') { state.attempted++; state.failed++; state.code = code || 'READBACK_MISMATCH'; state.readback = readback; }
  else if (kind === 'unsupported') { state.attempted++; state.unsupported++; state.code = code || 'NOT_EXPOSED_BY_CLASSIC_DOM'; }
  return state;
}
function dpmFinalizeScriptProperties(states, result) {
  var hasApplied = false;
  for (var key in states) {
    var state = states[key];
    state.status = state.unsupported ? (state.applied ? 'PARTIAL' : 'UNSUPPORTED') : state.failed ? (state.applied ? 'PARTIAL' : 'FAIL') : 'PASS';
    if (state.applied) hasApplied = true;
    result.properties.push(state);
    if (state.status !== 'PASS') result.success = false;
  }
  result.status = result.success ? 'PASS' : hasApplied ? 'PARTIAL' : 'FAIL';
  return result;
}
`;

export type ScriptName = 'han' | 'latin' | 'other' | 'whitespace';
