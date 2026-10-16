/**
 * Hidden stamps the engine writes on the nodes it owns.
 *
 * Stored with `setSharedPluginData(STAMP_NAMESPACE, STAMP_KEY, JSON)`. Shared
 * (not plain) plugin data so the stamps survive a change of plugin id.
 *
 * Containers carry the list of what they held when last written (`sections`,
 * `clusters`, `items`). That list is the only way to tell "the designer
 * deleted it" from "it never existed", and it is what makes a deletion stick
 * across later syncs (a tombstone).
 */

import type { AssetSpec } from '../render.js';

export const STAMP_NAMESPACE = 'gisop';
export const STAMP_KEY = 'stamp';
export const STAMP_VERSION = 1;

/** Name given to the throwaway doc that supplies prototypes during a sync. */
export const SCRATCH_ROOT_NAME = '__gisop_scratch__';

export type ItemType = 'rule' | 'figure' | 'subtitle';

export const HEADER_KEYS = ['title', 'owner', 'group', 'ticketLink', 'lastUpdate'] as const;
export type HeaderKey = (typeof HEADER_KEYS)[number];

export const OVERVIEW_KEYS = ['background', 'coreInteraction'] as const;
export type OverviewKey = (typeof OVERVIEW_KEYS)[number];

export interface ManifestEntry {
  id: string;
  /** Last written value (section name / cluster title / item text). */
  text: string;
}

export interface ItemManifestEntry extends ManifestEntry {
  t: ItemType;
}

export interface DocStamp {
  kind: 'doc';
  v: number;
  header: Partial<Record<HeaderKey, string>>;
  overview: Partial<Record<OverviewKey, string>>;
  sections: ManifestEntry[];
  lock?: { runId: string; at: number };
}

export interface SectionStamp {
  kind: 'section';
  sid: string;
  name: string;
  clusters: ManifestEntry[];
}

export interface ClusterStamp {
  kind: 'cluster';
  cid: string;
  title: string;
  roles: string[];
  items: ItemManifestEntry[];
}

export interface ItemStamp {
  kind: 'item';
  iid: string;
  t: ItemType;
  text: string;
  /** figure only: the asset last applied by the engine. */
  asset?: AssetSpec;
  /** figure only: image hash right after the engine last wrote it. */
  imageHash?: string | null;
}

export type SlotRole =
  | `header.${HeaderKey}`
  | `overview.${OverviewKey}`
  | 'sections'
  | 'section.name'
  | 'main'
  | 'mainHint'
  | 'bubbleFrame'
  | 'column'
  | 'clusterHeader'
  | 'clusterTitle'
  | 'clusterNumber'
  | 'roles'
  | 'bubble'
  | 'template';

export interface SlotStamp {
  kind: 'slot';
  role: SlotRole;
  /** bubble only: the cluster it belongs to. */
  cid?: string;
  /** main only. */
  asset?: AssetSpec;
  imageHash?: string | null;
}

export type Stamp = DocStamp | SectionStamp | ClusterStamp | ItemStamp | SlotStamp;

/** Parse a raw plugin-data string. Anything unreadable counts as unstamped. */
export function parseStamp(raw: string | null | undefined): Stamp | undefined {
  if (!raw) return undefined;
  try {
    const v = JSON.parse(raw) as { kind?: unknown };
    if (
      v &&
      typeof v === 'object' &&
      (v.kind === 'doc' ||
        v.kind === 'section' ||
        v.kind === 'cluster' ||
        v.kind === 'item' ||
        v.kind === 'slot')
    ) {
      return v as Stamp;
    }
  } catch {
    /* fall through */
  }
  return undefined;
}

/** Short random id, unique enough within one document. */
export function newId(prefix: 's' | 'c' | 'i'): string {
  return prefix + Math.random().toString(36).slice(2, 10);
}

// --- Text normalisation shared by render and reconcile --------------------

const INDEX_PREFIX_RE = /^\s*\d+\s*[.、．]\s*/;
const IMAGE_BULLET_RE = /(^|\s|^[-·•*]+\s*)配图\s*[：:]/;

export function stripIndexPrefix(s: string): string {
  return s.replace(INDEX_PREFIX_RE, '').trim();
}

export function isImageBullet(bullet: string): boolean {
  return IMAGE_BULLET_RE.test(bullet);
}

/** `- **文本**` → `文本`. The template TEXT does not interpret markdown. */
export function normalizeBulletText(raw: string): string {
  return raw
    .replace(/^\s*[-·•*]+\s*/, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .trim();
}

/** `- 配图：低血量示意` → `低血量示意`. */
export function stripImageBulletPrefix(raw: string): string {
  return raw
    .replace(/^\s*[-·•*]+\s*/, '')
    .replace(/^配图\s*[：:]\s*/u, '')
    .trim();
}

export function figureHintText(desc: string): string {
  return `配图占位：${desc}`;
}

/** Roles as written in markdown (`GUI`) or on canvas (`@GUI`), compared as a set. */
export function sameRoles(a: string[], b: string[]): boolean {
  const norm = (xs: string[]) =>
    [...new Set(xs.map((x) => x.replace(/^@/, '').trim()))].sort().join('|');
  return norm(a) === norm(b);
}

export function sameAsset(a: AssetSpec | undefined, b: AssetSpec | undefined): boolean {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}
