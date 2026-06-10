import type { CatchAnim, EquipKind, Equip, Fish, GameState, Species, Stats } from './types';
import {
  AQ_BUFF, BAIT, BASE_CAST, BOX_BASE, CYCLE, EQ_PRE, EQT, PHASES, PHASE_LEN,
  RAR, REL_BUFF, SKILLS, SPECIES, SPOTS, SWALLOW,
} from './data';
import { log, renderHud, renderPane, spawnFloat, toast } from './ui';

export const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
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
    catches: 0,
    gt: 0,
    ts: Date.now(),
  };
}
export const S: GameState = freshState();

// 実行時のみの状態（セーブ対象外）
export const R: { castT: number; anim: CatchAnim | null; speed: number } = {
  castT: 0, anim: null, speed: 1,
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
  if (!sk || skillLv(id) >= sk.max) return false;
  const cost = skillCost(id);
  if (S.gold < cost) return false;
  S.gold -= cost;
  S.skills[id] = skillLv(id) + 1;
  toast(`${sk.icon} ${sk.n} Lv${S.skills[id]} を習得！`);
  spawnFloat(`${sk.icon} Lv UP!`, 'gold');
  return true;
}
export function getBoxCap(): number { return BOX_BASE + 5 * skillLv('box'); }

export function stats(): Stats {
  let spd = 1 + (S.rodLv - 1) * 0.12, rare = 0, size = 0, sell = 0;
  spd += 0.08 * skillLv('speed');
  rare += 0.04 * skillLv('lucky');
  size += 0.05 * skillLv('big');
  sell += 0.06 * skillLv('trade');
  for (const k of ['reel', 'lure', 'charm'] as EquipKind[]) {
    const e = S.equip[k]; if (!e) continue;
    spd += (e.spd ?? 0) / 100; rare += (e.rare ?? 0) / 100;
    size += (e.size ?? 0) / 100; sell += (e.sell ?? 0) / 100;
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
export function actFillet(i: number): void {
  const f = S.box[i]; if (!f) return;
  const sp = SPECIES[f.sp], st = stats();
  const g = Math.round(sp.v * f.sz * (1 + st.sell));
  S.gold += g; S.box.splice(i, 1);
  log(`${sp.n}を捌いて<b>${g}G</b>を得た`);
  spawnFloat(`+${g}G`, 'gold');
  // 飲み込み装備ドロップ
  if (rnd() < SWALLOW[sp.r]) {
    const e = mkEquip(sp.r); S.eqInv.push(e);
    toast(`💎 ${sp.n}が${e.name}を飲み込んでいた！`);
    log(`<span class="r${e.r}">${e.name}</span>を入手（${e.txt}）`);
    spawnFloat(`💎 ${e.name}`, 'r' + e.r);
  }
}
/** C/R魚を一括で捌く（飲み込み判定は個別に行う） */
export function actFilletBulk(): void {
  let n = 0, g = 0, drops = 0;
  const st = stats();
  for (let i = S.box.length - 1; i >= 0; i--) {
    const f = S.box[i], sp = SPECIES[f.sp];
    if (sp.r >= 2) continue;
    g += Math.round(sp.v * f.sz * (1 + st.sell));
    if (rnd() < SWALLOW[sp.r]) { S.eqInv.push(mkEquip(sp.r)); drops++; }
    S.box.splice(i, 1); n++;
  }
  if (n === 0) { toast('捌けるC/R魚がいない'); return; }
  S.gold += g;
  log(`C/R魚${n}匹を一括で捌いて<b>${g}G</b>${drops ? `＋装備${drops}個` : ''}`);
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
export function mkEquip(bias: number): Equip {
  const t = EQT[Math.floor(rnd() * EQT.length)];
  const x = rnd() + bias * 0.12;
  const r = x > 1.05 ? 3 : x > 0.85 ? 2 : x > 0.55 ? 1 : 0;
  const v = Math.round((t.min + rnd() * (t.max - t.min)) * RAR[r].mult);
  const e: Equip = {
    id: 'e' + (eqSeq++), k: t.k, r, name: EQ_PRE[r] + t.n, icon: t.icon,
    txt: '', bv: 0,
  };
  (e as unknown as Record<string, number>)[t.stat] = v;
  let txt = ({ spd: '釣り速度', rare: 'レア率', size: 'サイズ' } as Record<string, string>)[t.stat] + '+' + v + '%';
  if (t.k === 'charm') { e.sell = Math.round((5 + rnd() * 12) * RAR[r].mult); txt += ` 売値+${e.sell}%`; }
  e.txt = txt;
  e.bv = Math.round((30 + v * 6) * (1 + r));   // 市場の基準価格
  return e;
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
export function rodCost(): number { return 100 * Math.pow(2, S.rodLv - 1) }
export function actRodUp(): void {
  const cost = rodCost();
  if (S.gold < cost || S.rodLv >= 8) return;
  S.gold -= cost; S.rodLv++;
  toast(`🎣 竿を強化！ Lv${S.rodLv}（速度+12%）`);
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
      const cap = 240 + 100 * skillLv('offline');   // 置き竿の心得で上限増
      const n = Math.min(cap, Math.floor(Math.min(elapsed, 8 * 3600) / (BASE_CAST / st.spd)));
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
