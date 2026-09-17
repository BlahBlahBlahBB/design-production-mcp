# Illustrator Core tools

The Illustrator Core operates on the current active Illustrator document. It does not require a DPM work-copy session. The default macOS target is Adobe Illustrator 2026 Stable; `set_illustrator_version` may select another installed version.

Backend key: **IE3JP JSX** = IE3JP's reviewed file-transport plus ExtendScript implementation; **Alexander Action** = fixed MIT Action payload executed against the current selection; **Creold DOM** = fixed non-interactive MIT-compatible Illustrator DOM implementation; **DPM bridge** = read-only local status bridge. “Smoke” is updated only when a Stable 30.8.1 smoke run actually covers the category.

| Tool | Purpose | Source | Illustrator backend | Direct current document | DPM Production safety | Stable 30.8.1 smoke |
| --- | --- | --- | --- | --- | --- | --- |
| `align_objects` | Align selected objects. | IE3JP | IE3JP JSX | Yes | No | Pending |
| `apply_graphic_style` | Apply a named graphic style. | IE3JP | IE3JP JSX | Yes | No | Pending |
| `apply_text_style` | Apply text styling. | IE3JP | IE3JP JSX | Yes | No | Pending |
| `assign_color_profile` | Assign a document color profile. | IE3JP | IE3JP JSX | Yes | No | Pending |
| `check_contrast` | Inspect contrast. | IE3JP | IE3JP JSX | Yes | No | Pending |
| `check_text_consistency` | Inspect text consistency. | IE3JP | IE3JP JSX | Yes | No | Pending |
| `close_document` | Close the active document. | IE3JP | IE3JP JSX | Yes | No | Pending |
| `convert_coordinate` | Convert document coordinates. | IE3JP | IE3JP JSX | Yes | No | Pending |
| `convert_to_outlines` | Outline selected text. | IE3JP | IE3JP JSX | Yes | No | Pending |
| `create_crop_marks` | Create crop marks. | IE3JP | IE3JP JSX | Yes | No | Pending |
| `create_document` | Create a document. | IE3JP | IE3JP JSX | Yes | No | PASS |
| `create_ellipse` | Create an ellipse. | IE3JP | IE3JP JSX | Yes | No | Pending |
| `create_gradient` | Create a gradient. | IE3JP | IE3JP JSX | Yes | No | PASS |
| `create_line` | Create a line. | IE3JP | IE3JP JSX | Yes | No | PASS |
| `create_path` | Create a path. | IE3JP | IE3JP JSX | Yes | No | Pending |
| `create_path_text` | Create text on a path. | IE3JP | IE3JP JSX | Yes | No | Pending |
| `create_rectangle` | Create a rectangle. | IE3JP | IE3JP JSX | Yes | No | PASS |
| `create_text_frame` | Create a text frame. | IE3JP | IE3JP JSX | Yes | No | PASS |
| `delete_objects` | Delete selected objects. | IE3JP | IE3JP JSX | Yes | No | Pending |
| `duplicate_active_artboard` | Duplicate the active artboard. | Creold | Creold DOM | Yes | No | Pending |
| `duplicate_objects` | Duplicate selected objects. | IE3JP | IE3JP JSX | Yes | No | Pending |
| `expand_objects` | Run Object > Expand with component flags. | Alexander | Alexander Action | Yes | No | PASS |
| `export` | Export the active document. | IE3JP | IE3JP JSX | Yes | No | PASS |
| `export_pdf` | Export PDF. | IE3JP | IE3JP JSX | Yes | No | Pending |
| `extract_design_tokens` | Extract design tokens. | IE3JP | IE3JP JSX | Yes | No | Pending |
| `find_objects` | Find document objects. | IE3JP | IE3JP JSX | Yes | No | Pending |
| `fit_artboard_to_selection` | Fit active artboard to selection. | Creold | Creold DOM | Yes | No | PASS |
| `get_artboards` | Read artboards. | IE3JP | IE3JP JSX | Yes | No | Pending |
| `get_colors` | Read colors. | IE3JP | IE3JP JSX | Yes | No | Pending |
| `get_document_info` | Read document metadata. | IE3JP | IE3JP JSX | Yes | No | PASS |
| `get_document_structure` | Read document structure. | IE3JP | IE3JP JSX | Yes | No | Pending |
| `get_effects` | Read effects. | IE3JP | IE3JP JSX | Yes | No | Pending |
| `get_groups` | Read groups. | IE3JP | IE3JP JSX | Yes | No | Pending |
| `get_guidelines` | Read guides. | IE3JP | IE3JP JSX | Yes | No | Pending |
| `get_images` | Read placed images. | IE3JP | IE3JP JSX | Yes | No | Pending |
| `get_layers` | Read layers. | IE3JP | IE3JP JSX | Yes | No | Pending |
| `get_overprint_info` | Inspect overprint. | IE3JP | IE3JP JSX | Yes | No | Pending |
| `get_path_items` | Read path items. | IE3JP | IE3JP JSX | Yes | No | Pending |
| `get_selection` | Read selection. | IE3JP | IE3JP JSX | Yes | No | Pending |
| `get_separation_info` | Inspect separations. | IE3JP | IE3JP JSX | Yes | No | Pending |
| `get_symbols` | Read symbols. | IE3JP | IE3JP JSX | Yes | No | Pending |
| `get_text_frame_detail` | Read text-frame detail. | IE3JP | IE3JP JSX | Yes | No | Pending |
| `group_objects` | Group selected objects. | IE3JP | IE3JP JSX | Yes | No | Pending |
| `illustrator_status` | Read local bridge status. | DPM | DPM bridge | Yes | No | Pending |
| `image_trace_selection` | Trace and expand selected artwork. | Creold | Creold DOM | Yes | No | Pending |
| `import_svg_as_editable` | Import editable SVG. | IE3JP | IE3JP JSX | Yes | No | Pending |
| `list_fonts` | List available fonts. | IE3JP | IE3JP JSX | Yes | No | Pending |
| `list_graphic_styles` | List graphic styles. | IE3JP | IE3JP JSX | Yes | No | Pending |
| `list_text_frames` | List text frames. | IE3JP | IE3JP JSX | Yes | No | Pending |
| `list_text_styles` | List text styles. | IE3JP | IE3JP JSX | Yes | No | Pending |
| `manage_artboards` | Manage artboards. | IE3JP | IE3JP JSX | Yes | No | Pending |
| `manage_datasets` | Manage datasets. | IE3JP | IE3JP JSX | Yes | No | Pending |
| `manage_layers` | Manage layers. | IE3JP | IE3JP JSX | Yes | No | PASS |
| `manage_linked_images` | Relink or embed placed images. | IE3JP | IE3JP JSX | Yes | No | PASS |
| `manage_swatches` | Manage swatches. | IE3JP | IE3JP JSX | Yes | No | Pending |
| `modify_object` | Modify a selected object. | IE3JP | IE3JP JSX | Yes | No | Pending |
| `move_to_layer` | Move selection to a layer. | IE3JP | IE3JP JSX | Yes | No | Pending |
| `open_document` | Open a document. | IE3JP | IE3JP JSX | Yes | No | Pending |
| `pathfinder_objects` | Run a fixed Pathfinder mode. | Alexander | Alexander Action | Yes | No | PASS |
| `place_color_chips` | Place color chips. | IE3JP | IE3JP JSX | Yes | No | Pending |
| `place_image` | Place an image. | IE3JP | IE3JP JSX | Yes | No | PASS (link and embed) |
| `place_style_guide` | Place a style guide. | IE3JP | IE3JP JSX | Yes | No | Pending |
| `place_symbol` | Place a symbol. | IE3JP | IE3JP JSX | Yes | No | Pending |
| `preflight_check` | Run print preflight. | IE3JP | IE3JP JSX | Yes | No | Pending |
| `replace_color` | Replace colors. | IE3JP | IE3JP JSX | Yes | No | Pending |
| `replace_formatted_text` | Replace selected text content. | Creold | Creold DOM | Yes | No | Pending |
| `resize_for_variation` | Resize document for a variation. | IE3JP | IE3JP JSX | Yes | No | Pending |
| `save_document` | Save the active document. | IE3JP | IE3JP JSX | Yes | No | Pending |
| `select_objects` | Select objects by criteria. | IE3JP | IE3JP JSX | Yes | No | Pending |
| `set_illustrator_version` | Select an installed Illustrator target. | IE3JP | IE3JP transport configuration | Yes | No | Pending |
| `set_workflow` | Set coordinate/workflow preferences. | IE3JP | IE3JP session state | Yes | No | Pending |
| `set_z_order` | Change stacking order. | IE3JP | IE3JP JSX | Yes | No | Pending |
| `undo` | Undo the last operation. | IE3JP | IE3JP JSX | Yes | No | Pending |
| `ungroup_objects` | Ungroup selected groups. | IE3JP | IE3JP JSX | Yes | No | Pending |

Core public-tool count: **74** (67 IE3JP registry tools, 2 Alexander tools, 4 Creold tools, and one DPM read-only status tool: `illustrator_status`).

### Focused Stable 30.8.1 contracts

- `manage_linked_images` relinks with the exact `uuid` returned by `place_image` (or reported by `get_images`) for a linked `PlacedItem`, plus `action: "relink"` and an existing absolute `new_path`.
- `expand_objects` operates on Illustrator's current selection. Use `select_objects` with the target UUID or preselect the artwork in Illustrator, then call `expand_objects` with the desired component flags.
