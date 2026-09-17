# Illustrator Core 工具清单

Illustrator Core 直接操作当前活动的 Illustrator 文档，不要求进入 DPM Work Copy 会话。macOS 默认目标是 Adobe Illustrator 2026 Stable；如需指定其他已安装版本，可使用 `set_illustrator_version`。

后端说明：

- **IE3JP JSX**：IE3JP 已审查的文件传输 + ExtendScript 实现
- **Alexander Action**：基于 MIT 源码的固定 Illustrator Action 载荷
- **Creold DOM**：基于 MIT 源码的非交互 Illustrator DOM 实现
- **DPM bridge**：DPM 自有的只读本地状态桥接

“30.8.1 Smoke”只表示该类别是否在 Adobe Illustrator 2026 Stable 30.8.1 的代表性真机 Smoke Test 中实际覆盖过；“待验证”不代表不可用，只代表本版本没有单独做该项真机验证。

| 工具 | 中文用途 | 来源 | Illustrator 后端 | 直接操作当前文档 | 需要 DPM Production 安全层 | 30.8.1 Smoke |
| --- | --- | --- | --- | --- | --- | --- |
| `align_objects` | 对齐选中的对象。 | IE3JP | IE3JP JSX | 是 | 否 | 待验证 |
| `apply_graphic_style` | 应用指定 Graphic Style。 | IE3JP | IE3JP JSX | 是 | 否 | 待验证 |
| `apply_text_style` | 应用文字样式。 | IE3JP | IE3JP JSX | 是 | 否 | 待验证 |
| `assign_color_profile` | 为文档指定颜色配置文件。 | IE3JP | IE3JP JSX | 是 | 否 | 待验证 |
| `check_contrast` | 检查颜色对比度。 | IE3JP | IE3JP JSX | 是 | 否 | 待验证 |
| `check_text_consistency` | 检查文字样式 / 内容一致性。 | IE3JP | IE3JP JSX | 是 | 否 | 待验证 |
| `close_document` | 关闭当前文档。 | IE3JP | IE3JP JSX | 是 | 否 | 待验证 |
| `convert_coordinate` | 转换 Illustrator 文档坐标。 | IE3JP | IE3JP JSX | 是 | 否 | 待验证 |
| `convert_to_outlines` | 将选中的文字转为轮廓。 | IE3JP | IE3JP JSX | 是 | 否 | 待验证 |
| `create_crop_marks` | 创建裁切标记。 | IE3JP | IE3JP JSX | 是 | 否 | 待验证 |
| `create_document` | 新建 Illustrator 文档。 | IE3JP | IE3JP JSX | 是 | 否 | 通过 |
| `create_ellipse` | 创建椭圆。 | IE3JP | IE3JP JSX | 是 | 否 | 待验证 |
| `create_gradient` | 创建渐变。 | IE3JP | IE3JP JSX | 是 | 否 | 通过 |
| `create_line` | 创建直线。 | IE3JP | IE3JP JSX | 是 | 否 | 通过 |
| `create_path` | 创建自定义路径。 | IE3JP | IE3JP JSX | 是 | 否 | 待验证 |
| `create_path_text` | 创建路径文字。 | IE3JP | IE3JP JSX | 是 | 否 | 待验证 |
| `create_rectangle` | 创建矩形。 | IE3JP | IE3JP JSX | 是 | 否 | 通过 |
| `create_text_frame` | 创建文字框。 | IE3JP | IE3JP JSX | 是 | 否 | 通过 |
| `delete_objects` | 删除选中的对象。 | IE3JP | IE3JP JSX | 是 | 否 | 待验证 |
| `duplicate_active_artboard` | 复制当前活动画板。 | Creold | Creold DOM | 是 | 否 | 待验证 |
| `duplicate_objects` | 复制选中的对象。 | IE3JP | IE3JP JSX | 是 | 否 | 待验证 |
| `expand_objects` | 执行 Object > Expand，并可控制展开项。 | Alexander | Alexander Action | 是 | 否 | 通过 |
| `export` | 导出当前文档。 | IE3JP | IE3JP JSX | 是 | 否 | 通过 |
| `export_pdf` | 导出 PDF。 | IE3JP | IE3JP JSX | 是 | 否 | 待验证 |
| `extract_design_tokens` | 从文档提取 Design Tokens。 | IE3JP | IE3JP JSX | 是 | 否 | 待验证 |
| `find_objects` | 按条件查找 Illustrator 对象。 | IE3JP | IE3JP JSX | 是 | 否 | 待验证 |
| `fit_artboard_to_selection` | 将当前画板适配到选区边界。 | Creold | Creold DOM | 是 | 否 | 通过 |
| `get_artboards` | 读取画板信息。 | IE3JP | IE3JP JSX | 是 | 否 | 待验证 |
| `get_colors` | 读取文档中的颜色信息。 | IE3JP | IE3JP JSX | 是 | 否 | 待验证 |
| `get_document_info` | 读取文档元数据。 | IE3JP | IE3JP JSX | 是 | 否 | 通过 |
| `get_document_structure` | 读取文档结构。 | IE3JP | IE3JP JSX | 是 | 否 | 待验证 |
| `get_effects` | 读取对象效果信息。 | IE3JP | IE3JP JSX | 是 | 否 | 待验证 |
| `get_groups` | 读取群组信息。 | IE3JP | IE3JP JSX | 是 | 否 | 待验证 |
| `get_guidelines` | 读取参考线。 | IE3JP | IE3JP JSX | 是 | 否 | 待验证 |
| `get_images` | 读取放置图片 / 链接图片信息。 | IE3JP | IE3JP JSX | 是 | 否 | 待验证 |
| `get_layers` | 读取图层。 | IE3JP | IE3JP JSX | 是 | 否 | 待验证 |
| `get_overprint_info` | 检查 Overprint 信息。 | IE3JP | IE3JP JSX | 是 | 否 | 待验证 |
| `get_path_items` | 读取 PathItem 信息。 | IE3JP | IE3JP JSX | 是 | 否 | 待验证 |
| `get_selection` | 读取当前 Illustrator 选区。 | IE3JP | IE3JP JSX | 是 | 否 | 待验证 |
| `get_separation_info` | 检查分色信息。 | IE3JP | IE3JP JSX | 是 | 否 | 待验证 |
| `get_symbols` | 读取 Symbols。 | IE3JP | IE3JP JSX | 是 | 否 | 待验证 |
| `get_text_frame_detail` | 获取指定文字框的详细信息。 | IE3JP | IE3JP JSX | 是 | 否 | 待验证 |
| `group_objects` | 将选中对象成组。 | IE3JP | IE3JP JSX | 是 | 否 | 待验证 |
| `illustrator_status` | 读取本地 Illustrator Bridge 状态。 | DPM | DPM bridge | 是 | 否 | 待验证 |
| `image_trace_selection` | 对当前选区执行图像描摹并展开。 | Creold | Creold DOM | 是 | 否 | 待验证 |
| `import_svg_as_editable` | 导入可编辑 SVG。 | IE3JP | IE3JP JSX | 是 | 否 | 待验证 |
| `list_fonts` | 列出可用字体。 | IE3JP | IE3JP JSX | 是 | 否 | 待验证 |
| `list_graphic_styles` | 列出 Graphic Styles。 | IE3JP | IE3JP JSX | 是 | 否 | 待验证 |
| `list_text_frames` | 列出文档中的文字框。 | IE3JP | IE3JP JSX | 是 | 否 | 待验证 |
| `list_text_styles` | 列出文字样式。 | IE3JP | IE3JP JSX | 是 | 否 | 待验证 |
| `manage_artboards` | 新建、修改、删除等画板管理。 | IE3JP | IE3JP JSX | 是 | 否 | 待验证 |
| `manage_datasets` | 管理 Illustrator Variables / Datasets。 | IE3JP | IE3JP JSX | 是 | 否 | 待验证 |
| `manage_layers` | 新建、修改、删除等图层管理。 | IE3JP | IE3JP JSX | 是 | 否 | 通过 |
| `manage_linked_images` | Relink 或 Embed 放置图片。 | IE3JP | IE3JP JSX | 是 | 否 | 通过 |
| `manage_swatches` | 管理 Swatches。 | IE3JP | IE3JP JSX | 是 | 否 | 待验证 |
| `modify_object` | 修改选中对象的属性。 | IE3JP | IE3JP JSX | 是 | 否 | 待验证 |
| `move_to_layer` | 将选区移动到指定图层。 | IE3JP | IE3JP JSX | 是 | 否 | 待验证 |
| `open_document` | 打开 Illustrator 文档。 | IE3JP | IE3JP JSX | 是 | 否 | 待验证 |
| `pathfinder_objects` | 执行固定的 Pathfinder 模式。 | Alexander | Alexander Action | 是 | 否 | 通过 |
| `place_color_chips` | 在文档中放置色块。 | IE3JP | IE3JP JSX | 是 | 否 | 待验证 |
| `place_image` | 放置链接或嵌入图片。 | IE3JP | IE3JP JSX | 是 | 否 | 通过（链接 / Embed） |
| `place_style_guide` | 在文档中生成 / 放置 Style Guide。 | IE3JP | IE3JP JSX | 是 | 否 | 待验证 |
| `place_symbol` | 放置 Symbol。 | IE3JP | IE3JP JSX | 是 | 否 | 待验证 |
| `preflight_check` | 执行印前检查。 | IE3JP | IE3JP JSX | 是 | 否 | 待验证 |
| `replace_color` | 替换颜色。 | IE3JP | IE3JP JSX | 是 | 否 | 待验证 |
| `replace_formatted_text` | 替换选中文字，同时保留 / 处理格式逻辑。 | Creold | Creold DOM | 是 | 否 | 待验证 |
| `resize_for_variation` | 为尺寸变体调整文档。 | IE3JP | IE3JP JSX | 是 | 否 | 待验证 |
| `save_document` | 保存当前文档。 | IE3JP | IE3JP JSX | 是 | 否 | 待验证 |
| `select_objects` | 按条件选择对象。 | IE3JP | IE3JP JSX | 是 | 否 | 待验证 |
| `set_illustrator_version` | 指定要连接的已安装 Illustrator 版本。 | IE3JP | IE3JP transport configuration | 是 | 否 | 待验证 |
| `set_workflow` | 设置坐标 / Workflow 偏好。 | IE3JP | IE3JP session state | 是 | 否 | 待验证 |
| `set_z_order` | 调整对象堆叠顺序。 | IE3JP | IE3JP JSX | 是 | 否 | 待验证 |
| `undo` | 撤销上一次 Illustrator 操作。 | IE3JP | IE3JP JSX | 是 | 否 | 待验证 |
| `ungroup_objects` | 解组选中的群组。 | IE3JP | IE3JP JSX | 是 | 否 | 待验证 |

Illustrator Core 公开工具总数：**74**。

来源统计：

- IE3JP：**67**
- Alexander Ladygin：**2**
- Creold / Sergey Osokin：**4**
- DPM：**1**（`illustrator_status`）

## 已确认的 30.8.1 使用约定

### `manage_linked_images`

Relink 时需要传入链接图片的准确 `uuid`。这个 UUID 可以由 `place_image` 返回，也可以通过 `get_images` 获取。

典型输入逻辑：

```text
action: "relink"
uuid: <目标 PlacedItem 的 UUID>
new_path: <存在的绝对文件路径>
```

### `expand_objects`

`expand_objects` 作用于 Illustrator 当前选区。

可以先：

```text
select_objects
```

按 UUID 选中目标对象，然后再调用：

```text
expand_objects
```

并传入需要的 Object / Fill / Stroke / Gradient 展开参数。
