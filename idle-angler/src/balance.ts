// ゲームバランスの中枢定数（td_mock/wall-siege の balance.ts に倣う）。
// 「どこを回すと何が変わるか」をここに集約する。
// 変更したら `node scripts/sim.mjs --hours 24` で進行帯域を確認すること。
//
// 現在の実測帯域（sim・貪欲購入ポリシー）:
//   30分: 速度×1.5 / 1h: ×2.0 / 8h: ×3.0 (レア+91%) / 24h: ×3.3
//   収入: 1.5k → 5〜10k G/h で頭打ち（∞パッシブは線形効果×指数価格で対数成長）
//   ヌシ期待値 ≈ 釣り収入の2〜3割
export const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

export const BAL = {
  // ---- 釣りの基礎 ----
  baseCast: 6,                 // 基本釣り間隔(秒)
  rodMax: 8,
  rodSpd: 0.12,                // 竿1Lvあたり速度+12%
  rodCost: (lv: number): number => 100 * Math.pow(2, lv - 1),

  // ---- 魚箱・行商 ----
  boxBase: 20,
  boxPerSkill: 5,
  merchantRate: 0.6,           // 満杯時の自動買取は基礎値の60%

  // ---- オフライン ----
  offlineBase: 240,            // 上限匹数の基礎
  offlinePerLv: 30,            // 「置き竿の心得」1Lvごと
  offlineMaxH: 8,

  // ---- 釣り場熟練度（釣るほどその場が得意になる） ----
  masteryMax: 60,
  masteryXp: (lv: number): number => Math.round(20 * Math.pow(1.08, lv)),
  masteryPer: 0.005,           // 1Lvあたり 速度+0.5%・レア+0.5%（その釣り場のみ）

  // ---- ヌシ（主）イベント ----
  // 釣り収入の2〜3割に収まるよう調整（成功率は装備・熟練で上がる＝育成の動機）
  nushiMin: 420, nushiVar: 300,   // 出現間隔 420〜720 ゲーム秒
  nushiTelegraph: 8,              // 巨影の前兆(秒)
  nushiChance: (size: number, rare: number, masteryLv: number): number =>
    clamp(0.2 + size * 0.5 + rare * 0.3 + masteryLv * 0.005, 0.15, 0.9),
  nushiSz: (): number => Math.round((1.6 + Math.random() * 0.6) * 100) / 100,
  nushiValueMul: 1.5,          // ヌシ個体の換金倍率

  // ---- 鍛冶: 強化（失敗あり・高Lvほど渋い） ----
  enhRate: [0.95, 0.85, 0.7, 0.5, 0.3, 0.18, 0.1],
  enhPower: 8,                 // 成功1回あたり 効果+8%
  enhMax: (rar: number): number => (rar >= 5 ? 7 : 5),

  // ---- 合成: 同レア9個 → 確率で1ランク上（失敗は1個に圧縮） ----
  fuseCount: 9,
  fuseRate: [0.7, 0.6, 0.5, 0.3, 0.15, 0.06],   // index=現レアリティ(0..5)

  // ---- 装備レアリティ抽選窓（上位は固定の超低確率＝「自慢級」） ----
  //   神話 ≈ 1/20,000 / 星霜 ≈ 1/2,500 はウェーブや運でほぼ縮まない
  eqWindows: (bias: number): Array<{ idx: number; p: number }> => [
    { idx: 6, p: 0.00005 },
    { idx: 5, p: 0.0004 },
    { idx: 4, p: 0.004 + bias * 0.002 },
    { idx: 3, p: 0.02 + bias * 0.012 },
    { idx: 2, p: 0.07 + bias * 0.035 },
    { idx: 1, p: 0.22 + bias * 0.05 },
  ],
};
