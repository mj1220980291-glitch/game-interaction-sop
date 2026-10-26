/**
 * NodeInfo fixtures for probe tests.
 *
 * `official114()` mirrors the master template `1:14` (component root, overview
 * with two frames, 气泡 overlay, 说明块 slot runs).
 * `jinhun798()` mirrors 798:17608「角色系统」 (hand-laid document, no overview,
 * scattered 三角 `num` instances, hidden cluster master `Frame 1244`, hidden
 * spare pool at each cluster tail).
 *
 * Both are structural snapshots taken from the live files on 2026-10-26.
 */

import type { NodeInfo } from '../../../../src/v2/figma-client.js';

interface Opts {
  visible?: boolean;
  width?: number;
  height?: number;
  x?: number;
  y?: number;
  text?: string;
}

let seq = 0;

function node(id: string, name: string, type: NodeInfo['type'], children: NodeInfo[] = [], o: Opts = {}): NodeInfo {
  return {
    id: id || `n${++seq}`,
    name,
    type,
    childIds: children.map((c) => c.id),
    visible: o.visible !== false,
    ...(o.text !== undefined ? { characters: o.text } : {}),
    ...(o.width !== undefined || o.height !== undefined
      ? {
          absoluteBoundingBox: {
            x: o.x ?? 0,
            y: o.y ?? 0,
            width: o.width ?? 100,
            height: o.height ?? 100
          }
        }
      : {})
  };
}

// The flatten helper below needs the full list; keep one flat registry per build.
let pendingList: NodeInfo[] = [];

function register(n: NodeInfo): NodeInfo {
  pendingList.push(n);
  return n;
}

/** Flatten a tree built with `register`. */
export function flattenTree(root: NodeInfo): NodeInfo[] {
  const byId = new Map(pendingList.map((n) => [n.id, n]));
  const out: NodeInfo[] = [];
  const visit = (n: NodeInfo): void => {
    out.push(n);
    for (const childId of n.childIds ?? []) {
      const child = byId.get(childId);
      if (child) visit(child);
    }
  };
  visit(root);
  return out;
}

function reset(): void {
  pendingList = [];
  seq = 0;
}

// --- official 1:14 -------------------------------------------------------

export function official114(): NodeInfo {
  reset();
  const docTitle = register(node('1:31', '文档标题', 'TEXT', [], { text: '局内相关交互', width: 900, height: 60 }));
  const owner = register(node('1:29', '设计师名称', 'TEXT', [], { text: '苗儿', width: 200, height: 40 }));
  const group = register(node('1:27', '需求组名称', 'TEXT', [], { text: 'OGC2', width: 200, height: 40 }));
  const ticket = register(node('1:28', '易协作单号链接', 'TEXT', [], { text: 'https://u5.pm.netease.com/v6/issues/367218', width: 600, height: 40 }));
  const updated = register(node('1:26', '更新时间', 'TEXT', [], { text: '2025.07.30', width: 200, height: 40 }));
  const header = register(
    node('1:15', '标题组件', 'FRAME', [docTitle, owner, group, ticket, updated], { width: 1920, height: 320 })
  );

  const overviewTitle = register(node('1:34', '一级标题', 'FRAME', [], { width: 300, height: 60 }));
  const bgTitle = register(node('1:37', '#Title', 'TEXT', [], { text: '1.功能背景', width: 200, height: 40 }));
  const bgBody = register(node('1:38', '#Content', 'TEXT', [], { text: '玩家在局内需要快速查看当前状态。', width: 800, height: 90 }));
  const bg = register(node('1:36', '功能背景', 'FRAME', [bgTitle, bgBody], { width: 1200, height: 140 }));
  const coreTitle = register(node('1:40', '#Title', 'TEXT', [], { text: '2.核心交互', width: 200, height: 40 }));
  const coreBody = register(node('1:41', '#Content', 'TEXT', [], { text: '点击入口打开面板，拖动切换页签。', width: 800, height: 90 }));
  const core = register(node('1:39', '核心交互', 'FRAME', [coreTitle, coreBody], { width: 1200, height: 140 }));
  const overviewInner = register(node('1:33', '设计总览', 'FRAME', [overviewTitle, bg, core], { width: 1800, height: 400 }));
  const overview = register(node('1:32', '设计总览组件', 'FRAME', [overviewInner], { width: 1920, height: 460 }));

  const nameLabel = register(
    node('1:122', '#Name/界面名称', 'FRAME', [
      register(node('1:123', '#Name', 'TEXT', [], { text: '设置面板', width: 192, height: 70 }))
    ], { width: 212, height: 80 })
  );
  const mainImage = register(node('1:111', '主图占位', 'RECTANGLE', [], { width: 1920, height: 1080, x: 0, y: 0 }));
  const mainHint = register(node('1:112', '主图占位文案', 'TEXT', [], { text: '主图占位 待手动替换', width: 920, height: 96 }));
  const bubble1Num = register(node('1:119', '#Number', 'TEXT', [], { text: '1', width: 40, height: 40 }));
  const bubble1 = register(node('1:118', '标号/1', 'FRAME', [bubble1Num], { width: 48, height: 48 }));
  const bubble2Num = register(node('1:116', '#Number', 'TEXT', [], { text: '2', width: 40, height: 40 }));
  const bubble2 = register(node('1:114', '标号/2', 'FRAME', [bubble2Num], { width: 48, height: 48 }));
  const bubble = register(node('1:113', '气泡', 'FRAME', [bubble2, bubble1], { width: 1920, height: 1080 }));
  // Live 1:14 bundles image + caption + badge overlay in one `rec组` frame.
  const recGroup = register(node('1:110', 'rec组', 'FRAME', [mainImage, mainHint, bubble], {
    width: 1920,
    height: 1080
  }));

  const cluster1 = officialCluster('1:46', '说明块01', 1, true);
  const cluster2 = officialCluster('1:81', '说明块02', 2, false);
  const column = register(node('1:45', 'Text', 'FRAME', [cluster1, cluster2], { width: 1231, height: 3317, x: 1920 }));
  const section = register(
    node('1:44', '界面说明1', 'GROUP', [column, recGroup, nameLabel], { width: 3382, height: 3317 })
  );
  const goal = register(node('1:43', '需求目标', 'FRAME', [section], { width: 1920, height: 2800 }));
  const comp = register(node('1:42', 'Comp_1', 'FRAME', [goal], { width: 1920, height: 2800 }));
  return register(node('1:14', '模板', 'COMPONENT', [header, overview, comp], { width: 1920, height: 4000 }));
}

let clusterSeq = 0;

function officialCluster(id: string, name: string, index: number, withFigure: boolean): NodeInfo {
  clusterSeq += 1;
  const n = clusterSeq;
  const numberText = register(node(`${id}:num`, 'Number', 'TEXT', [], { text: String(index), width: 40, height: 40 }));
  const marker = register(node(`${id}:marker`, '交互说明标记', 'FRAME', [numberText], { width: 60, height: 60 }));
  const order = register(node(`${id}:order`, '序号', 'GROUP', [marker], { width: 60, height: 60 }));
  const mainTitle = register(node(`${id}:main`, '#Title_Main', 'TEXT', [], { text: `簇${n}`, width: 300, height: 50 }));
  const clusterHeader = register(node(`${id}:header`, '标题', 'GROUP', [order, mainTitle], { width: 400, height: 60 }));

  const roleGui = register(node(`${id}:r1`, '@GUI', 'TEXT', [], { text: '@GUI', width: 80, height: 36 }));
  const roleProg = register(node(`${id}:r2`, '@程序', 'TEXT', [], { text: '@程序', width: 80, height: 36 }));
  const roleArt = register(node(`${id}:r3`, '@美术', 'TEXT', [], { text: '@美术', width: 80, height: 36 }));
  const roles = register(node(`${id}:roles`, 'Frame 427319720', 'FRAME', [roleGui, roleProg, roleArt], { width: 400, height: 40 }));

  const sub1 = register(node(`${id}:s1`, '#Title', 'TEXT', [], { text: '小标题1', width: 200, height: 40 }));
  const line1 = register(node(`${id}:l1`, '正文/规则', 'TEXT', [], { text: '打开面板后显示背包内容', width: 900, height: 44 }));
  const line2 = register(node(`${id}:l2`, '正文/规则', 'TEXT', [], { text: '点击物品查看详情', width: 900, height: 44 }));
  const sub2 = register(node(`${id}:s2`, '#Title', 'TEXT', [], { text: '小标题2', width: 200, height: 40 }));
  const line3 = register(node(`${id}:l3`, '正文/规则', 'TEXT', [], { text: '拖拽可移动物品', width: 900, height: 44 }));

  const children = withFigure
    ? [
        clusterHeader,
        sub1,
        roles,
        line1,
        line2,
        register(node(`${id}:fig`, '配图', 'GROUP', [
          register(node(`${id}:figrect`, '配图占位', 'RECTANGLE', [], { width: 400, height: 300 }))
        ], { width: 400, height: 300 })),
        sub2,
        line3
      ]
    : [clusterHeader, sub1, roles, line1, line2, sub2, line3];

  return register(node(id, name, 'FRAME', children, { width: 1200, height: 900 }));
}

// --- 惊魂寻宝队 798:17608 -------------------------------------------------

let jhSeq = 0;

function jh(text: string, opts: Opts & { type?: NodeInfo['type'] } = {}): NodeInfo {
  jhSeq += 1;
  return register(
    node(`jh${jhSeq}`, opts.type === 'GROUP' ? 'Group' : `t${jhSeq}`, opts.type ?? 'TEXT', [], {
      ...opts,
      text
    })
  );
}

function jhFrame(name: string, children: NodeInfo[], opts: Opts = {}): NodeInfo {
  jhSeq += 1;
  return register(node(`jh${jhSeq}`, name, 'FRAME', children, opts));
}

function jhGroup(name: string, children: NodeInfo[], opts: Opts = {}): NodeInfo {
  jhSeq += 1;
  return register(node(`jh${jhSeq}`, name, 'GROUP', children, opts));
}

function jhInstance(name: string, children: NodeInfo[], opts: Opts = {}): NodeInfo {
  jhSeq += 1;
  return register(node(`jh${jhSeq}`, name, 'INSTANCE', children, opts));
}

/** 顶部: cover + title block with 职能 legend. */
function jhHeaderBlocks(): NodeInfo[] {
  const cover = jhFrame('顶部', [
    jhGroup('Group 1432', [
      register(node(`jh-${++jhSeq}`, 'video_frame_bg 2', 'RECTANGLE', [], { width: 2326, height: 867 })),
      register(node(`jh-${++jhSeq}`, 'img_logo 2', 'RECTANGLE', [], { width: 728, height: 442 }))
    ], { width: 2326, height: 867 })
  ], { width: 2198, height: 814 });

  const reviewer = jhFrame('UI', [jh('审核者'), jh('/ 邵腾'), jhInstance('-完成', [jh('-未开始')])], {
    width: 479,
    height: 70
  });
  const date = jh('2025/07/30', { width: 198, height: 52 });
  const docName = jh('角色系统', { width: 345, height: 125 });
  const roleNote = jh('职能注意', { width: 176, height: 71 });
  const legend = jhFrame(
    'Frame 80',
    ['GUI', '程序', '拼接', '策划', 'VX', '音效'].map((role) =>
      jhInstance('标签', [
        register(node(`jh-${++jhSeq}`, 'Rectangle 64', 'RECTANGLE', [], { width: 199, height: 68 })),
        jh(role, { width: 76, height: 42 })
      ], { width: 199, height: 68 })
    ),
    { width: 1314, height: 68 }
  );
  const ux = jhFrame('UI', [jh('UX'), jh('/ 苗儿')], { width: 210, height: 70 });
  const planner = jhFrame('UI', [jh('策划'), jh('/辉湟')], { width: 231, height: 70 });
  const title = jhGroup('标题', [reviewer, date, docName, roleNote, legend, ux, planner], {
    width: 2205,
    height: 321
  });

  return [cover, title, jhFrame('留白', [], { width: 2198, height: 93 })];
}

function jhNum(value: number): NodeInfo {
  return jhInstance('num', [
    register(node(`jh-${++jhSeq}`, 'Polygon 7', 'OTHER', [], { width: 44, height: 40 })),
    jh(String(value), { width: 20, height: 34 })
  ], { width: 44, height: 40 });
}

/** One cluster: 编号 + 标题 + 扁平行 (+ 图) + 隐藏备用池. */
function jhCluster(title: string, number: number, hiddenSpares: number): NodeInfo {
  const num = jhNum(number);
  const bodyChildren: NodeInfo[] = [
    jh(`${title}相关的交互说明很长一行，结尾内联 @GUI@程序@拼接`, { width: 860, height: 44 }),
    register(node(`jh-${++jhSeq}`, 'image 37998', 'RECTANGLE', [], { width: 400, height: 240 })),
    jh('另一条规则说明文字，较长', { width: 860, height: 44 })
  ];
  for (let i = 0; i < hiddenSpares; i += 1) {
    bodyChildren.push(jh(`备用文案${i}`, { visible: false, width: 100, height: 40 }));
  }
  const body = jhFrame('Frame 808', bodyChildren, { width: 900, height: 800 });
  const cluster = jhGroup('Group 1253', [jh(title, { width: 300, height: 44 }), num, body], {
    width: 900,
    height: 800
  });
  return jhFrame('Frame 1243', [cluster], { width: 932, height: 820 });
}

function jhChapter(docTitle: string, clusterTitles: string[]): NodeInfo {
  const graphic = jhGroup('界面图示', [
    jhGroup('Group 2358', [
      jhInstance('Slide 16:9 - 33', [
        register(node(`jh-${++jhSeq}`, 'bg_five_recharge 1', 'RECTANGLE', [], { width: 1200, height: 745 }))
      ], { width: 1200, height: 745 }),
      ...clusterTitles.map((_, i) => jhNum(i + 1))
    ], { width: 1200, height: 745 })
  ], { width: 1200, height: 745, x: 0 });

  const clusters = clusterTitles.map((t, i) => jhCluster(t, i + 1, 4));
  // 隐藏簇母版「草稿面板」
  const masterCluster = jhCluster('草稿面板', 99, 0);
  masterCluster.visible = false;
  const column = jhFrame('Frame 1243', [...clusters, masterCluster], { width: 932, height: 6200, x: 1200 });

  return jhGroup('Group 2360', [graphic, column], { width: 2209, height: 6240 });
}

export function jinhun798(): NodeInfo {
  reset();
  jhSeq = 0;

  const docTitleBlock = jhFrame(
    '文档说明',
    [
      jhGroup('Group 1425', [
        jhInstance('一级标题', [jh('文档说明')]),
        jhFrame('Frame 77', [jh('UI设计 #367218 【OGC2组】 https://u5.pm.netease.com/v6/issues/367218')], {
          width: 2204,
          height: 229
        })
      ], { width: 2204, height: 409 })
    ],
    { width: 2204, height: 591 }
  );

  const sectionTitle = jhFrame(
    '标题',
    [
      jhGroup('二级标题', [
        jhFrame('内容', [jh('界面名称')], { width: 232, height: 62 }),
        jh('1', { width: 31, height: 75 })
      ], { width: 285, height: 75 })
    ],
    { width: 285, height: 75 }
  );

  const chapter1 = jhChapter('角色系统', ['角色系统', '货币', '列表', '角色信息', '出发']);
  const chapter2 = jhChapter('角色系统', ['撤离']);
  const chapter3 = jhChapter('角色系统', ['上缴', '关闭', '背包区域', '上缴进度', '上缴柜', '维修']);

  const footer = jhFrame('end', [jhGroup('Group 1434', [jh('the end.')])], { width: 2198, height: 192 });

  const body = jhFrame('Frame 76', [docTitleBlock, sectionTitle, chapter1, chapter2, chapter3, footer], {
    width: 2204,
    height: 13651
  });

  return jhFrame('交互稿', [...jhHeaderBlocks(), body], { width: 2205, height: 15271 });
}

export { flattenTree as flatten };
