import type { CatchAnim, EquipKind, Equip, Fish, GameState, MatKind, Species, Stats } from './types';
import {
  AQ_BUFF, BAIT, BASE_CAST, CYCLE, EQ_PRE, EQT, MATS, PHASES, PHASE_LEN,
  RAR, REL_BUFF, SKILLS, SPECIES, SPOTS, SWALLOW,
} from './data';
import { BAL, clamp } from './balance';
import { log, renderHud, renderPane, spawnFloat, toast } from './ui';

export { clamp };
const rnd = Math.random;

export const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

/* ───────────────────────── 状態 ───────────────────────── */
export function freshState(): GameState {
  return {
    gold: 120, spot: 0, rodLv: 1, baitSel: 0,
    bait: { 1: 0, 2: 0, 3: 0 },
    autoB: false,
    box: [],
    equip: { reel: null, lure: null, charm: null },
    eqInv: [],
    aqua: [null, null, null], aquaMax: 3,
    dex: {},
    buffs: [],
    unlocked: [true, false, false],
    skills: {},
    ocean: false,
    mats: { scale: 0, iri: 0, pearl: 0 },
    mastery: {},
    nushiAt: 0,
    nushiWins: 0,
    catches: 0,
    gt: 0,
    ts: Date.now(),
  };
}
export const S: GameState = freshState();

// 実行時のみの状態（セーブ対象外）
export const R: {
  castT: number; anim: CatchAnim | null; speed: number;
  nushi: { t: number } | null;          // ヌシの前兆（巨影演出）
} = {
  castT: 0, anim: null, speed: 1, nushi: null,
};

/* ───────────────────────── 天候・時間帯 ───────────────────────── */
export const Wx = { weather: '晴', cycle: -1 };
export function phaseIdx(): number { return ((Math.floor(S.gt / PHASE_LEN) % 4) + 4) % 4 }
export function tickWeather(): void {
  const c = Math.floor(S.gt / CYCLE);
  if (c !== Wx.cycle) {
    Wx.cycle = c;
    const r = rnd();
    Wx.weather = r < .55 ? '晴' : r < .85 ? '雨' : '霧';
    if (Wx.cycle > 0) log(`天候が「${Wx.weather}」に変わった`);
  }
}

/* ───────────────────────── ステータス集計 ───────────────────────── */
export function skillLv(id: string): number { return S.skills[id] ?? 0; }
export function skillCost(id: string): number {
  const sk = SKILLS.find(s => s.id === id)!;
  return Math.round(sk.base * Math.pow(sk.mult, skillLv(id)));
}
export function buySkill(id: string): boolean {
  const sk = SKILLS.find(s => s.id === id);
  if (!sk || (sk.max !== undefined && skillLv(id) >= sk.max)) return false;
  const cost = skillCost(id);
  if (S.gold < cost) return false;
  S.gold -= cost;
  S.skills[id] = skillLv(id) + 1;
  toast(`${sk.icon} ${sk.n} Lv${S.skills[id]} を習得！`);
  spawnFloat(`${sk.icon} Lv UP!`, 'gold');
  return true;
}
export function getBoxCap(): number { return BAL.boxBase + BAL.boxPerSkill * skillLv('box'); }
export function masteryLv(spot: number): number { return S.mastery[spot]?.lv ?? 0; }

export function stats(): Stats {
  let spd = 1 + (S.rodLv - 1) * BAL.rodSpd, rare = 0, size = 0, sell = 0;
  // 無限パッシブ（線形）
  spd += 0.02 * skillLv('speed');
  rare += 0.015 * skillLv('lucky');
  size += 0.02 * skillLv('big');
  sell += 0.02 * skillLv('trade');
  // 釣り場熟練度（現在の釣り場のみ）
  const ml = masteryLv(S.spot);
  spd += BAL.masteryPer * ml; rare += BAL.masteryPer * ml;
  for (const k of ['reel', 'lure', 'charm'] as EquipKind[]) {
    const e = S.equip[k]; if (!e) continue;
    const f = 1 + (e.enhPct ?? 0) / 100;   // 強化補正
    spd += (e.spd ?? 0) * f / 100; rare += (e.rare ?? 0) * f / 100;
    size += (e.size ?? 0) * f / 100; sell += (e.sell ?? 0) * f / 100;
  }
  for (const a of S.aqua) {
    if (!a) continue;
    const b = AQ_BUFF[SPECIES[a.sp].r];
    spd += b.spd * a.sz; rare += b.rare * a.sz;
  }
  for (let i = 0; i < SPOTS.length; i++) { if (dexComplete(i)) rare += .05; }
  for (const b of S.buffs) { spd += b.spd; rare += b.rare; }
  if (Wx.weather === '雨') rare += .10;
  if (Wx.weather === '霧') size += .10;
  return { spd, rare, size, sell };
}
export function dexComplete(spot: number): boolean {
  return SPECIES.filter(x => x.s === spot).every(x => S.dex[x.id]);
}

/* ───────────────────────── 釣りコア ───────────────────────── */
export function effBait(): number { let t = S.baitSel; while (t > 0 && S.bait[t] <= 0) t--; return t; }
function condOk(sp: Species): boolean {
  if (!sp.cond) return true;
  if (sp.cond === 'rain') return Wx.weather === '雨';
  if (sp.cond === 'night') return PHASES[phaseIdx()].n === '夜';
  return false;
}
export function pickSpecies(bt: number, st: Stats): Species {
  const pool = SPECIES.filter(sp => sp.s === S.spot && (sp.bq ?? 0) <= bt && condOk(sp));
  const cnt = [0, 0, 0, 0];
  pool.forEach(sp => cnt[sp.r]++);
  const BW = [70, 22, 7, 1.4];
  let tot = 0;
  const ws = pool.map(sp => {
    let w = BW[sp.r] / cnt[sp.r];
    if (sp.r > 0) w *= 1 + st.rare * sp.r;                       // レア率バフ
    w *= 1 + 0.35 * Math.max(0, bt - (sp.bq ?? 0)) * sp.r;       // 餌の格上げ連鎖
    tot += w; return w;
  });
  let r = rnd() * tot;
  for (let i = 0; i < pool.length; i++) { r -= ws[i]; if (r <= 0) return pool[i]; }
  return pool[pool.length - 1];
}
export function doCatch(silent: boolean): void {
  const st = stats(), bt = effBait();
  const sp = pickSpecies(bt, st);
  if (bt > 0) S.bait[bt]--;
  let sz = 0.7 + rnd() * 0.6 + rnd() * 0.2;
  sz = clamp(sz * (1 + st.size), 0.5, 2.0);
  sz = Math.round(sz * 100) / 100;
  const idx = SPECIES.indexOf(sp);
  const fish: Fish = { sp: idx, sz };
  S.catches++;
  // 釣り場熟練度（1匹=1XP・Lv60まで）
  const ms = S.mastery[S.spot] ?? (S.mastery[S.spot] = { lv: 0, xp: 0 });
  if (ms.lv < BAL.masteryMax) {
    ms.xp++;
    while (ms.lv < BAL.masteryMax && ms.xp >= BAL.masteryXp(ms.lv)) {
      ms.xp -= BAL.masteryXp(ms.lv); ms.lv++;
      if (!silent) { toast(`📈 ${SPOTS[S.spot].n}の熟練 Lv${ms.lv}！（速度・レア+0.5%）`); spawnFloat('📈 熟練UP', 'gold'); }
    }
  }
  const d = S.dex[sp.id] ?? (S.dex[sp.id] = { c: 0, mx: 0 });
  const isNew = d.c === 0;
  d.c++; d.mx = Math.max(d.mx, sz);
  // 自動餌化（スキル「自動餌化術」で解禁、Lvで率上昇）
  const al = skillLv('autob');
  if (S.autoB && al > 0 && sp.r < 2 && rnd() < 0.2 + 0.1 * al) { addBait(fish); }
  else if (S.box.length >= getBoxCap()) {
    const g = Math.round(sp.v * sz * 0.6); S.gold += g;
    if (!silent) { log(`魚箱が満杯… 行商人が${sp.n}を${g}Gで買い取った`); spawnFloat(`+${g}G`, 'gold'); }
  } else {
    S.box.push(fish);
  }
  if (!silent) {
    if (sp.r >= 2 || isNew) toast(`${isNew ? '✨初' : '🎉'} ${sp.n} ×${sz} を釣り上げた！`);
    log(`<span class="r${sp.r}">${sp.n}</span> ×${sz} を釣った${bt > 0 ? `（${BAIT[bt].n}）` : ''}`);
    spawnFloat(`${sp.n}${sz >= 1.3 ? ' 💪' : ''}`, 'r' + sp.r);
    R.anim = { p: 0, r: sp.r, sz };
    // ダブルヒット（一本釣りの極意）
    const cl = skillLv('crit');
    if (cl > 0 && rnd() < 0.06 * cl) {
      doCatch(true);
      toast('🎯 ダブルヒット！もう1匹かかった');
      spawnFloat('🎯 DOUBLE!', 'gold');
    }
  }
  renderHud(); renderPane();
}

/* ───────────────────────── 魚の4分岐 ───────────────────────── */
export function addBait(fish: Fish): { t: number; q: number } {
  const r = SPECIES[fish.sp].r;
  const t = r >= 2 ? 3 : r + 1;
  const q = 1 + (r >= 2 ? 1 : 0);
  S.bait[t] += q;
  return { t, q };
}
export function actBait(i: number): void {
  const f = S.box[i]; if (!f) return;
  const { t, q } = addBait(f); S.box.splice(i, 1);
  log(`${SPECIES[f.sp].n}を捌いて<b>${BAIT[t].n}×${q}</b>にした`);
}
// 解体素材: C=鱗1 / R=鱗2 / E=虹1+鱗2 / L=虹2。ヌシ個体は＋真珠1
function filletMats(r: number, nu?: boolean): Partial<Record<MatKind, number>> {
  const out: Partial<Record<MatKind, number>> =
    r === 0 ? { scale: 1 } : r === 1 ? { scale: 2 } : r === 2 ? { iri: 1, scale: 2 } : { iri: 2 };
  if (nu) out.pearl = (out.pearl ?? 0) + 1;
  return out;
}
export function addMats(g: Partial<Record<MatKind, number>>): string {
  const t: string[] = [];
  for (const [k, v] of Object.entries(g)) {
    if (!v) continue;
    S.mats[k as MatKind] += v;
    t.push(`${MATS[k].i}×${v}`);
  }
  return t.join(' ');
}
export function actFillet(i: number): void {
  const f = S.box[i]; if (!f) return;
  const sp = SPECIES[f.sp], st = stats();
  const g = Math.round(sp.v * f.sz * (1 + st.sell) * (f.nu ? BAL.nushiValueMul : 1));
  S.gold += g; S.box.splice(i, 1);
  const mt = addMats(filletMats(sp.r, f.nu));
  log(`${sp.n}を捌いて<b>${g}G</b>を得た（${mt}）`);
  spawnFloat(`+${g}G`, 'gold');
  // 飲み込み装備ドロップ
  if (rnd() < SWALLOW[sp.r]) {
    const e = mkEquip(sp.r); S.eqInv.push(e);
    toast(`💎 ${sp.n}が${e.name}を飲み込んでいた！`);
    log(`<span class="r${e.r}">${e.name}</span>を入手（${e.txt}）`);
    spawnFloat(`💎 ${e.name}`, 'r' + Math.min(e.r, 3));
  }
}
/** C/R魚を一括で捌く（飲み込み判定・素材は個別に行う） */
export function actFilletBulk(): void {
  let n = 0, g = 0, drops = 0;
  const st = stats();
  const gain: Partial<Record<MatKind, number>> = {};
  for (let i = S.box.length - 1; i >= 0; i--) {
    const f = S.box[i], sp = SPECIES[f.sp];
    if (sp.r >= 2 || f.nu) continue;
    g += Math.round(sp.v * f.sz * (1 + st.sell));
    for (const [k, v] of Object.entries(filletMats(sp.r))) gain[k as MatKind] = (gain[k as MatKind] ?? 0) + (v ?? 0);
    if (rnd() < SWALLOW[sp.r]) { S.eqInv.push(mkEquip(sp.r)); drops++; }
    S.box.splice(i, 1); n++;
  }
  if (n === 0) { toast('捌けるC/R魚がいない'); return; }
  S.gold += g;
  const mt = addMats(gain);
  log(`C/R魚${n}匹を一括で捌いて<b>${g}G</b>（${mt}）${drops ? `＋装備${drops}個` : ''}`);
  toast(`🔪 ${n}匹を捌いて +${g}G${drops ? ` 💎×${drops}` : ''}`);
  spawnFloat(`+${g}G`, 'gold');
}
export function actDeco(i: number): void {
  const f = S.box[i]; if (!f) return;
  const slot = S.aqua.findIndex(a => a === null);
  if (slot < 0) { toast('水槽が満員！'); return; }
  S.aqua[slot] = f; S.box.splice(i, 1);
  const sp = SPECIES[f.sp];
  log(`${sp.n}を水槽に飾った（${AQ_BUFF[sp.r].txt}×サイズ${f.sz}）`);
}
export function actRelease(i: number): void {
  const f = S.box[i]; if (!f) return;
  const sp = SPECIES[f.sp], b = REL_BUFF[sp.r];
  S.buffs.push({ spd: b.spd, rare: b.rare, until: S.gt + b.d, txt: b.txt });
  S.box.splice(i, 1);
  toast(`🌊 ${sp.n}を放流 → ${b.txt}`);
  log(`${sp.n}を放流した（${b.txt}）`);
}
export function actAquaBack(i: number): void {
  const f = S.aqua[i]; if (!f) return;
  if (S.box.length >= getBoxCap()) { toast('魚箱が満杯'); return; }
  S.box.push(f); S.aqua[i] = null;
  log(`${SPECIES[f.sp].n}を水槽から出した`);
}

/* ───────────────────────── 装備 ───────────────────────── */
let eqSeq = 0;
// 表示テキストと基準価格を（強化込みで）再構築
export function rebuildEqText(e: Equip): void {
  const f = 1 + (e.enhPct ?? 0) / 100;
  const parts: string[] = [];
  if (e.spd) parts.push(`釣り速度+${Math.round(e.spd * f)}%`);
  if (e.rare) parts.push(`レア率+${Math.round(e.rare * f)}%`);
  if (e.size) parts.push(`サイズ+${Math.round(e.size * f)}%`);
  if (e.sell) parts.push(`売値+${Math.round(e.sell * f)}%`);
  e.txt = parts.join(' ') + ((e.enh ?? 0) > 0 ? `　[強化+${e.enh}]` : '');
  const raw = (e.spd ?? 0) + (e.rare ?? 0) + (e.size ?? 0) + (e.sell ?? 0);
  e.bv = Math.round((30 + raw * 6 * f) * (1 + e.r));
}
// レアリティ抽選: 上位は固定の超低確率（ミシック≈1/20,000は引けたこと自体が誇り）
function rollEqRar(bias: number): number {
  const r = rnd();
  let acc = 0;
  for (const w of BAL.eqWindows(bias)) { acc += w.p; if (r < acc) return w.idx; }
  return 0;
}
export function buildEquip(r: number, kindIdx?: number): Equip {
  const t = EQT[kindIdx ?? Math.floor(rnd() * EQT.length)];
  const roll = r >= 6 ? 1 : rnd();           // ミシックは常に最大ロール
  const v = Math.round((t.min + roll * (t.max - t.min)) * RAR[r].mult);
  const e: Equip = {
    id: 'e' + (eqSeq++), k: t.k, r, name: EQ_PRE[r] + t.n, icon: t.icon,
    txt: '', bv: 0,
  };
  (e as unknown as Record<string, number>)[t.stat] = v;
  if (t.k === 'charm') e.sell = Math.round((5 + (r >= 6 ? 12 : rnd() * 12)) * RAR[r].mult);
  rebuildEqText(e);
  return e;
}
export function mkEquip(bias: number): Equip { return buildEquip(rollEqRar(bias)); }

/* ── ⚒ 鍛冶: 強化（失敗あり）・研磨（再抽選） ── */
export function enhMatNeed(e: Equip): { kind: MatKind; n: number; pearl: number } {
  const lv = e.enh ?? 0;
  return lv < 3
    ? { kind: 'scale', n: 3 + lv * 2, pearl: 0 }
    : { kind: 'iri', n: lv - 1, pearl: lv >= 5 ? 1 : 0 };
}
export function actEnhance(e: Equip): 'ok' | 'fail' | 'blocked' {
  const lv = e.enh ?? 0;
  if (lv >= BAL.enhMax(e.r)) return 'blocked';
  const need = enhMatNeed(e);
  if (S.mats[need.kind] < need.n || S.mats.pearl < need.pearl) return 'blocked';
  S.mats[need.kind] -= need.n; S.mats.pearl -= need.pearl;
  if (rnd() >= BAL.enhRate[lv]) {
    log(`⚒ ${e.name}の強化に失敗… 素材が砕けた`);
    return 'fail';
  }
  e.enh = lv + 1; e.enhPct = (e.enhPct ?? 0) + BAL.enhPower;
  rebuildEqText(e);
  toast(`⚒ ${e.name} [+${e.enh}] 強化成功！`);
  spawnFloat('⚒ 強化成功', 'gold');
  return 'ok';
}
export function actReroll(e: Equip): boolean {
  if (S.mats.pearl < 1) return false;
  S.mats.pearl--;
  const t = EQT.find(x => x.k === e.k)!;
  (e as unknown as Record<string, number>)[t.stat] =
    Math.round((t.min + rnd() * (t.max - t.min)) * RAR[e.r].mult);
  if (e.k === 'charm') e.sell = Math.round((5 + rnd() * 12) * RAR[e.r].mult);
  rebuildEqText(e);
  toast(`💠 ${e.name} の性能を研磨し直した`);
  return true;
}

/* ── ⚗ 合成: 同レア9個 → 確率で1ランク上（失敗は同ランク1個に圧縮） ── */
export function fuseStock(r: number): number { return S.eqInv.filter(e => e.r === r).length; }
const fuseKey = (e: Equip): number =>
  (e.enh ?? 0) * 1000 + (e.spd ?? 0) + (e.rare ?? 0) + (e.size ?? 0) + (e.sell ?? 0);
export function actFuse(r: number): { ok: boolean; item: Equip } | null {
  if (r >= RAR.length - 1) return null;
  const cands = S.eqInv.map((e, i) => ({ e, i }))
    .filter(x => x.e.r === r)
    .sort((a, b) => fuseKey(a.e) - fuseKey(b.e))   // 弱い個体から投入（強化済みは温存）
    .slice(0, BAL.fuseCount);
  if (cands.length < BAL.fuseCount) return null;
  const srcKind = EQT.findIndex(t => t.k === cands[Math.floor(rnd() * cands.length)].e.k);
  cands.sort((a, b) => b.i - a.i).forEach(x => S.eqInv.splice(x.i, 1));
  const ok = rnd() < (BAL.fuseRate[r] ?? 0);
  const item = buildEquip(ok ? r + 1 : r, srcKind);
  S.eqInv.push(item);
  if (ok) {
    toast(`⚗ 合成成功！ <${item.name}> が生まれた`);
    log(`⚗ 合成成功 → <span class="r${Math.min(item.r, 3)}">${item.name}</span>（${item.txt}）`);
    spawnFloat('⚗ 昇格!', 'gold');
  } else {
    toast('⚗ 合成失敗… 1個に圧縮された');
    log(`⚗ 合成失敗… ${RAR[r].n}1個に圧縮された`);
  }
  return { ok, item };
}

/* ── 👑 ヌシ（主）イベント: 周期的に巨影が現れ、自動ファイトで勝てば特大個体＋真珠 ── */
export function nushiSpeciesIdx(spot: number): number {
  const id = spot === 0 ? 'nushi' : spot === 1 ? 'seadra' : 'ryugu';
  return SPECIES.findIndex(x => x.id === id);
}
export function nushiTick(gdt: number): void {
  if (S.nushiAt <= 0) { S.nushiAt = S.gt + 120 + rnd() * BAL.nushiVar; return; }
  if (!R.nushi) {
    if (S.gt >= S.nushiAt) {
      R.nushi = { t: 0 };
      toast('❗ ヌシの気配…！');
      log('巨大な影がウキの下を旋回している…');
    }
    return;
  }
  R.nushi.t += gdt;
  if (R.nushi.t < BAL.nushiTelegraph) return;
  R.nushi = null;
  S.nushiAt = S.gt + BAL.nushiMin + rnd() * BAL.nushiVar;
  const st = stats();
  const p = BAL.nushiChance(st.size, st.rare, masteryLv(S.spot));
  if (rnd() < p) {
    const idx = nushiSpeciesIdx(S.spot);
    const sp = SPECIES[idx];
    const sz = BAL.nushiSz();
    S.nushiWins++; S.catches++;
    const d = S.dex[sp.id] ?? (S.dex[sp.id] = { c: 0, mx: 0 });
    d.c++; d.mx = Math.max(d.mx, sz);
    if (S.box.length >= getBoxCap()) {
      const g = Math.round(sp.v * sz * BAL.nushiValueMul * BAL.merchantRate);
      S.gold += g;
      log(`魚箱が満杯… 行商人がヌシを${g}Gで買い取った`);
    } else {
      S.box.push({ sp: idx, sz, nu: true });
    }
    addMats({ pearl: 1 });
    toast(`👑 ヌシ・${sp.n} ×${sz} を釣り上げた！！`);
    log(`<span class="r3">👑 ヌシ・${sp.n}</span> ×${sz} を仕留めた（🦪×1）`);
    spawnFloat('👑 ヌシ GET!', 'r3');
    R.anim = { p: 0, r: 3, sz: Math.min(sz, 1.8) };
  } else {
    toast('💨 ヌシに逃げられた…');
    log('ヌシは深みへ消えた… 散らばった' + addMats({ scale: 3 }) + 'を拾った');
  }
  renderHud(); renderPane();
}
export function actEquip(i: number): void {
  const e = S.eqInv[i]; if (!e) return;
  const old = S.equip[e.k];
  S.equip[e.k] = e; S.eqInv.splice(i, 1);
  if (old) S.eqInv.push(old);
  log(`${e.name}を装備した（${e.txt}）`);
}
export function actUnequip(k: EquipKind): void {
  const e = S.equip[k]; if (!e) return;
  S.equip[k] = null; S.eqInv.push(e);
  log(`${e.name}を外した`);
}
export function rodCost(): number { return BAL.rodCost(S.rodLv) }
export function actRodUp(): void {
  const cost = rodCost();
  if (S.gold < cost || S.rodLv >= BAL.rodMax) return;
  S.gold -= cost; S.rodLv++;
  toast(`🎣 竿を強化！ Lv${S.rodLv}（速度+${Math.round(BAL.rodSpd * 100)}%）`);
}
export function actAquaUnlock(): void {
  if (S.gold < 800 || S.aquaMax >= 5) return;
  S.gold -= 800; S.aquaMax++; S.aqua.push(null);
  toast('🐠 水槽を拡張した！');
}
export function actSpotUnlock(i: number): void {
  if (S.unlocked[i] || S.gold < SPOTS[i].cost) return;
  S.gold -= SPOTS[i].cost; S.unlocked[i] = true; S.spot = i;
  toast(`🗺 ${SPOTS[i].n}を解放！`);
}

/* ───────────────────────── セーブ・オフライン進行 ───────────────────────── */
const SAVE_KEY = 'idle_angler_save_v1';

async function invokeTauri<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<T>(cmd, args);
}

export async function saveGame(): Promise<void> {
  S.ts = Date.now();
  const j = JSON.stringify(S);
  try {
    if (isTauri) await invokeTauri<void>('save_game', { data: j });
    else localStorage.setItem(SAVE_KEY, j);
  } catch (e) { console.warn('save failed', e); }
}

export async function loadGame(): Promise<void> {
  let raw: string | null = null;
  try {
    raw = isTauri ? await invokeTauri<string | null>('load_game') : localStorage.getItem(SAVE_KEY);
  } catch (e) { console.warn('load failed', e); }
  if (!raw) return;
  try {
    const sv = JSON.parse(raw) as GameState;
    Object.assign(S, sv);
    // オフライン進行（最大8時間・最大400匹）
    const elapsed = (Date.now() - sv.ts) / 1000;
    if (elapsed > 30) {
      const st = stats();
      const cap = BAL.offlineBase + BAL.offlinePerLv * skillLv('offline');   // 置き竿の心得で上限増
      const n = Math.min(cap, Math.floor(Math.min(elapsed, BAL.offlineMaxH * 3600) / (BASE_CAST / st.spd)));
      for (let i = 0; i < n; i++) doCatch(true);
      if (n > 0) setTimeout(() => toast(`💤 留守中に ${n} 匹釣り上げた！`), 600);
    }
  } catch (e) { console.warn('save parse failed', e); }
}

export async function resetGame(): Promise<void> {
  Object.assign(S, freshState());
  await saveGame();
  location.reload();
}
