/**
 * Figma plugin-side JS helpers.
 *
 * These snippets are **embedded into the JS strings** passed to `exec()`
 * (which forwards to figma-console MCP's `figma_execute`). They run in
 * the Figma plugin sandbox, NOT in the Node process where the adapter
 * code itself lives.
 *
 * Kept as a single string constant so every backend method can prepend
 * it with a plain `code = HELPERS + myFunctionBody` concatenation.
 */
export const FIGMA_PLUGIN_HELPERS = /* js */ `
// --- font cache (per exec invocation) ---
const __loadedFonts = new Set();
async function __setText(t, chars) {
  if (!t || t.hasMissingFont) return;
  const fonts = t.getRangeAllFontNames(0, Math.max(1, t.characters.length));
  for (const fn of fonts) {
    const k = fn.family + '|' + fn.style;
    if (!__loadedFonts.has(k)) {
      await figma.loadFontAsync(fn);
      __loadedFonts.add(k);
    }
  }
  t.characters = chars;
}

// --- recursive descendant scan ---
function __findAll(n, pred, out) {
  out = out || [];
  if (pred(n)) out.push(n);
  if ('children' in n) for (const c of n.children) __findAll(c, pred, out);
  return out;
}

// --- serialize a Figma node into the NodeInfo shape the engine expects ---
function __toNodeInfo(n) {
  if (!n) return null;
  const info = {
    id: n.id,
    name: n.name,
    type: n.type
  };
  if ('absoluteBoundingBox' in n && n.absoluteBoundingBox) {
    info.absoluteBoundingBox = {
      x: n.absoluteBoundingBox.x,
      y: n.absoluteBoundingBox.y,
      width: n.absoluteBoundingBox.width,
      height: n.absoluteBoundingBox.height
    };
  }
  if (n.parent) {
    info.parentId = n.parent.id;
    info.parentType = n.parent.type;
  }
  if ('children' in n && Array.isArray(n.children)) {
    info.childIds = n.children.map(c => c.id);
  }
  if (n.type === 'TEXT' && typeof n.characters === 'string') {
    info.characters = n.characters;
  }
  return info;
}
`;
