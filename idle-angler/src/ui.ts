/* UI — ホバーFAB・☰メニュー・ポップアップ
   魚箱 / 装備(スロット盤面＋詳細＋インベントリの2ペイン) / スキル / 水槽図鑑 / 市場 / 設定 */
import type { Equip, EquipKind, MatKind, PopKind } from './types';
import { AQ_BUFF, BAIT, MATS, PHASES, RAR, SKILLS, SPECIES, SPOTS } from './data';
import { BAL } from './balance';
import {
  R, S, Wx, actAquaBack, actAquaUnlock, actBait, actDeco, actEnhance, actEquip,
  actFillet, actFilletBulk, actFuse, actRelease, actReroll, actRodUp, actSpotUnlock,
  actUnequip, buySkill, dexComplete, enhMatNeed, fuseStock, getBoxCap, masteryLv,
  phaseIdx, resetGame, rodCost, skillCost, skillLv, stats,
} from './game';
import { Market, mktCache, refreshMarket } from './market';
import { cycleCorner, getCorner, setCorner, setExpanded, setOcean } from './winctl';

export const $ = (id: string) => document.getElementById(id)!;

let openPop: PopKind | null = null;
export function currentPop(): PopKind | null { return openPop; }
const POP_TITLE: Record<PopKind, string> = {
  box: '🐟 魚箱', eq: '🎣 装備', skill: '✨ スキル', aq: '🐠 水槽・図鑑', mkt: '🏪 市場', set: '⚙ 設定',
};

// 装備画面の選択状態
type EqSel = { t: 'rod' } | { t: 'slot'; k: EquipKind } | { t: 'inv'; i: number } | null;
let eqSel: EqSel = null;

/* ───────────────────────── ログ・トースト・フロート演出 ───────────────────────── */
export function log(m: string): void {
  const l = $('log');
  l.innerHTML = '› ' + m + '<br>' + l.innerHTML;
  if (l.childNodes.length > 60) l.innerHTML = l.innerHTML.split('<br>').slice(0, 40).join('<br>');
}
let toastTm = 0;
export function toast(m: string): void {
  const t = $('toast');
  t.textContent = m; t.classList.add('show');
  clearTimeout(toastTm);
  toastTm = window.setTimeout(() => t.classList.remove('show'), 2600);
}
/** 釣果や報酬をフワッと浮かせるテキスト演出 */
export function spawnFloat(text: string, cls: string): void {
  const fx = document.getElementById('fx');
  if (!fx) return;
  const s = document.createElement('span');
  s.className = 'float ' + cls;
  s.textContent = text;
  s.style.left = (15 + Math.random() * 45) + '%';
  s.style.top = (40 + Math.random() * 25) + '%';
  fx.appendChild(s);
  s.addEventListener('animationend', () => s.remove());
}

/* ───────────────────────── HUD ───────────────────────── */
export function renderHud(): void {
  $('hGold').textContent = String(Math.floor(S.gold));
  $('hCatch').textContent = String(S.catches);
  const ph = PHASES[phaseIdx()];
  $('hWx').textContent = `${ph.i} ${ph.n}・${Wx.weather}`;
  $('fabBadge').textContent = String(S.box.length);
  $('mBox').textContent = `${S.box.length}/${getBoxCap()}`;
  const hb = $('hBuff');
  if (S.buffs.length) {
    const b = S.buffs[S.buffs.length - 1];
    hb.style.display = '';
    hb.textContent = `⚡${b.txt.split(' ')[0]} 残${Math.ceil(b.until - S.gt)}s`;
  } else hb.style.display = 'none';
}

/* ───────────────────────── 魚箱 ───────────────────────── */
function fishRow(fIdx: number): string {
  const f = S.box[fIdx];
  const sp = SPECIES[f.sp];
  const big = (f.nu ? ' <span class="badge nu">👑ヌシ</span>' : '') + (f.sz >= 1.3 ? ' <span class="badge">💪大物</span>' : '');
  const sellBtn = sp.r >= 2
    ? `<button class="ab gold" data-act="sellfish" data-i="${fIdx}" title="市場相場で売却">💱売</button>` : '';
  return `<div class="row bl-${sp.r} gl-${sp.r}">
    <div class="nm"><span class="r${sp.r}">${sp.n}</span>${big}
      <div class="sub">サイズ×${f.sz}　${sp.v}G</div></div>
    <button class="ab" data-act="bait" data-i="${fIdx}" title="餌にする（格上げ連鎖）">🪱餌</button>
    <button class="ab" data-act="fillet" data-i="${fIdx}" title="捌いて現金化＋飲み込み装備チャンス">🔪捌</button>
    <button class="ab" data-act="deco" data-i="${fIdx}" title="水槽に飾る（恒久バフ）">🐠飾</button>
    <button class="ab" data-act="rel" data-i="${fIdx}" title="放流（一時バフ）">🌊放</button>
    ${sellBtn}</div>`;
}
function renderBox(): void {
  let h = `<div class="toolbar">
    <span class="hintx" style="margin:0">🪱餌=格上げ連鎖 / 🔪捌=現金＋装備 / 🐠飾=恒久バフ / 🌊放=一時バフ</span>
    <button class="ab big" data-act="filletall" title="C/R魚をまとめて現金化">🔪 C/R一括捌き</button>
  </div>`;
  if (!S.box.length) h += '<div class="hintx">まだ魚がいない… ウキを眺めて待とう</div>';
  S.box.map((f, i) => ({ f, i }))
    .sort((a, b) => SPECIES[b.f.sp].r - SPECIES[a.f.sp].r)
    .forEach(({ i }) => h += fishRow(i));
  $('popBody').innerHTML = h;
}

/* ───────────────────────── 装備（2ペイン） ───────────────────────── */
const SLOT_DEF: { k: EquipKind; icon: string; n: string }[] = [
  { k: 'reel', icon: '🎚', n: 'リール' },
  { k: 'lure', icon: '🪝', n: 'ルアー' },
  { k: 'charm', icon: '🧿', n: 'お守り' },
];
function slotTile(sel: boolean, icon: string, name: string, sub: string, r: number, act: string, extra = ''): string {
  return `<div class="stile ${sel ? 'sel' : ''} ${r >= 0 ? 'gl-' + r : ''}" data-act="${act}" ${extra}>
    <div class="sicon">${icon}</div>
    <div class="snm ${r >= 0 ? 'r' + r : ''}">${name}</div>
    <div class="ssub">${sub}</div></div>`;
}
/** 選択中の装備の実体参照（スロット中でもインベントリでも鍛冶できる） */
function selEquipRef(): Equip | null {
  if (!eqSel || eqSel.t === 'rod') return null;
  if (eqSel.t === 'slot') return S.equip[eqSel.k];
  return S.eqInv[eqSel.i] ?? null;
}
// ⚒ 鍛冶セクション（強化・研磨）
function forgeHtml(e: Equip): string {
  const lv = e.enh ?? 0;
  const maxE = BAL.enhMax(e.r);
  let h = '';
  if (lv >= maxE) {
    h += `<div class="dstat dim">⚒ 強化 MAX（+${lv}）</div>`;
  } else {
    const need = enhMatNeed(e);
    const rate = Math.round(BAL.enhRate[lv] * 100);
    const cost = `${MATS[need.kind].i}×${need.n}${need.pearl ? ` ${MATS.pearl.i}×${need.pearl}` : ''}`;
    const can = S.mats[need.kind] >= need.n && S.mats.pearl >= need.pearl;
    h += `<button class="ab big" data-act="enh" ${can ? '' : 'disabled'}
      title="効果+${BAL.enhPower}%・失敗すると素材だけ消える">⚒ 強化 ${cost}（${rate}%）</button>`;
  }
  h += `<button class="ab" data-act="reroll" ${S.mats.pearl < 1 ? 'disabled' : ''}
    title="性能値を再抽選する">💠 研磨 ${MATS.pearl.i}×1</button>`;
  return `<div class="drow" style="margin-top:6px">${h}</div>`;
}
// ⚗ 合成パネル（未選択時のデフォルト表示）
function fuseHtml(): string {
  let h = '<div class="sec" style="margin-top:0">⚗ 合成</div><div class="hintx">同レア9個 → 確率で1ランク上（失敗は1個に圧縮）</div>';
  for (let r = 0; r < RAR.length - 1; r++) {
    const st = fuseStock(r);
    if (st === 0 && r >= 3) continue;
    const rate = Math.round((BAL.fuseRate[r] ?? 0) * 100);
    h += `<div class="row bl-${Math.min(r, 6)}"><div class="nm"><span class="r${r}">${RAR[r].n}</span>
      <div class="sub">所持 ${st}/9 → ${RAR[r + 1].n}（${rate}%）</div></div>
      <button class="ab gold" data-act="fuse" data-r="${r}" ${st < BAL.fuseCount ? 'disabled' : ''}>⚗ 合成</button></div>`;
  }
  return h;
}
function eqDetail(): string {
  if (!eqSel) return fuseHtml();
  if (eqSel.t === 'rod') {
    const c = rodCost();
    return `<div class="dhead"><span class="dicon">🎣</span><div><b>竿 Lv${S.rodLv}</b><div class="sub">基本装備</div></div></div>
      <div class="dstat">基礎釣り速度 +${(S.rodLv - 1) * 12}%</div>
      <div class="dstat dim">強化で +12%/Lv（最大Lv${BAL.rodMax}）</div>
      <button class="ab big gold" data-act="rodup" ${S.gold < c || S.rodLv >= BAL.rodMax ? 'disabled' : ''}>
        ${S.rodLv >= BAL.rodMax ? 'MAX' : `⤴ 強化する ${c}G`}</button>`;
  }
  if (eqSel.t === 'slot') {
    const e = S.equip[eqSel.k];
    if (!e) return '<div class="hintx" style="margin-top:30px;text-align:center">未装備のスロット。<br>インベントリから装備を選んで「装着」</div>';
    return `<div class="dhead"><span class="dicon">${e.icon}</span><div><b class="r${e.r}">${e.name}</b><div class="sub">${RAR[e.r].n}</div></div></div>
      <div class="dstat">${e.txt}</div>
      <button class="ab big" data-act="uneq" data-k="${e.k}">⤵ 外す</button>
      ${forgeHtml(e)}`;
  }
  const e = S.eqInv[eqSel.i];
  if (!e) return fuseHtml();
  const cur = S.equip[e.k];
  const g = Math.floor(e.bv * mktCache.q.equip * 0.9);
  let cmp = '';
  if (cur) cmp = `<div class="dstat dim">装備中: <span class="r${cur.r}">${cur.name}</span><br>${cur.txt}</div>`;
  return `<div class="dhead"><span class="dicon">${e.icon}</span><div><b class="r${e.r}">${e.name}</b><div class="sub">${RAR[e.r].n}</div></div></div>
    <div class="dstat">${e.txt}</div>${cmp}
    <div class="drow">
      <button class="ab big" data-act="equip" data-i="${eqSel.i}">⤴ 装着</button>
      <button class="ab big gold" data-act="selleq" data-i="${eqSel.i}">💱 売却 ${g}G</button>
    </div>
    ${forgeHtml(e)}`;
}
function renderEq(): void {
  const st = stats();
  let h = `<div class="statbar">⚡×${st.spd.toFixed(2)}　🍀+${Math.round(st.rare * 100)}%　💪+${Math.round(st.size * 100)}%　💰+${Math.round(st.sell * 100)}%
    <span style="float:right;color:var(--dim)">${(Object.keys(MATS) as MatKind[]).map(k => `${MATS[k].i}${S.mats[k]}`).join(' ')}</span></div>`;
  // スロット盤面
  h += '<div class="slots">';
  h += slotTile(eqSel?.t === 'rod', '🎣', `竿 Lv${S.rodLv}`, `+${(S.rodLv - 1) * 12}%`, -1, 'esel-rod');
  for (const sd of SLOT_DEF) {
    const e = S.equip[sd.k];
    const sel = eqSel?.t === 'slot' && eqSel.k === sd.k;
    if (e) h += slotTile(sel, e.icon, e.name, e.txt.split(' ')[0], e.r, 'esel-slot', `data-k="${sd.k}"`);
    else h += slotTile(sel, sd.icon, sd.n, '空き', -1, 'esel-slot', `data-k="${sd.k}"`);
  }
  h += '</div>';
  // 2ペイン: インベントリ / 詳細
  h += '<div class="ek2"><div class="ekL">';
  h += `<div class="sec" style="margin-top:0">インベントリ (${S.eqInv.length})</div>`;
  if (!S.eqInv.length) h += '<div class="hintx">「捌」で飲み込み装備を集めよう</div>';
  S.eqInv.slice().map((e, i) => ({ e, i }))
    .sort((a, b) => b.e.r - a.e.r)
    .forEach(({ e, i }) => {
      const sel = eqSel?.t === 'inv' && eqSel.i === i;
      h += `<div class="erow bl-${e.r} ${sel ? 'sel' : ''} ${e.r >= 4 ? 'gl-' + e.r : ''}" data-act="esel-inv" data-i="${i}">
      ${e.icon} <span class="r${e.r}">${e.name}</span>${(e.enh ?? 0) > 0 ? `<span class="badge">+${e.enh}</span>` : ''}</div>`;
    });
  h += '</div><div class="ekR">' + eqDetail() + '</div></div>';
  $('popBody').innerHTML = h;
}

/* ───────────────────────── スキル ───────────────────────── */
function skillCard(sk: (typeof SKILLS)[number]): string {
  const lv = skillLv(sk.id);
  const maxed = sk.max !== undefined && lv >= sk.max;
  const cost = skillCost(sk.id);
  const can = !maxed && S.gold >= cost;
  let gauge: string;
  if (sk.max === undefined) {
    gauge = `<div class="pips"><span class="lvbadge">Lv ${lv}</span><span class="lvinf">∞</span></div>`;
  } else {
    let pips = '';
    for (let i = 0; i < sk.max; i++) pips += `<span class="pip ${i < lv ? 'on' : ''}"></span>`;
    gauge = `<div class="pips">${pips}</div>`;
  }
  return `<div class="skcard ${can ? 'can' : ''} ${maxed ? 'maxed' : ''}">
    <div class="skhead"><span class="skicon">${sk.icon}</span><b>${sk.n}</b></div>
    <div class="skfx">${sk.fx}</div>
    ${gauge}
    <button class="ab big ${can ? 'gold' : ''}" data-act="skill" data-id="${sk.id}" ${maxed || !can ? 'disabled' : ''}>
      ${maxed ? 'MAX' : `習得 ${cost}G`}</button>
  </div>`;
}
function renderSkill(): void {
  let h = `<div class="statbar">💰 所持 ${Math.floor(S.gold)}G — コインでスキルを習得して釣りを加速</div>`;
  h += '<div class="sec" style="margin-top:0">恒久パッシブ（効果は無限・価格は逓増）</div><div class="skgrid">';
  for (const sk of SKILLS.filter(s => s.max === undefined)) h += skillCard(sk);
  h += '</div><div class="sec">アンロック</div><div class="skgrid">';
  for (const sk of SKILLS.filter(s => s.max !== undefined)) h += skillCard(sk);
  h += '</div>';
  $('popBody').innerHTML = h;
}

/* ───────────────────────── 水槽・図鑑 ───────────────────────── */
function renderAq(): void {
  let h = '<div class="sec">水槽（恒久バフ）</div><div class="aqua">';
  for (let i = 0; i < S.aquaMax; i++) {
    const a = S.aqua[i];
    if (a) {
      const sp = SPECIES[a.sp];
      h += `<div class="aslot f gl-${sp.r}" style="border-color:${RAR[sp.r].col}" data-act="aquaback" data-i="${i}" title="クリックで魚箱に戻す">
        <span class="r${sp.r}">${sp.n}</span><span>${AQ_BUFF[sp.r].txt}</span><span>×${a.sz}</span></div>`;
    } else h += '<div class="aslot">空き<br>魚箱から「飾」</div>';
  }
  h += '</div>';
  if (S.aquaMax < 5) h += `<button class="ab big gold" data-act="aquaunlock" ${S.gold < 800 ? 'disabled' : ''}>🐠 水槽拡張 800G</button>`;
  h += `<div class="sec">図鑑${S.nushiWins > 0 ? `　<span class="r3">👑ヌシ討伐 ×${S.nushiWins}</span>` : ''}</div>`;
  SPOTS.forEach((spot, si) => {
    const list = SPECIES.filter(x => x.s === si);
    const got = list.filter(x => S.dex[x.id]).length;
    const ml = masteryLv(si);
    h += `<div class="hintx" style="margin-top:6px"><b>${spot.n}</b> ${got}/${list.length}${dexComplete(si) ? ' ✅コンプ（レア率+5%）' : ''}${ml > 0 ? `　📈熟練Lv${ml}` : ''}</div><div class="dex">`;
    list.forEach(x => {
      const d = S.dex[x.id];
      const cond = x.cond === 'rain' ? '☔雨限定' : x.cond === 'night' ? '🌙夜限定' : '';
      const bq = x.bq ? `要${BAIT[x.bq].n}` : '';
      if (d) h += `<div class="dx r${x.r} gl-${x.r}" title="${cond} ${bq}">${x.n} ×${d.c}<br>最大${d.mx}</div>`;
      else h += `<div class="dx unk" title="${cond} ${bq}">？？？<br><span style="font-size:9px">${[cond, bq].filter(Boolean).join(' ') || '　'}</span></div>`;
    });
    h += '</div>';
  });
  $('popBody').innerHTML = h;
}

/* ───────────────────────── 市場 ───────────────────────── */
function renderMkt(): void {
  const { q, prev, listings } = mktCache;
  const cat = { bait: '餌', equip: '装備', fish: '観賞魚' } as const;
  let h = '<div class="hintx">需要は変動し、売買で価格が動く（ローカルシミュ）。<b>将来ここをRMT/Steam Marketアダプタに差し替え</b></div><div class="quote">';
  for (const k of Object.keys(cat) as (keyof typeof cat)[]) {
    const d = q[k] >= prev[k];
    h += `<div class="q">${cat[k]}<br><b class="${d ? 'up' : 'dn'}">${Math.round(q[k] * 100)}%</b> ${d ? '▲' : '▼'}</div>`;
  }
  h += '</div><div class="sec">出品リスト</div>';
  if (!listings.length) h += '<div class="hintx">入荷待ち…</div>';
  listings.forEach((l, i) => {
    let nm = '', sub = '', r = 0;
    if (l.kind === 'bait') { nm = `🪱 ${BAIT[l.t].n}×${l.qty}`; sub = BAIT[l.t].note; r = l.t - 1; }
    else if (l.kind === 'equip') { nm = `${l.it.icon} ${l.it.name}`; sub = l.it.txt; r = l.it.r; }
    else { const sp = SPECIES[l.sp]; nm = `🐠 ${sp.n}`; sub = `観賞用 サイズ×${l.sz}`; r = sp.r; }
    h += `<div class="row bl-${r} gl-${r}"><div class="nm"><span class="r${r}">${nm}</span><div class="sub">${sub}</div></div>
      <button class="ab gold" data-act="buy" data-i="${i}" ${S.gold < l.price ? 'disabled' : ''}>買 ${l.price}G</button></div>`;
  });
  h += '<div class="sec">餌を売る（5個単位・手数料10%）</div>';
  for (let t = 1; t <= 3; t++) {
    const g = Math.floor(BAIT[t].price * Math.min(5, S.bait[t]) * q.bait * 0.9);
    h += `<div class="row bl-${t - 1}"><div class="nm">🪱 ${BAIT[t].n} 所持×${S.bait[t]}</div>
      <button class="ab gold" data-act="sellbait" data-t="${t}" ${S.bait[t] <= 0 ? 'disabled' : ''}>売 ${g}G</button></div>`;
  }
  h += '<div class="hintx" style="margin-top:6px">装備の売却は「装備」、E/L魚の売却は「魚箱」の「💱売」から</div>';
  $('popBody').innerHTML = h;
}

/* ───────────────────────── 設定 ───────────────────────── */
function renderSet(): void {
  let h = '<div class="sec">釣り</div>';
  h += '<div class="setrow"><span class="lbl">釣り場</span><select data-set="spot">';
  SPOTS.forEach((sp, i) => {
    const ml = masteryLv(i);
    h += `<option value="${i}" ${i === S.spot ? 'selected' : ''}>${S.unlocked[i] ? `${sp.n}${ml > 0 ? `（熟練Lv${ml}）` : ''}` : `🔒${sp.n}（${sp.cost}G）`}</option>`;
  });
  h += '</select></div>';
  h += '<div class="setrow"><span class="lbl">餌</span><select data-set="bait">';
  BAIT.forEach((b, t) => {
    h += `<option value="${t}" ${t === S.baitSel ? 'selected' : ''}>${t === 0 ? `${b.n}（∞）` : `${b.n}×${S.bait[t]}`}</option>`;
  });
  h += '</select></div>';
  const al = skillLv('autob');
  h += `<div class="setrow"><span class="lbl">自動餌化</span>
    <label style="cursor:pointer;opacity:${al > 0 ? 1 : .45}">
      <input type="checkbox" data-set="auto" ${S.autoB ? 'checked' : ''} ${al > 0 ? '' : 'disabled'}>
      ${al > 0 ? `C/R魚の${20 + 10 * al}%を自動で餌に` : 'スキル「自動餌化術」で解禁'}</label></div>`;
  h += '<div class="sec">表示・デモ</div>';
  h += '<div class="setrow"><span class="lbl">モード</span>';
  h += `<button class="ab ${S.ocean ? '' : 'on'}" data-act="ocean" data-v="0">🪟 通常</button>`;
  h += `<button class="ab ${S.ocean ? 'on' : ''}" data-act="ocean" data-v="1" title="四隅=画面端まで断ち落ち（上隅は空つき）／中央=左右へ続くパノラマ帯">🌊 大海（コーナーフィット）</button>`;
  h += '</div>';
  h += '<div class="setrow"><span class="lbl">配置</span>';
  ([['↘', 0], ['↙', 1], ['↖', 2], ['↗', 3], ['◎', 4]] as [string, number][]).forEach(([s, i]) => {
    h += `<button class="ab ${getCorner() === i ? 'on' : ''}" data-act="dock" data-i="${i}">${s}</button>`;
  });
  h += '</div><div class="setrow"><span class="lbl">倍速</span>';
  [1, 4, 20].forEach(n => {
    h += `<button class="ab ${R.speed === n ? 'on' : ''}" data-act="spd" data-n="${n}">×${n}</button>`;
  });
  h += '</div><div class="sec">データ</div>';
  h += '<button class="ab" data-act="reset" style="opacity:.6">セーブ初期化</button>';
  $('popBody').innerHTML = h;
}

export function renderPane(): void {
  if (!openPop) return;
  ({ box: renderBox, eq: renderEq, skill: renderSkill, aq: renderAq, mkt: renderMkt, set: renderSet })[openPop]();
}
export function renderAll(): void { renderHud(); renderPane(); }

/* ───────────────────────── ポップアップ開閉 ───────────────────────── */
export function openPopup(k: PopKind): void {
  openPop = k;
  $('menu').style.display = 'none';
  $('popup').style.display = 'block';
  $('popTtl').textContent = POP_TITLE[k];
  if (k === 'mkt') { void refreshMarket().then(renderPane); }
  renderPane();
  void setExpanded(true);
}
export function closePopup(): void {
  openPop = null;
  $('popup').style.display = 'none';
  if ($('menu').style.display !== 'block') void setExpanded(false);
}
function toggleMenu(): void {
  const m = $('menu');
  const showing = m.style.display === 'block';
  if (showing) {
    m.style.display = 'none';
    if (!openPop) void setExpanded(false);
  } else {
    m.style.display = 'block';
    renderHud();
    void setExpanded(true);
  }
}
export function closeAll(): void {
  $('menu').style.display = 'none';
  if (openPop) { openPop = null; $('popup').style.display = 'none'; }
  void setExpanded(false);
}

/* ───────────────────────── 操作（イベント委譲） ───────────────────────── */
function setSpeed(n: number): void {
  R.speed = n;
  $('spdBtn').textContent = '×' + n;
}
async function handleAct(act: string, d: DOMStringMap): Promise<void> {
  const i = d.i !== undefined ? +d.i : -1;
  switch (act) {
    case 'bait': actBait(i); break;
    case 'fillet': actFillet(i); break;
    case 'filletall': actFilletBulk(); break;
    case 'deco': actDeco(i); break;
    case 'rel': actRelease(i); break;
    case 'sellfish': {
      const f = S.box[i]; if (!f) break;
      const g = await Market.sellFish(f);
      S.box.splice(i, 1);
      log(`市場で${SPECIES[f.sp].n}を<b>${g}G</b>で売却（手数料10%）`);
      spawnFloat(`+${g}G`, 'gold');
      break;
    }
    case 'aquaback': actAquaBack(i); break;
    case 'aquaunlock': actAquaUnlock(); break;
    case 'esel-rod': eqSel = { t: 'rod' }; break;
    case 'esel-slot': eqSel = { t: 'slot', k: d.k as EquipKind }; break;
    case 'esel-inv': eqSel = { t: 'inv', i }; break;
    case 'equip': actEquip(i); eqSel = null; break;
    case 'uneq': actUnequip(d.k as EquipKind); eqSel = null; break;
    case 'selleq': {
      const e = S.eqInv[i]; if (!e) break;
      const g = await Market.sellEquip(e);
      S.eqInv.splice(i, 1); eqSel = null;
      log(`市場で${e.name}を<b>${g}G</b>で売却`);
      spawnFloat(`+${g}G`, 'gold');
      break;
    }
    case 'rodup': actRodUp(); break;
    case 'skill': buySkill(d.id ?? ''); break;
    case 'enh': {
      const e = selEquipRef(); if (!e) break;
      if (actEnhance(e) === 'fail') toast('⚒ 強化失敗… 素材が砕けた');
      break;
    }
    case 'reroll': {
      const e = selEquipRef(); if (!e) break;
      actReroll(e);
      break;
    }
    case 'fuse': actFuse(+(d.r ?? 0)); break;
    case 'buy': {
      const l = mktCache.listings[i];
      const ok = await Market.buy(i);
      if (ok && l) {
        const nm = l.kind === 'bait' ? `${BAIT[l.t].n}×${l.qty}` : l.kind === 'equip' ? l.it.name : SPECIES[l.sp].n;
        log(`${nm}を購入（${l.price}G）`);
      } else if (!ok) toast('購入できない（資金/魚箱を確認）');
      await refreshMarket();
      break;
    }
    case 'sellbait': {
      const t = +(d.t ?? 0);
      const g = await Market.sellBait(t);
      if (g > 0) { log(`${BAIT[t].n}を市場で売却（<b>${g}G</b>）`); spawnFloat(`+${g}G`, 'gold'); }
      break;
    }
    case 'ocean': await setOcean(d.v === '1'); break;
    case 'dock': await setCorner(i); break;
    case 'spd': setSpeed(+(d.n ?? 1)); break;
    case 'reset': {
      const ok = typeof window.confirm === 'function' ? window.confirm('セーブデータを初期化しますか？') : true;
      if (ok) await resetGame();
      break;
    }
  }
  renderAll();
}

export function bindUI(): void {
  // ポップアップ・メニュー内のボタン（委譲）
  document.addEventListener('click', e => {
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-act],[data-pop]');
    if (!el) return;
    if (el.dataset.pop) { openPopup(el.dataset.pop as PopKind); return; }
    if (el.dataset.act) void handleAct(el.dataset.act, el.dataset);
  });
  // 設定のセレクト/チェック（委譲）
  document.addEventListener('change', e => {
    const el = e.target as HTMLInputElement | HTMLSelectElement;
    const key = el.dataset.set;
    if (!key) return;
    if (key === 'spot') {
      const i = +el.value;
      if (!S.unlocked[i]) {
        if (S.gold >= SPOTS[i].cost) actSpotUnlock(i);
        else toast(`解放には ${SPOTS[i].cost}G 必要`);
      } else { S.spot = i; R.castT = 0; log(`${SPOTS[i].n}に移動した`); }
      renderAll();
    } else if (key === 'bait') { S.baitSel = +el.value; renderPane(); }
    else if (key === 'auto') { S.autoB = (el as HTMLInputElement).checked; }
  });
  // FAB
  $('spdBtn').onclick = () => { setSpeed(R.speed === 1 ? 4 : R.speed === 4 ? 20 : 1); renderPane(); };
  $('dockBtn').onclick = () => { void cycleCorner(); };
  $('fabMenu').onclick = () => toggleMenu();
  $('popClose').onclick = () => closePopup();
  // ウィジェット外クリックで全部閉じる（拡張ウィンドウの透明部分）
  document.addEventListener('mousedown', e => {
    const t = e.target as HTMLElement;
    if (!t.closest('#fabs') && !t.closest('#menu') && !t.closest('#popup')) closeAll();
  });
}
