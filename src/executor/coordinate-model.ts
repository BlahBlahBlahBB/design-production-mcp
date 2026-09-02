import type { ArtboardInfo, ConvertCoordinateRequest, CoordinateConversion } from "./read-schema.js";

export type CoordinateResult =
  | { ok: true; value: CoordinateConversion }
  | { ok: false; error: "INVALID_ARTBOARD_INDEX" | "INVALID_COORDINATE_REQUEST" };

export function convertCoordinateForArtboards(
  request: ConvertCoordinateRequest,
  artboards: ArtboardInfo[],
): CoordinateResult {
  if (!Number.isFinite(request.x) || !Number.isFinite(request.y)
    || (request.direction !== "artboard-to-document" && request.direction !== "document-to-artboard")) {
    return { ok: false, error: "INVALID_COORDINATE_REQUEST" };
  }

  const active = artboards.find((artboard) => artboard.active)?.index ?? 0;
  const index = request.artboardIndex ?? active;
  const artboard = artboards.find((candidate) => candidate.index === index);
  if (!artboard) return { ok: false, error: "INVALID_ARTBOARD_INDEX" };

  const [left, top] = artboard.rect;
  if (request.direction === "artboard-to-document") {
    return {
      ok: true,
      value: {
        input: { x: request.x, y: request.y, space: "artboard" },
        output: { x: left + request.x, y: top - request.y, space: "document" },
        artboardIndex: index,
        artboardRect: artboard.rect,
      },
    };
  }

  return {
    ok: true,
    value: {
      input: { x: request.x, y: request.y, space: "document" },
      output: { x: request.x - left, y: top - request.y, space: "artboard" },
      artboardIndex: index,
      artboardRect: artboard.rect,
    },
  };
}
