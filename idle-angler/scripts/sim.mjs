// Idle Angler 経済シミュレーター（ヘッドレス・近似モデル）
// 使い方: node scripts/sim.mjs --hours 8
// balance.ts / data.ts の主要定数を写しているので、変更時はここも同期すること。
// 目的: 「放置8時間でどこまで伸びるか」の帯域確認（厳密な再現ではない）。

const args = process.argv.slice(2);
const HOURS = +(args[args.indexOf('--hours') + 1] || 8);

// ---- balance.ts より ----
const BASE_CAST = 6;
const ROD = { max: 8, spd: 0.12, cost: lv => 100 * Math.pow(2, lv - 1) };
const MASTERY = { max: 60, xp: lv => Math.round(20 * Math.pow(1.08, lv)), per: 0.005 };
const SKILLS = {
  speed:   { base: 150, mult: 1.20, per: 0.02 },
  lucky:   { base: 200, mult: 1.20, per: 0.015 },
  big:     { base: 180, mult: 1.19, per: 0.02 },
  trade:   { base: 170, mult: 1.19, per: 0.02 },
  offline: { base: 300, mult: 1.20, per: 0 },
};
const UNLOCKS = { crit: { base: 400, mult: 2.0, max: 5 }, box: { base: 300, mult: 2.2, max: 4 }, autob: { base: 250, mult: 1.8, max: 5 } };

// ---- data.ts より（釣り場ごとの平均値） ----
// spot: [C平均値, R平均値, E平均値, L平均値, 解放コスト]
const SPOTS = [
  { v: [10, 40, 190, 1200], cost: 0 },
  { v: [12, 52, 220, 1800], cost: 600 },
  { v: [19, 80, 320, 2400], cost: 4000 },
];
const BW = [70, 22, 7, 1.4];
const SWALLOW = [0.05, 0.15, 0.35, 0.70];
const NUSHI = { interval: 570, valueMul: 1.5 }; // 平均間隔・換金倍率（勝率は別計算）

// ---- 状態 ----
const S = {
  gold: 120, rodLv: 1, spot: 0, unlocked: [true, false, false],
  sk: { speed: 0, lucky: 0, big: 0, trade: 0, offline: 0, crit: 0, box: 0, autob: 0 },
  mastery: [ { lv: 0, xp: 0 }, { lv: 0, xp: 0 }, { lv: 0, xp: 0 } ],
  catches: 0, equipSpd: 0, equipRare: 0, equipSell: 0,
};

const skCost = (id) => {
  const d = SKILLS[id] ?? UNLOCKS[id];
  return Math.round(d.base * Math.pow(d.mult, S.sk[id]));
};
const stats = () => {
  const m = S.mastery[S.spot].lv * MASTERY.per;
  return {
    spd: 1 + (S.rodLv - 1) * ROD.spd + SKILLS.speed.per * S.sk.speed + m + S.equipSpd,
    rare: SKILLS.lucky.per * S.sk.lucky + m + S.equipRare,
    sell: SKILLS.trade.per * S.sk.trade + S.equipSell,
    size: SKILLS.big.per * S.sk.big,
  };
};

// 1キャッチあたりの期待ゴールド。
// 餌Tierゲートを近似: 練り餌ではC/Rのみ。自動餌化Lvに応じてE枠が開き、
// 上位餌が回る時間帯のみLも薄く出る。
// 放置の主収入は「魚箱あふれ→行商人買取(基礎値60%)」: 価値の70%は60%換金、
// 30%だけ手動の捌き(1+sell)とみなす。
function catchEV(st, hours) {
  const eOpen = Math.min(0.6, 0.15 * S.sk.autob);              // E魚が釣れるキャストの割合
  const lOpen = hours > 2 && S.sk.autob >= 2 ? 0.06 : 0;       // L魚（活き餌が回る割合）
  const w = [BW[0], BW[1] * (1 + st.rare), BW[2] * (1 + st.rare * 2) * 1.35 * eOpen, BW[3] * (1 + st.rare * 3) * 1.7 * lOpen];
  const tot = w.reduce((a, b) => a + b);
  const p = w.map(x => x / tot);
  const v = SPOTS[S.spot].v;
  const szAvg = 1.05 * (1 + st.size);
  const realize = 0.7 * 0.6 + 0.3 * (1 + st.sell);             // 放置70%は行商人、30%は手動捌き
  let ev = 0;
  for (let r = 0; r < 4; r++) {
    const sellMul = r >= 2 ? 0.9 : realize;                    // E/Lは相場売り
    ev += p[r] * (v[r] * szAvg * sellMul + SWALLOW[r] * 50 * (1 + r) * 0.9 * 0.5); // 装備即売りEV(粗め)
  }
  return ev;
}

// 購入ポリシー: 釣り場解放 > 竿 > アンロック(序盤) > ∞パッシブの最安
function spend() {
  for (let i = 1; i < 3; i++) {
    if (!S.unlocked[i] && S.gold >= SPOTS[i].cost * 1.5) { S.gold -= SPOTS[i].cost; S.unlocked[i] = true; S.spot = i; }
  }
  if (S.rodLv < ROD.max && S.gold >= ROD.cost(S.rodLv) * 1.2) { S.gold -= ROD.cost(S.rodLv); S.rodLv++; return; }
  for (const id of ['autob', 'box']) {
    if (S.sk[id] < UNLOCKS[id].max && S.sk[id] < 2 && S.gold >= skCost(id) * 1.2) { S.gold -= skCost(id); S.sk[id]++; return; }
  }
  const inf = ['speed', 'lucky', 'big', 'trade'];
  inf.sort((a, b) => skCost(a) - skCost(b));
  if (S.gold >= skCost(inf[0]) * 1.1) { S.gold -= skCost(inf[0]); S.sk[inf[0]]++; }
}

// 装備の成長スケジュール（飲み込み→装着の近似）: 時間とともに段階強化
function equipSchedule(hours) {
  const tier = hours < 0.5 ? 0 : hours < 1.5 ? 1 : hours < 3 ? 2 : hours < 6 ? 3 : 4;
  S.equipSpd = [0, 0.06, 0.12, 0.2, 0.3][tier];
  S.equipRare = [0, 0.04, 0.08, 0.14, 0.2][tier];
  S.equipSell = [0, 0.04, 0.08, 0.12, 0.18][tier];
}

// ---- メインループ（1秒刻み） ----
const SEC = HOURS * 3600;
const marks = [0.5, 1, 2, 4, 8, 12, 24].filter(h => h <= HOURS);
let nextMark = 0, lastGold = 120, lastCatch = 0, nushiT = 0;
console.log(`== Idle Angler sim: ${HOURS}h ==`);
console.log('  h   |  gold   | g/h(区間) | catch | cast(s) | spd   | rare  | rod | spot | sk(spd/lck/big/trd)');
for (let t = 0; t <= SEC; t++) {
  const st = stats();
  const dur = BASE_CAST / st.spd;
  // キャッチ（期待値ベース）
  if (t % Math.max(1, Math.round(dur)) === 0 && t > 0) {
    S.gold += catchEV(st, t / 3600);
    S.catches++;
    const ms = S.mastery[S.spot];
    if (ms.lv < MASTERY.max) { ms.xp++; if (ms.xp >= MASTERY.xp(ms.lv)) { ms.xp = 0; ms.lv++; } }
    if (S.sk.crit > 0 && Math.random() < 0.06 * S.sk.crit) { S.gold += catchEV(st, t / 3600); S.catches++; }
  }
  // ヌシ（平均間隔ごとに勝率分の期待値）
  nushiT++;
  if (nushiT >= NUSHI.interval) {
    nushiT = 0;
    const p = Math.min(0.9, 0.2 + st.size * 0.5 + st.rare * 0.3 + S.mastery[S.spot].lv * 0.005);
    S.gold += p * SPOTS[S.spot].v[3] * 1.9 * NUSHI.valueMul * 0.7;
  }
  if (t % 10 === 0) spend();
  equipSchedule(t / 3600);
  if (nextMark < marks.length && t >= marks[nextMark] * 3600) {
    const h = marks[nextMark];
    const gph = Math.round((S.gold - lastGold) / (h - (marks[nextMark - 1] ?? 0)));
    console.log(
      ` ${String(h).padStart(4)} | ${String(Math.round(S.gold)).padStart(7)} | ${String(gph).padStart(8)} | ${String(S.catches).padStart(5)} | ${dur.toFixed(2).padStart(6)} | ${st.spd.toFixed(2)} | ${(st.rare * 100).toFixed(0).padStart(4)}% | ${S.rodLv}   | ${S.spot}    | ${S.sk.speed}/${S.sk.lucky}/${S.sk.big}/${S.sk.trade}`,
    );
    lastGold = S.gold; lastCatch = S.catches; nextMark++;
  }
}
void lastCatch;
console.log(`\n最終: gold=${Math.round(S.gold)} catches=${S.catches} 熟練=[${S.mastery.map(m => m.lv)}] rod=${S.rodLv}`);
