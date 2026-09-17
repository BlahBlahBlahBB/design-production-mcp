import type { IllustratorBridge } from "../../../executor/bridge.js";
import type { ObjectLocator } from "../../../executor/read-schema.js";
import type { MutationResult } from "../../../production/mutation/context.js";
import { SafeMutationContext } from "../../../production/mutation/context.js";
import { executeSafeDonorOperation } from "./safe-donor-operation.js";
import { buildExpandAction, buildPathfinderAction, type ExpandOptions, type PathfinderMode } from "../donor-backed/actions.js";
import { buildFitActiveArtboardToSelectionJsx } from "../donor-backed/creold-compat.js";
import { buildPlaceImageJsx, buildRelinkSelectedImageJsx, type PlaceImageRequest } from "../donor-backed/links.js";
import { buildRearrangeArtboardsJsx, type ArtboardLayout } from "../donor-backed/artboards.js";

export { type PathfinderMode, type ExpandOptions, type PlaceImageRequest, type ArtboardLayout };

export interface TargetedDonorRequest { locators: ObjectLocator[]; }

/**
 * Selection is established by the managed session from supplied structural
 * locators immediately before this call.  It is deliberately not a generic
 * script capability, and only accepts the fixed operation set below.
 */
export async function runPathfinder(
  bridge: IllustratorBridge, context: SafeMutationContext, workPath: string, mode: PathfinderMode,
): Promise<MutationResult<{ action: string; selectionCount: number }>> {
  return executeSafeDonorOperation(bridge, context, {
    operation: `pathfinder-${mode}`, workPath, jsx: buildPathfinderAction(mode),
    classification: { access: "DOCUMENT_WRITE", impact: "STRUCTURE", destructive: true },
  });
}

export async function runExpand(
  bridge: IllustratorBridge, context: SafeMutationContext, workPath: string, options: ExpandOptions,
): Promise<MutationResult<{ action: string; selectionCount: number }>> {
  return executeSafeDonorOperation(bridge, context, {
    operation: "expand-objects", workPath, jsx: buildExpandAction(options),
    classification: { access: "DOCUMENT_WRITE", impact: "STRUCTURE", destructive: true },
  });
}

export async function placeImage(
  bridge: IllustratorBridge, context: SafeMutationContext, workPath: string, request: PlaceImageRequest,
): Promise<MutationResult<{ type: string; name: string; bounds: number[] }>> {
  return executeSafeDonorOperation(bridge, context, {
    operation: "place-image", workPath, jsx: buildPlaceImageJsx(request),
    classification: { access: "DOCUMENT_WRITE", impact: "STRUCTURE", destructive: request.embed === true },
  });
}

export async function relinkImage(
  bridge: IllustratorBridge, context: SafeMutationContext, workPath: string, newPath: string,
): Promise<MutationResult<{ action: string; name: string; path: string }>> {
  return executeSafeDonorOperation(bridge, context, {
    operation: "relink-image", workPath, jsx: buildRelinkSelectedImageJsx(newPath),
    classification: { access: "DOCUMENT_WRITE", impact: "CONTENT", destructive: true },
  });
}

export async function rearrangeArtboards(
  bridge: IllustratorBridge, context: SafeMutationContext, workPath: string, layout: ArtboardLayout, rowsOrColumns: number, spacing: number,
): Promise<MutationResult<{ artboards: Array<{ index: number; name: string; rect: number[] }> }>> {
  return executeSafeDonorOperation(bridge, context, {
    operation: "rearrange-artboards", workPath, jsx: buildRearrangeArtboardsJsx(layout, rowsOrColumns, spacing),
    classification: { access: "DOCUMENT_WRITE", impact: "GEOMETRY", destructive: false },
  });
}

export async function fitArtboardToSelection(
  bridge: IllustratorBridge, context: SafeMutationContext, workPath: string,
): Promise<MutationResult<{ artboardIndex: number; rect: number[] }>> {
  return executeSafeDonorOperation(bridge, context, {
    operation: "fit-artboard-to-objects", workPath, jsx: buildFitActiveArtboardToSelectionJsx(),
    classification: { access: "DOCUMENT_WRITE", impact: "GEOMETRY", destructive: false },
  });
}
