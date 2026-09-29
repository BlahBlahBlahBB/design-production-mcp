import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { EXPLICIT_BOUNDS_JSX } from '../geometry.js';
import { executeToolJsx } from '../tool-executor.js';
import { WRITE_ANNOTATIONS } from './shared.js';

/** Area-text-only, single-frame font-size fitting.  It intentionally does not
 * share set_typography's broader batch/property surface. */
export const autoFitTextSchema = z.object({
  target_uuid: z.string().min(1).describe('UUID of one editable, visible AreaText frame.'),
  min_font_size: z.number().finite().positive().describe('Smallest permitted font size in points.'),
  max_font_size: z.number().finite().positive().describe('Largest permitted font size in points.'),
}).strict().refine(
  (value) => value.max_font_size >= value.min_font_size,
  { message: 'max_font_size must be greater than or equal to min_font_size.', path: ['max_font_size'] },
);

const jsxCode = `
var preflight = preflightChecks();
if (preflight) writeResultFile(RESULT_PATH, preflight);
else try {
  var params = readParamsFile(PARAMS_PATH);
  var SIZE_PRECISION_PT = 0.1;
  var SIZE_TOLERANCE_PT = 0.01;
  var MAX_SOLVER_ITERATIONS = 16;
  var startedAt = new Date().getTime(), preflightStartedAt = startedAt;
  var installedFontIndex = null;
  ${EXPLICIT_BOUNDS_JSX}

  function elapsedSince(started) { return new Date().getTime() - started; }
  function closeEnough(first, second) { return Math.abs(first - second) <= SIZE_TOLERANCE_PT; }
  function failure(code, message, state, extra) {
    var result = { success:false, target_uuid:params.target_uuid, code:code, message:message, state:state };
    if (extra) for (var key in extra) if (extra.hasOwnProperty(key)) result[key] = extra[key];
    if (!result.timing) result.timing = { elapsed_ms:elapsedSince(startedAt), preflight_ms:elapsedSince(preflightStartedAt) };
    writeResultFile(RESULT_PATH, result);
  }
  function readContents(tf) {
    var contents = tf.contents;
    if (typeof contents !== "string" || contents.length === 0) throw new Error("Text frame contents are empty or unreadable");
    return contents;
  }
  function readAreaTextFitState(tf) {
    // Classic Illustrator does not expose InDesign's TextFrame.overflows.
    // For AreaText, the lines collection enumerates only text laid out in the frame.  Its
    // final visible TextRange therefore ends before the full frame TextRange
    // when hidden overset text remains.
    var complete = tf.textRange;
    var completeContents = complete ? complete.contents : null;
    var completeStart = complete ? complete.start : null;
    var completeEnd = complete ? complete.end : null;
    var lines = tf.lines;
    if (typeof completeContents !== "string" || typeof completeStart !== "number" || typeof completeEnd !== "number" || !lines || typeof lines.length !== "number") {
      throw new Error("AreaText visible-line fit state is unreadable");
    }
    if (completeContents.length === 0) throw new Error("Text frame contents are empty or unreadable");
    if (lines.length === 0) {
      return {
        readable:true,
        overset:true,
        method:"visible_lines_text_range_end",
        visible_line_count:0,
        complete_range_start:completeStart,
        complete_range_end:completeEnd,
        last_visible_line_end:null,
        ignored_terminal_return:false
      };
    }
    var lastLine = lines[lines.length - 1];
    var lastVisibleEnd = lastLine ? lastLine.end : null;
    if (typeof lastVisibleEnd !== "number") throw new Error("Last visible AreaText line endpoint is unreadable");

    // Illustrator may represent a terminal paragraph return as one position
    // after the last visible glyph even when that return is not its own line.
    // Normalize exactly that terminal control-character case; do not use a
    // character-count heuristic for the primary overset decision.
    var ignoredTerminalReturn = completeContents.charAt(completeContents.length - 1) === "\\r" && lastVisibleEnd === completeEnd - 1;
    var reachesCompleteRange = lastVisibleEnd === completeEnd || ignoredTerminalReturn;
    return {
      readable:true,
      overset:!reachesCompleteRange,
      method:"visible_lines_text_range_end",
      visible_line_count:lines.length,
      complete_range_start:completeStart,
      complete_range_end:completeEnd,
      last_visible_line_end:lastVisibleEnd,
      ignored_terminal_return:ignoredTerminalReturn
    };
  }
  function isInstalledFont(fontName) {
    if (!installedFontIndex) {
      installedFontIndex = {};
      for (var fi = 0; fi < app.textFonts.length; fi++) installedFontIndex["@" + app.textFonts[fi].name] = true;
    }
    return installedFontIndex["@" + fontName] === true;
  }
  function readUniformFontState(tf) {
    var chars = tf.characters, size = null;
    if (!chars || chars.length < 1) throw new Error("Text characters are unavailable");
    for (var ci = 0; ci < chars.length; ci++) {
      var attrs = chars[ci].characterAttributes;
      if (!attrs) throw new Error("Character attributes are unreadable at index " + ci);
      var currentSize = attrs.size;
      if (typeof currentSize !== "number" || !isFinite(currentSize) || currentSize <= 0) throw new Error("Font size is unreadable at index " + ci);
      var font = attrs.textFont;
      if (!font || !font.name) throw new Error("Font state is unreadable at index " + ci);
      if (!isInstalledFont(font.name)) throw new Error("Font is missing at index " + ci);
      if (size === null) size = currentSize;
      else if (!closeEnough(size, currentSize)) throw new Error("Font size is mixed across the text frame");
    }
    return { size:size, character_count:chars.length };
  }
  function readInvariantState(tf) {
    var chars = tf.characters, leading = [], autoLeading = [], leadingReadable = [], fontNames = [];
    for (var ci = 0; ci < chars.length; ci++) {
      var attrs = chars[ci].characterAttributes;
      if (!attrs) throw new Error("Character attributes are unreadable at index " + ci);
      var font = attrs.textFont;
      if (!font || !font.name) throw new Error("Font state is unreadable at index " + ci);
      if (typeof attrs.autoLeading !== "boolean") throw new Error("Auto Leading mode is unreadable at index " + ci);
      var currentLeading = attrs.leading;
      fontNames.push(font.name);
      autoLeading.push(attrs.autoLeading);
      leadingReadable.push(typeof currentLeading === "number" && isFinite(currentLeading));
      leading.push(currentLeading);
    }
    return { contents:readContents(tf), font_names:fontNames, leading:leading, auto_leading:autoLeading, leading_readable:leadingReadable };
  }
  function invariantMatches(tf, original) {
    try {
      var current = readInvariantState(tf);
      if (current.contents !== original.contents || jsonStringify(current.font_names) !== jsonStringify(original.font_names) || jsonStringify(current.auto_leading) !== jsonStringify(original.auto_leading)) return false;
      for (var ci = 0; ci < original.auto_leading.length; ci++) {
        // With Auto Leading, Illustrator derives the numeric leading from the
        // current font size.  Preserve its authored mode and readability, not
        // that derived number.  Manual leading remains an exact invariant.
        if (original.auto_leading[ci] === false) {
          if (!original.leading_readable[ci] || !current.leading_readable[ci] || !closeEnough(original.leading[ci], current.leading[ci])) return false;
        } else if (original.leading_readable[ci] && !current.leading_readable[ci]) return false;
      }
      return true;
    } catch (_) { return false; }
  }
  function setUniformFontSize(tf, requestedSize) {
    // TextRange is the primary, single assignment.  Classic DOM wrappers can
    // retain per-character overrides, so only then use the scoped fallback.
    tf.textRange.characterAttributes.size = requestedSize;
    var afterRange = readUniformFontState(tf);
    if (closeEnough(afterRange.size, requestedSize)) return afterRange;
    var chars = tf.characters;
    for (var ci = 0; ci < chars.length; ci++) chars[ci].characterAttributes.size = requestedSize;
    return readUniformFontState(tf);
  }
  function readOptionalBounds(tf, policy) { try { return dpmReadBounds(tf, policy); } catch (_) { return null; } }
  function restoreOriginal(tf, originalSize, originalOverset, originalInvariant) {
    var restoration = { attempted:true, verified:false, state:"RESTORATION_ATTEMPTED" };
    try {
      var restored = setUniformFontSize(tf, originalSize);
      restoration.restored_font_size = restored.size;
      restoration.restored_has_text_overflow = readAreaTextFitState(tf).overset;
      restoration.typography_preserved = invariantMatches(tf, originalInvariant);
      restoration.verified = closeEnough(restored.size, originalSize) && restoration.restored_has_text_overflow === originalOverset && restoration.typography_preserved;
      restoration.state = restoration.verified ? "ROLLBACK_VERIFIED" : "RESTORATION_UNVERIFIED";
    } catch (restoreError) {
      restoration.error = restoreError.message;
      restoration.state = "RESTORATION_UNVERIFIED";
    }
    return restoration;
  }
  function verifyFinal(tf, targetUUID, expectedSize, originalInvariant, initialGeometricBounds) {
    var found = findItemByUUID(targetUUID), first = readUniformFontState(tf), firstFitState = readAreaTextFitState(tf);
    var second = readUniformFontState(tf), secondFitState = readAreaTextFitState(tf);
    var finalGeometricBounds = readOptionalBounds(tf, "geometric");
    return {
      passed: Boolean(found && found.typename === "TextFrame") && closeEnough(first.size, expectedSize) && closeEnough(second.size, expectedSize) && !firstFitState.overset && !secondFitState.overset && invariantMatches(tf, originalInvariant),
      target_identity_revalidated: Boolean(found && found.typename === "TextFrame"),
      font_size_first_read: first.size,
      font_size_second_read: second.size,
      has_text_overflow_first_read: firstFitState.overset,
      has_text_overflow_second_read: secondFitState.overset,
      overset_detector: { method:firstFitState.method, first_read:firstFitState, second_read:secondFitState },
      content_and_leading_unchanged: invariantMatches(tf, originalInvariant),
      geometric_bounds_before: initialGeometricBounds,
      geometric_bounds_after: finalGeometricBounds,
      frame_geometry_unchanged: initialGeometricBounds && finalGeometricBounds ? dpmBoundsMatch(initialGeometricBounds, finalGeometricBounds, SIZE_TOLERANCE_PT) : null,
      visible_bounds_after: readOptionalBounds(tf, "visible")
    };
  }

  var target = findItemByUUID(params.target_uuid);
  if (!target) failure("TARGET_NOT_FOUND", "No object found matching target_uuid.", "FAILED_NO_MUTATION", { mutation_started:false, restoration:{ attempted:false, verified:false, state:"NOT_REQUIRED" } });
  else if (target.typename !== "TextFrame") failure("TARGET_NOT_TEXT_FRAME", "target_uuid must resolve to a TextFrame.", "FAILED_NO_MUTATION", { mutation_started:false, restoration:{ attempted:false, verified:false, state:"NOT_REQUIRED" } });
  else if (getTextKind(target) !== "area") failure("UNSUPPORTED_TEXT_KIND", "auto_fit_text supports AreaText only in Wave 1.", "FAILED_NO_MUTATION", { mutation_started:false, restoration:{ attempted:false, verified:false, state:"NOT_REQUIRED" } });
  else if (target.locked || target.hidden) failure("TARGET_NOT_MUTABLE", "Text frame must be unlocked and visible.", "FAILED_NO_MUTATION", { mutation_started:false, restoration:{ attempted:false, verified:false, state:"NOT_REQUIRED" } });
  else if (target.editable !== true) failure("TARGET_NOT_EDITABLE", "Text frame is not editable.", "FAILED_NO_MUTATION", { mutation_started:false, restoration:{ attempted:false, verified:false, state:"NOT_REQUIRED" } });
  else {
    var mutationStarted = false, originalSize = null, originalOverset = null;
    try {
      var originalInvariant = readInvariantState(target);
      var originalState = readUniformFontState(target);
      originalSize = originalState.size;
      originalOverset = readAreaTextFitState(target).overset;
      var initialGeometricBounds = readOptionalBounds(target, "geometric");
      var preflightMs = elapsedSince(preflightStartedAt), solverStartedAt = new Date().getTime();
      var iterations = 0, lastAppliedSize = null;
      function applyAndMeasure(size) {
        if (iterations >= MAX_SOLVER_ITERATIONS) throw new Error("Solver iteration limit reached");
        mutationStarted = true;
        var state = setUniformFontSize(target, size);
        if (!closeEnough(state.size, size)) throw new Error("Font-size assignment did not verify");
        iterations++;
        lastAppliedSize = state.size;
        return { size:state.size, has_text_overflow:readAreaTextFitState(target).overset };
      }

      var minimum = applyAndMeasure(params.min_font_size);
      if (minimum.has_text_overflow) {
        var noFitRestoration = restoreOriginal(target, originalSize, originalOverset, originalInvariant);
        failure("NO_FIT_IN_RANGE", "Text still overflows at min_font_size; original font size was restored when verification allowed.", noFitRestoration.state, {
          mutation_started:mutationStarted,
          original_font_size:originalSize,
          min_font_size:params.min_font_size,
          max_font_size:params.max_font_size,
          iterations:iterations,
          has_text_overflow:true,
          restoration:noFitRestoration,
          timing:{ elapsed_ms:elapsedSince(startedAt), preflight_ms:preflightMs, solver_ms:elapsedSince(solverStartedAt), verification_ms:0 }
        });
      } else {
        var fitted = minimum.size, maxAttempt = minimum;
        if (!closeEnough(params.min_font_size, params.max_font_size)) maxAttempt = applyAndMeasure(params.max_font_size);
        if (!maxAttempt.has_text_overflow) fitted = maxAttempt.size;
        else {
          var low = minimum.size, high = params.max_font_size;
          while ((high - low) > SIZE_PRECISION_PT && iterations < MAX_SOLVER_ITERATIONS - 1) {
            var candidate = low + ((high - low) / 2);
            var attempt = applyAndMeasure(candidate);
            if (attempt.has_text_overflow) high = candidate;
            else { low = attempt.size; fitted = attempt.size; }
          }
          if (!closeEnough(lastAppliedSize, fitted)) applyAndMeasure(fitted);
        }
        var solverMs = elapsedSince(solverStartedAt), verificationStartedAt = new Date().getTime();
        var verification = verifyFinal(target, params.target_uuid, fitted, originalInvariant, initialGeometricBounds);
        var verificationMs = elapsedSince(verificationStartedAt);
        if (!verification.passed) {
          var failedVerificationRestoration = restoreOriginal(target, originalSize, originalOverset, originalInvariant);
          failure("FINAL_VERIFICATION_FAILED", "Font-size fitting did not pass stable final verification; original font size was restored when verification allowed.", failedVerificationRestoration.state, {
            mutation_started:mutationStarted,
            original_font_size:originalSize,
            fitted_font_size:fitted,
            min_font_size:params.min_font_size,
            max_font_size:params.max_font_size,
            iterations:iterations,
            has_text_overflow:verification.has_text_overflow_second_read,
            verification:verification,
            restoration:failedVerificationRestoration,
            timing:{ elapsed_ms:elapsedSince(startedAt), preflight_ms:preflightMs, solver_ms:solverMs, verification_ms:verificationMs }
          });
        } else {
          writeResultFile(RESULT_PATH, {
            success:true,
            target_uuid:params.target_uuid,
            original_font_size:originalSize,
            fitted_font_size:fitted,
            min_font_size:params.min_font_size,
            max_font_size:params.max_font_size,
            iterations:iterations,
            has_text_overflow:false,
            verification:verification,
            timing:{ elapsed_ms:elapsedSince(startedAt), preflight_ms:preflightMs, solver_ms:solverMs, verification_ms:verificationMs }
          });
        }
      }
    } catch (fitError) {
      var unexpectedRestoration = mutationStarted && originalSize !== null ? restoreOriginal(target, originalSize, originalOverset, originalInvariant) : { attempted:false, verified:false, state:"NOT_REQUIRED" };
      failure("AUTO_FIT_FAILED", fitError.message, mutationStarted ? unexpectedRestoration.state : "FAILED_NO_MUTATION", {
        mutation_started:mutationStarted,
        original_font_size:originalSize,
        restoration:unexpectedRestoration
      });
    }
  }
} catch (error) {
  writeResultFile(RESULT_PATH, { success:false, code:"AUTO_FIT_FAILED", message:"auto_fit_text failed: " + error.message, line:error.line, state:"FAILED_NO_MUTATION" });
}
`;

export function register(server: McpServer): void {
  server.registerTool('auto_fit_text', {
    title: 'Auto Fit Area Text',
    description: 'Fit one editable, visible AreaText frame by changing only its uniform font size within an inclusive point-size range. The bounded solver verifies overflow twice and restores the original size on no-fit or failed verification when restoration can be verified.',
    inputSchema: autoFitTextSchema,
    annotations: WRITE_ANNOTATIONS,
  }, async (params) => executeToolJsx(jsxCode, params, {
    timeoutMs: 60_000,
    includeTiming: true,
    activate: false,
  }));
}
