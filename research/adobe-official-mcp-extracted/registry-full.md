# Reconstructed native registry

- Modules recovered: 28
- Declarations recovered: 90
- Likely public MCP tools: 71
- Internal/other declarations: 19

## Modules and declarations

- AlignmentTasks (2): AlignObjects, DistributeObjects
- AppearanceTasks (1): SetAppearance
- ArtboardTasks (11): ListArtboards, CreateArtboard, SetArtboardProperties, DuplicateArtboard, GetActiveArtboard, ScaleArtboards, FitArtboard, DeleteArtboard, SetActiveArtboard, MoveArtboards, GetArtboardProperties
- CanvasSummary (3): GetCanvasStructure, GetArtboardStructure, VisualizeSelection
- DocumentTasks (8): CreateDocument, SaveDocument, OpenDocument, ListDocuments, SwitchDocument, CloseDocument, SetDocumentProperties, GetUndoStack
- EffectTasks (2): ApplyEffect, RemoveEffect
- ExportTasks (6): Export, CapturePreview, CapturePreviewInternal, InspectAttachment, UploadAttachment, OpenInFirefly
- ExtractTasks (1): Extract
- FilterOperationTasks (1): FindObjects
- GenAITasks (4): TextToVector, EditTextToVector, InvokeTurntable, ConceptToVector
- GradientTasks (1): SetGradient
- ImageTraceTasks (1): Vectorize
- LayerTasks (1): CreateLayer
- ObjectPropertiesTasks (6): GetVisualAppearance, GetGeometry, GetTypographyMetrics, GetDynamicEffects, GetObjectStructure, GetBounds
- PathfinderTasks (1): PathfinderOperation
- PathTasks (1): CleanupPath
- PreflightTasks (1): RunPreflightChecks
- ScriptingTasks (1): ExecuteJavaScript
- SelectionTasks (2): RenameObject, SelectObjects
- StructuralTasks (15): DrawEllipse, DrawRectangle, DrawPolygon, DrawStar, DrawLine, DrawPath, DeleteObjects, DuplicateObjects, PlaceImage, Rasterize, CreateGroup, MoveObjectsToContainer, CreateClippingMask, DrawSVG, ArrangeArt
- SwatchTasks (2): GetSwatches, ModifySwatches
- TextTasks (9): CreatePointText, CreateAreaText, ReplaceText, SetTextProperties, SetCharacterStyle, SetParagraphStyle, ConvertTextToOutlines, GetFonts, ReplaceFont
- TransformTasks (3): MoveObjects, RotateObjects, ScaleObjects
- RecolorTasks (1): RecolorArtwork
- FileTasks (1): SaveTextFile
- AIAssistantTasks (3): SendUserPromptToAIAssistant, ListUserSkills, DeleteUserSkill
- ProbeTool (1): ProbeTool
- MetaTools (1): ExecuteBatchTool

## Evidence model

Every record in the machine-readable files points to the copied `MCPToolkit` binary, the immutable raw registry extraction, a line span in that extraction, and—where found—a `strings -t x` file offset. `externalAccess` is embedded metadata, not proof of live exposure. No tool was invoked.
