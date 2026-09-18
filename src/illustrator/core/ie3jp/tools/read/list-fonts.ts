import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { executeJsx } from '../../executor/jsx-runner.js';
import { formatToolResult } from '../tool-executor.js';
import { READ_ANNOTATIONS } from '../modify/shared.js';

/**
 * list_fonts — Illustrator で利用可能なフォント一覧
 *
 * @see https://ai-scripting.docsforadobe.dev/jsobjref/TextFonts/ — TextFonts, TextFont
 *
 * JSX API:
 *   Application.textFonts → TextFonts コレクション
 *   TextFont.name → String (PostScript名)
 *   TextFont.family → String (ファミリー名)
 *   TextFont.style → String (スタイル名)
 *
 * ドキュメント不要。checkIllustratorVersion() のみ使用。
 */
const jsxCode = `
try {
  var verErr = checkIllustratorVersion();
  if (verErr) {
    writeResultFile(RESULT_PATH, verErr);
  } else {
    var params = readParamsFile(PARAMS_PATH);
    var filters = [];
    if (params.filter) filters.push(String(params.filter));
    if (params.filters && params.filters.length) {
      for (var qi = 0; qi < params.filters.length; qi++) {
        var q = String(params.filters[qi] || "");
        if (q) filters.push(q);
      }
    }
    var limit = params.limit || 100;
    var fonts = [];

    function normalized(value) {
      return String(value || "").toLowerCase().replace(/[\\s\\-_]+/g, "");
    }

    for (var i = 0; i < app.textFonts.length; i++) {
      var tf = app.textFonts[i];
      var matchedFilters = [];
      if (filters.length) {
        var nameL = String(tf.name || "").toLowerCase();
        var familyL = String(tf.family || "").toLowerCase();
        var nameN = normalized(tf.name);
        var familyN = normalized(tf.family);
        for (var fi = 0; fi < filters.length; fi++) {
          var filterL = filters[fi].toLowerCase();
          var filterN = normalized(filters[fi]);
          if (nameL.indexOf(filterL) !== -1 || familyL.indexOf(filterL) !== -1 || (filterN && (nameN.indexOf(filterN) !== -1 || familyN.indexOf(filterN) !== -1))) matchedFilters.push(filters[fi]);
        }
        if (!matchedFilters.length) continue;
      }
      fonts.push({
        name: tf.name,
        family: tf.family,
        style: tf.style,
        matchedFilters: matchedFilters
      });
      if (fonts.length >= limit) break;
    }

    writeResultFile(RESULT_PATH, {
      count: fonts.length,
      totalAvailable: app.textFonts.length,
      filters: filters,
      fonts: fonts
    });
  }
} catch (e) {
  writeResultFile(RESULT_PATH, { error: true, message: "list_fonts failed: " + e.message, line: e.line });
}
`;

export function register(server: McpServer): void {
  server.registerTool(
    'list_fonts',
    {
      title: 'List Fonts',
      description: 'List fonts available in Illustrator. Use filters[] to resolve several requested font names or aliases in one Illustrator call; filter remains supported for a single query. Matching is case-insensitive and also ignores spaces, hyphens, and underscores. Does not require an open document.',
      inputSchema: {
        filter: z
          .string()
          .optional()
          .describe('Single filter by family or name (case-insensitive partial match). Prefer filters[] when resolving more than one name.'),
        filters: z
          .array(z.string().min(1))
          .max(20)
          .optional()
          .describe('Multiple family/name search terms evaluated in one Illustrator call. A font is returned when any term matches; matchedFilters shows which terms matched.'),
        limit: z
          .number()
          .int()
          .min(1)
          .optional()
          .default(100)
          .describe('Max fonts to return (default 100)'),
      },
      annotations: READ_ANNOTATIONS,
    },
    async (params) => {
      const result = await executeJsx(jsxCode, params);
      return formatToolResult(result);
    },
  );
}
