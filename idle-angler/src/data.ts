import type { Skill, Species } from './types';

// 魚は0..3を使用。装備は0..6の7段階（4以上は「自慢級」の超低確率帯）。
export const RAR = [
  { k: 0, n: 'コモン',         col: '#9fb0cc', mult: 1.0 },
  { k: 1, n: 'レア',           col: '#56b9ff', mult: 1.6 },
  { k: 2, n: 'エピック',       col: '#c77dff', mult: 2.4 },
  { k: 3, n: 'レジェンド',     col: '#ffd76a', mult: 4.0 },
  { k: 4, n: 'イモータル',     col: '#ff8a5c', mult: 5.5 },
  { k: 5, n: 'セレスティアル', col: '#7ef0c0', mult: 7.5 },
  { k: 6, n: 'ミシック',       col: '#ff4d8f', mult: 10 },
] as const;

export const SPOTS = [
  { n: '渓流',     cost: 0,    water: '#1b4a44' },
  { n: '港・汽水', cost: 600,  water: '#123a5e' },
  { n: '深海船上', cost: 4000, water: '#101a3e' },
] as const;

// bq=必要餌Tier(0=練り餌可) cond=出現条件
export const SPECIES: Species[] = [
  { id: 'ugui',       n: 'ウグイ',             s: 0, r: 0, v: 8 },
  { id: 'yamame',     n: 'ヤマメ',             s: 0, r: 0, v: 12 },
  { id: 'kajika',     n: 'カジカ',             s: 0, r: 0, v: 10 },
  { id: 'iwana',      n: 'イワナ',             s: 0, r: 1, v: 36 },
  { id: 'niji',       n: 'ニジマス',           s: 0, r: 1, v: 44 },
  { id: 'ayu',        n: 'アユ',               s: 0, r: 2, v: 160,  bq: 1 },
  { id: 'itou',       n: 'イトウ',             s: 0, r: 2, v: 220,  bq: 1 },
  { id: 'nushi',      n: 'ヌシ・オオイワナ',   s: 0, r: 3, v: 1200, bq: 2, cond: 'rain' },
  { id: 'aji',        n: 'アジ',               s: 1, r: 0, v: 10 },
  { id: 'saba',       n: 'サバ',               s: 1, r: 0, v: 12 },
  { id: 'kasago',     n: 'カサゴ',             s: 1, r: 0, v: 14 },
  { id: 'seabass',    n: 'シーバス',           s: 1, r: 1, v: 50 },
  { id: 'kurodai',    n: 'クロダイ',           s: 1, r: 1, v: 55 },
  { id: 'hirame',     n: 'ヒラメ',             s: 1, r: 2, v: 200,  bq: 1 },
  { id: 'tachiuo',    n: 'タチウオ',           s: 1, r: 2, v: 240,  bq: 1, cond: 'night' },
  { id: 'seadra',     n: '幻影シードラゴン',   s: 1, r: 3, v: 1800, bq: 2, cond: 'night' },
  { id: 'sokodara',   n: 'ソコダラ',           s: 2, r: 0, v: 18 },
  { id: 'yumekasago', n: 'ユメカサゴ',         s: 2, r: 0, v: 20 },
  { id: 'kinme',      n: 'キンメダイ',         s: 2, r: 1, v: 70 },
  { id: 'rabuka',     n: 'ラブカ',             s: 2, r: 1, v: 90 },
  { id: 'demenigisu', n: 'デメニギス',         s: 2, r: 2, v: 320,  bq: 1 },
  { id: 'ryugu',      n: 'リュウグウノツカイ', s: 2, r: 3, v: 2400, bq: 2 },
  { id: 'abyss',      n: '深淵の主',           s: 2, r: 3, v: 6000, bq: 3 },  // 頂点魚: 特上餌でのみ
];

export const BAIT = [
  { n: '練り餌', price: 0,  note: '無限' },
  { n: '小魚餌', price: 6,  note: 'C魚から' },
  { n: '活き餌', price: 25, note: 'R魚から' },
  { n: '特上餌', price: 90, note: 'E/L魚から' },
] as const;

// 水槽の恒久バフ（レアリティ別 × サイズ係数）
export const AQ_BUFF = [
  { spd: .04, rare: 0,   txt: '釣り速度+4%' },
  { spd: 0,   rare: .05, txt: 'レア率+5%' },
  { spd: .08, rare: .05, txt: '速度+8% レア+5%' },
  { spd: .10, rare: .12, txt: '速度+10% レア+12%' },
] as const;

// 放流の一時バフ（レアリティ別）
export const REL_BUFF = [
  { spd: .20, rare: 0,   d: 60,  txt: '速度+20% 60秒' },
  { spd: 0,   rare: .25, d: 60,  txt: 'レア率+25% 60秒' },
  { spd: .30, rare: .30, d: 90,  txt: '両方+30% 90秒' },
  { spd: .50, rare: .50, d: 120, txt: 'フィーバー+50% 120秒' },
] as const;

export const EQT = [
  { k: 'reel',  n: 'リール', icon: '🎚', stat: 'spd',  min: 8, max: 22 },
  { k: 'lure',  n: 'ルアー', icon: '🪝', stat: 'rare', min: 6, max: 18 },
  { k: 'charm', n: 'お守り', icon: '🧿', stat: 'size', min: 6, max: 16 },
] as const;

export const EQ_PRE = ['古びた', '頑丈な', '精巧な', '伝説の', '不滅の', '星霜の', '神話の'] as const;

/* ── 鍛冶素材（捌く・ヌシで入手） ── */
export const MATS: Record<string, { n: string; i: string }> = {
  scale: { n: '鱗',         i: '🔹' },   // C/R魚から。強化Lv0〜2に使う
  iri:   { n: '虹色の鱗',   i: '🔷' },   // E/L魚から。強化Lv3以上に使う
  pearl: { n: '深海の真珠', i: '🦪' },   // ヌシから。研磨(再抽選)と最深強化に使う
};

export const BOX_BASE = 20;                             // 魚箱の基本枠（スキルで拡張）
export const SWALLOW = [.05, .15, .35, .70] as const;   // 飲み込み装備率
export const BASE_CAST = 6;                             // 基本釣り間隔(秒)

/* ── スキル ──
   無限パッシブ(maxなし): 効果は線形（+x%/Lv・上限なし）、価格は指数（×1.17〜1.18/Lv）。
   続ければ確実に強くなるが、時間あたりの成長は対数的に逓減する（数値爆発しない）。
   アンロック系(maxあり): 節目の機能解放。 */
export const SKILLS: Skill[] = [
  { id: 'speed',   n: '速釣り',         icon: '⚡', base: 150, mult: 1.20, fx: '釣り速度 +2%/Lv（∞）' },
  { id: 'lucky',   n: '幸運の釣り糸',   icon: '🍀', base: 200, mult: 1.20, fx: 'レア率 +1.5%/Lv（∞）' },
  { id: 'big',     n: '大物狙い',       icon: '💪', base: 180, mult: 1.19, fx: 'サイズ +2%/Lv（∞）' },
  { id: 'trade',   n: '商才',           icon: '💰', base: 170, mult: 1.19, fx: '売値 +2%/Lv（∞）' },
  { id: 'offline', n: '置き竿の心得',   icon: '💤', base: 300, mult: 1.20, fx: 'オフライン上限 +30匹/Lv（∞）' },
  { id: 'crit',    n: '一本釣りの極意', icon: '🎯', max: 5, base: 400, mult: 2.0, fx: '6%/Lvでダブルヒット' },
  { id: 'box',     n: '魚箱拡張',       icon: '📦', max: 4, base: 300, mult: 2.2, fx: '魚箱 +5枠/Lv' },
  { id: 'autob',   n: '自動餌化術',     icon: '🪱', max: 5, base: 250, mult: 1.8, fx: 'Lv1で解禁・餌化率+10%/Lv' },
];

export const PHASES = [
  { n: '朝', i: '🌅' }, { n: '昼', i: '☀️' }, { n: '夕', i: '🌇' }, { n: '夜', i: '🌙' },
] as const;
export const PHASE_LEN = 75;
export const CYCLE = PHASE_LEN * 4;
export const WX_ICON: Record<string, string> = { '晴': '☀️', '雨': '🌧', '霧': '🌫' };
