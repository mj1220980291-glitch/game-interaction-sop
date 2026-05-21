import { z } from 'zod';

/**
 * Zod schemas for the interaction-doc DSL.
 *
 * Spec: openspec/changes/build-figma-interaction-doc-engine/specs/interaction-doc-dsl/spec.md
 *
 * The schemas here describe the *normalized* DSL after YAML parsing. Custom
 * issue codes set on `params.code` are surfaced by validate.ts so the public
 * API exposes the kebab-uppercase codes from errors.ts.
 */

// --- meta ---------------------------------------------------------------

const SEMVER = /^\d+\.\d+\.\d+$/;

export const MetaSchema = z.object({
  title: z.string().min(1, { message: 'meta.title must not be empty' }),
  version: z
    .string()
    .refine((v) => SEMVER.test(v), {
      message: 'DSL_META_VERSION_INVALID',
      params: { code: 'DSL_META_VERSION_INVALID' }
    }),
  project: z.string().min(1),
  designUrl: z
    .string()
    .url()
    .refine((u) => u.startsWith('https://'), {
      message: 'DSL_META_URL_INSECURE',
      params: { code: 'DSL_META_URL_INSECURE' }
    })
});

export type Meta = z.infer<typeof MetaSchema>;

// --- anchor (discriminated, with mutual-exclusion guard) ----------------

const AnchorByNode = z.object({ nodeId: z.string().min(1) }).strict();
const AnchorByAbs = z.object({ absXY: z.tuple([z.number(), z.number()]) }).strict();
const AnchorBySectionRel = z.object({
  sectionRelXY: z.tuple([z.number(), z.number()])
}).strict();

/**
 * Anchor union. `.strict()` on each variant prevents extra keys, which gives
 * us mutual-exclusion for free: `{ nodeId, absXY }` will fail both branches
 * and we surface DSL_ANCHOR_AMBIGUOUS in validate.ts based on raw shape.
 */
export const AnchorSchema = z.union([AnchorByNode, AnchorByAbs, AnchorBySectionRel]);

export type Anchor = z.infer<typeof AnchorSchema>;

// --- bubble -------------------------------------------------------------

export const BubbleSchema = z.object({
  id: z.string().min(1),
  text: z.string().min(1),
  anchor: AnchorSchema,
  // Use plain literal — missing vs invalid is discriminated in validate.ts
  // based on issue.received, so error codes stay distinct.
  layer: z.literal('overlay')
});

export type Bubble = z.infer<typeof BubbleSchema>;

// --- section ------------------------------------------------------------

const TITLE_PREFIX = /^(\d+\s*[.、)]|[#＃])/;

export const SectionSchema = z.object({
  index: z.number().int().positive(),
  title: z
    .string()
    .min(1)
    .refine((t) => !TITLE_PREFIX.test(t.trim()), {
      message: 'DSL_SECTION_TITLE_HAS_PREFIX',
      params: { code: 'DSL_SECTION_TITLE_HAS_PREFIX' }
    }),
  bubbles: z.array(BubbleSchema).default([])
});

export type Section = z.infer<typeof SectionSchema>;

// --- design refs / screenshots -----------------------------------------

export const DesignRefSchema = z.object({
  name: z.string().min(1),
  url: z.string().url(),
  nodeId: z.string().min(1)
});

export type DesignRef = z.infer<typeof DesignRefSchema>;

export const ScreenshotSchema = z.object({
  sectionIndex: z.number().int().positive(),
  alt: z.string().default(''),
  src: z.string().min(1)
});

export type Screenshot = z.infer<typeof ScreenshotSchema>;

// --- doc root -----------------------------------------------------------

export const DocSchema = z.object({
  meta: MetaSchema,
  sections: z.array(SectionSchema).min(1),
  designRefs: z.array(DesignRefSchema).default([]),
  screenshots: z.array(ScreenshotSchema).default([])
});

export type Doc = z.infer<typeof DocSchema>;
