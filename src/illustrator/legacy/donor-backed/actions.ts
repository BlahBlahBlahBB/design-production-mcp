/**
 * MIT-derived from Alexander Ladygin's AI_PS_Library.js, revision
 * fc7625410b62c833fce100f67cf18a97588279c5. The Illustrator Action event
 * payloads below intentionally retain the donor's plugin names and numeric
 * parameter IDs; only the wrapper/temporary file handling is adapted.
 */

export type PathfinderMode =
  | "unite" | "minus_front" | "intersect" | "exclude" | "minus_back"
  | "divide" | "trim" | "merge" | "crop" | "outline";

export interface ExpandOptions {
  object?: boolean;
  fill?: boolean;
  stroke?: boolean;
  gradient?: boolean;
}

/** .aia names are length-prefixed UTF-8 byte strings, as in the MIT donor. */
function hex(value: string): string {
  return Buffer.from(value, "utf8").toString("hex");
}

function byteLength(value: string): number {
  return Buffer.byteLength(value, "utf8");
}

let actionSequence = 0;

function uniqueActionNames(prefix: "Expand" | "Pathfinder") {
  actionSequence += 1;
  const suffix = `${Date.now().toString(36)}_${actionSequence}`;
  return {
    suffix,
    setName: `DPM${prefix}Set_${suffix}`,
    actionName: `DPM${prefix}_${suffix}`,
  };
}

function event(name: string, value: string): string {
  return [
    "\t\t/useRulersIn1stQuadrant 0",
    "\t\t/internalName (ai_plugin_pathfinder)",
    `\t\t/localizedName [ 10\n\t\t\t${hex("Pathfinder")}\n\t\t]`,
    "\t\t/isOpen 0", "\t\t/isOn 1", "\t\t/hasDialog 0", "\t\t/parameterCount 1",
    "\t\t/parameter-1 {", "\t\t\t/key 1851878757", "\t\t\t/showInPalette -1",
    "\t\t\t/type (enumerated)", `\t\t\t/name [ ${byteLength(name)}\n\t\t\t\t${hex(name)}\n\t\t\t]`, `\t\t\t/value ${value}`, "\t\t}",
  ].join("\n");
}

const PATHFINDER: Record<PathfinderMode, readonly [string, string]> = {
  unite: ["Add", "0"], minus_front: ["Subtract", "3"], intersect: ["Intersect", "1"], exclude: ["Exclude", "2"],
  minus_back: ["MinusBack", "4"], divide: ["Divide", "5"], outline: ["Outline", "6"], trim: ["trim", "7"], merge: ["Merge", "8"], crop: ["Crop", "9"],
};

/** Build the exact .aia-style event shape used by the donor's Pathfinder helper. */
export function buildPathfinderAction(mode: PathfinderMode): string {
  const [name, value] = PATHFINDER[mode];
  return actionDocument(event(name, value), "Pathfinder");
}

/** Build the donor's Object > Expand action with independent object/fill/stroke/gradient flags. */
export function buildExpandAction(options: ExpandOptions = {}): string {
  const flag = (value: boolean | undefined) => value === true ? 1 : 0;
  const payload = [
    "\t\t/useRulersIn1stQuadrant 0", "\t\t/internalName (ai_plugin_expand)",
    `\t\t/localizedName [ 6\n\t\t\t${hex("Expand")}\n\t\t]`, "\t\t/isOpen 0", "\t\t/isOn 1", "\t\t/hasDialog 1", "\t\t/showDialog 0", "\t\t/parameterCount 4",
    `\t\t/parameter-1 {\n\t\t\t/key 1868720756\n\t\t\t/showInPalette -1\n\t\t\t/type (boolean)\n\t\t\t/value ${flag(options.object)}\n\t\t}`,
    `\t\t/parameter-2 {\n\t\t\t/key 1718185068\n\t\t\t/showInPalette -1\n\t\t\t/type (boolean)\n\t\t\t/value ${flag(options.fill)}\n\t\t}`,
    `\t\t/parameter-3 {\n\t\t\t/key 1937011307\n\t\t\t/showInPalette -1\n\t\t\t/type (boolean)\n\t\t\t/value ${flag(options.stroke)}\n\t\t}`,
    `\t\t/parameter-4 {\n\t\t\t/key 1936553064\n\t\t\t/showInPalette -1\n\t\t\t/type (boolean)\n\t\t\t/value ${flag(options.gradient)}\n\t\t}`,
  ].join("\n");
  return actionDocument(payload, "Expand");
}

function actionDocument(payload: string, prefix: "Expand" | "Pathfinder"): string {
  const { suffix, setName, actionName } = uniqueActionNames(prefix);
  const data = [
    "/version 3", `/name [ ${byteLength(setName)}\n\t${hex(setName)}\n]`, "/isOpen 0", "/actionCount 1", "/action-1 {",
    `\t/name [ ${byteLength(actionName)}\n\t\t${hex(actionName)}\n\t]`, "\t/keyIndex 0", "\t/colorIndex 0", "\t/isOpen 0", "\t/eventCount 1", "\t/event-1 {", payload, "\t}", "}", "",
  ].join("\n");
  return `
    var __dpmActionSet = ${JSON.stringify(setName)};
    var __dpmActionName = ${JSON.stringify(actionName)};
    var __dpmActionFile = new File(Folder.temp.fsName + '/dpm-${prefix.toLowerCase()}-${suffix}.aia');
    try {
      if (!app.selection || app.selection.length === 0) return __dpmDonorFailure('TARGET_NOT_FOUND', 'preflight', 'This operation requires a preselected target set.', false);
      try { app.unloadAction(__dpmActionSet, ''); } catch (e0) {}
      if (!__dpmActionFile.open('w')) throw new Error('ACTION_FILE_OPEN_FAILED');
      __dpmActionFile.write(${JSON.stringify(data)}); __dpmActionFile.close();
      app.loadAction(__dpmActionFile);
      app.doScript(__dpmActionName, __dpmActionSet);
      return { ok: true, value: { action: __dpmActionName, actionSet: __dpmActionSet, actionFile: __dpmActionFile.fsName, selectionCount: app.selection.length } };
    } catch (e) {
      return __dpmDonorFailure('ILLUSTRATOR_EXECUTION_FAILED', 'mutation', 'Donor Action failed: ' + e, true);
    } finally {
      try { app.unloadAction(__dpmActionSet, ''); } catch (e1) {}
      try { if (__dpmActionFile.exists) __dpmActionFile.remove(); } catch (e2) {}
    }
  `;
}
