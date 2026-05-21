/**
 * @game-interaction-sop/engine — public API.
 *
 * The host wires a FigmaBackend implementation (typically via
 * @game-interaction-sop/mcp-adapter) and calls `renderV2MarkdownToFigma`.
 *
 * High-level flow:
 *   const { parseV2, renderV2MarkdownToFigma } = require('@game-interaction-sop/engine');
 *   const { ir, errors } = parseV2(markdown);
 *   if (errors.length === 0) {
 *     await renderV2MarkdownToFigma({ markdown, assetMap, backend });
 *   }
 */

export * from './v2/index.js';
