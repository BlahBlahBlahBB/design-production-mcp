import test from 'node:test';
import assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';
import { readFileSync } from 'node:fs';
import { SCRIPT_CLASSIFIER_JSX } from '../src/illustrator/core/ie3jp/tools/typography-script-rules.js';
import { scriptRulesSchema } from '../src/illustrator/core/ie3jp/tools/typography-core.js';

function evaluateHelpers(expression: string): unknown {
  return runInNewContext(`${SCRIPT_CLASSIFIER_JSX}\n${expression}`);
}

test('Unicode classifier covers Han, Latin, punctuation, digits, whitespace, supplementary Han, and other', () => {
  const result = evaluateHelpers(`JSON.stringify({
    han:['汉','㐀','﨑','、','！','𠀀','𰀀'].map(function (char) { return dpmClassifyCodePoint(dpmCodePointAt(char, 0)); }),
    latin:['A','z','9','!','À','Ā','ǅ','ǟ'].map(function (char) { return dpmClassifyCodePoint(dpmCodePointAt(char, 0)); }),
    whitespace:[' ','\\t','\\r','\\n','　'].map(function (char) { return dpmClassifyCodePoint(dpmCodePointAt(char, 0)); }),
    other:['🙂','Ж'].map(function (char) { return dpmClassifyCodePoint(dpmCodePointAt(char, 0)); })
  })`);
  const parsed = JSON.parse(String(result));
  assert.deepEqual(parsed.han, Array(7).fill('han'));
  assert.deepEqual(parsed.latin, Array(8).fill('latin'));
  assert.deepEqual(parsed.whitespace, Array(5).fill('whitespace'));
  assert.deepEqual(parsed.other, ['other', 'other']);
});

test('surrogate pairs split across Illustrator character wrappers still classify as Han', () => {
  const result = evaluateHelpers(`JSON.stringify((function () {
    var pair = [{contents:'\\uD840'}, {contents:'\\uDC00'}];
    return [dpmClassifyTextCharacter(pair, 0), dpmClassifyTextCharacter(pair, 1)];
  })())`);
  assert.deepEqual(JSON.parse(String(result)), ['han', 'han']);
});

test('script font lookup is exact and does not choose a substitute style', () => {
  const result = evaluateHelpers(`JSON.stringify((function () {
    var fonts = [{name:'A-Regular',family:'A',style:'Regular'},{name:'A-Medium',family:'A',style:'Medium'},{name:'B-Bold',family:'B',style:'Bold'}];
    var exact = dpmResolveScriptFont({font_family:'A',font_style:'Medium'}, fonts);
    var missingHan = dpmResolveScriptFont({font_family:'A',font_style:'Semibold'}, fonts);
    var missingLatin = dpmResolveScriptFont({font_family:'Missing',font_style:'Bold'}, fonts);
    return {exact:exact.font.name, missingHan:missingHan.font, hanCandidates:missingHan.styles, missingLatin:missingLatin.font, latinCandidates:missingLatin.styles};
  })())`);
  const parsed = JSON.parse(String(result));
  assert.equal(parsed.exact, 'A-Medium');
  assert.equal(parsed.missingHan, null);
  assert.deepEqual(parsed.hanCandidates, ['Regular', 'Medium']);
  assert.equal(parsed.missingLatin, null);
  assert.deepEqual(parsed.latinCandidates, []);
});

test('script rules report independent missing-font failures and partial property outcomes', () => {
  const result = evaluateHelpers(`JSON.stringify((function () {
    var fonts = [{name:'Han-Regular',family:'Han',style:'Regular'},{name:'Latin-Bold',family:'Latin',style:'Bold'}];
    var han = dpmResolveScriptFont({font_family:'Han',font_style:'Medium'}, fonts);
    var latin = dpmResolveScriptFont({font_family:'Latin',font_style:'Bold'}, fonts);
    var states = {};
    dpmAddScriptOutcome(states, 'font', 'applied', null, {font_family:'Latin',font_style:'Bold'});
    dpmAddScriptOutcome(states, 'font', 'failed', 'FONT_NOT_FOUND');
    var summary = dpmFinalizeScriptProperties(states, {success:true,properties:[]});
    return {hanMissing:han.font === null, latinFound:latin.font.family, summary:summary};
  })())`);
  const parsed = JSON.parse(String(result));
  assert.equal(parsed.hanMissing, true);
  assert.equal(parsed.latinFound, 'Latin');
  assert.equal(parsed.summary.success, false);
  assert.equal(parsed.summary.properties[0].status, 'PARTIAL');
  assert.equal(parsed.summary.properties[0].applied, 1);
  assert.equal(parsed.summary.properties[0].failed, 1);
});

test('script rule font selector requires exact font_name or family plus style', () => {
  assert.equal(scriptRulesSchema.safeParse({ han: { font_family: 'Han' } }).success, false);
  assert.equal(scriptRulesSchema.safeParse({ han: { font_family: 'Han', font_style: 'Medium' } }).success, true);
  assert.equal(scriptRulesSchema.safeParse({ latin: { font_name: 'Latin-Bold' } }).success, true);
});

test('set_typography preserves frame-wide then script override then frame-wide paragraph order', () => {
  const source = readFileSync(new URL('../../src/illustrator/core/ie3jp/tools/typography-core.ts', import.meta.url), 'utf8');
  const frameCharacter = source.indexOf('if (c) {');
  const scripts = source.indexOf('if (params.script_rules) {', frameCharacter);
  const paragraph = source.indexOf('if (p) for (var pi=0;', scripts);
  assert.ok(frameCharacter >= 0 && scripts > frameCharacter && paragraph > scripts);
  assert.match(source, /apply\(item\.textRange\.characterAttributes, characterMap, c/);
});
