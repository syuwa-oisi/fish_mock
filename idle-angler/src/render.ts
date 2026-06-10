/* Canvas描画 — 常駐ビジュアルは「水面＋桟橋＋釣り人」のみ（背景透過）
   通常モード      : 角丸の水面ブロブが浮かぶウィジェット風
   大海モード(S.ocean):
     下隅(br/bl)   : 水面が画面の下端・側端まで断ち落ち
     上隅(tl/tr)   : 空＋海のジオラマカードが天面・側端まで断ち落ち（雲・太陽/月・星つき）
     中央/自由(◎)  : 左右両端がフェードするパノラマ帯 — 海が左右へ無限に続いて見える
   いずれも霞・遠波・帆船・海鳥で「画面の向こうに海が続いている」見せ方をする。
   右側の隅(br/tr)では左右反転し、海の彼方が画面外側を向く。 */
import { BASE_CAST, PHASES, RAR, SPOTS, WX_ICON } from './data';
import { R, S, Wx, clamp, phaseIdx, stats } from './game';
import { getCorner } from './winctl';

const rnd = Math.random;
const CW = 424, CH = 200;

let ctx: CanvasRenderingContext2D;
const rainDrops = Array.from({ length: 46 }, () => ({ x: rnd() * CW, y: rnd() * CH }));
const bubbles = Array.from({ length: 8 }, (_, i) => ({ x: 30 + i * 24, y: rnd() * 90 }));
// 空のグラデーション（朝/昼/夕/夜）
const SKYC = [['#2a3f63', '#7fb0d8'], ['#3a6ea8', '#9fd2f0'], ['#5a3a63', '#f0a06a'], ['#0a1126', '#1d2c4f']];

export function initRender(canvas: HTMLCanvasElement): void {
  ctx = canvas.getContext('2d')!;
}

export function draw(t: number): void {
  ctx.clearRect(0, 0, CW, CH);
  const ph = phaseIdx();
  const corner = getCorner();
  const ocean = S.ocean;
  const mir = ocean && (corner === 0 || corner === 3);     // 右側の隅は左右反転
  const sky = ocean && (corner === 2 || corner === 3);     // 上隅: 空つきジオラマカード
  const pano = ocean && corner === 4;                      // 中央/自由: パノラマ帯
  const bottomO = ocean && corner <= 1;                    // 下隅: 断ち落ち

  // レイアウト（pre-mirror座標: 海の彼方=左、桟橋=右）
  const WY = ocean ? 104 : 110;
  const WB = sky || bottomO ? CH - WY : pano ? 80 : 72;
  const pierR = pano ? CW - 18 : ocean ? CW : CW - 8;
  const pierL = pierR - 112;
  const bx = pierL - 60;                        // ウキX
  const tipX = pierL - 8, tipY = WY - 56;       // 竿先

  ctx.save();
  if (mir) { ctx.translate(CW, 0); ctx.scale(-1, 1); }

  /* ── 水面（＋上隅モードでは空も含むカード） ── */
  ctx.save();
  ctx.beginPath();
  if (sky) ctx.roundRect(0, 0, CW, CH, [0, 26, 26, 0]);          // 天面・側端は断ち落ち、内側の角だけ丸める
  else if (bottomO) ctx.roundRect(0, WY, CW, WB, [0, 26, 0, 0]); // 画面端まで断ち落ち
  else if (pano) ctx.rect(0, WY, CW, WB);                        // 帯（両端は後でフェード）
  else ctx.roundRect(8, WY, CW - 16, WB, 24);                    // ウィジェット風ブロブ
  if (sky) {
    // 空
    const sg = ctx.createLinearGradient(0, 0, 0, WY + 4);
    sg.addColorStop(0, SKYC[ph][0]); sg.addColorStop(1, SKYC[ph][1]);
    ctx.fillStyle = sg; ctx.fill();
  } else {
    const wg0 = ctx.createLinearGradient(0, WY, 0, WY + WB);
    wg0.addColorStop(0, SPOTS[S.spot].water); wg0.addColorStop(1, '#060d18');
    ctx.fillStyle = wg0; ctx.fill();
  }
  ctx.clip();
  if (sky) {
    // 星（夜）・太陽/月・流れる雲
    if (ph === 3) {
      ctx.fillStyle = '#cfe0ff';
      for (let i = 0; i < 26; i++) { if ((t * 2 + i) % 3 < 2) ctx.fillRect((i * 53) % CW, (i * 37) % (WY - 24), 1.5, 1.5); }
      ctx.fillStyle = '#e8edf8'; ctx.beginPath(); ctx.arc(300, 34, 9, 0, 7); ctx.fill();
      ctx.fillStyle = SKYC[3][0]; ctx.beginPath(); ctx.arc(304, 31, 8, 0, 7); ctx.fill();
    } else {
      ctx.fillStyle = ph === 2 ? '#ffb36b' : '#ffe9a8';
      ctx.beginPath(); ctx.arc(80 + ph * 100, 36, 10, 0, 7); ctx.fill();
    }
    ctx.fillStyle = ph === 3 ? 'rgba(220,230,250,.07)' : 'rgba(255,255,255,.16)';
    for (let i = 0; i < 3; i++) {
      const cx = ((t * 4 + i * 150) % (CW + 120)) - 60, cy = 16 + i * 16;
      ctx.beginPath(); ctx.ellipse(cx, cy, 26, 8, 0, 0, 7); ctx.fill();
      ctx.beginPath(); ctx.ellipse(cx + 18, cy + 3, 18, 6, 0, 0, 7); ctx.fill();
      ctx.beginPath(); ctx.ellipse(cx - 16, cy + 4, 14, 5, 0, 0, 7); ctx.fill();
    }
    // 海（空の下）
    const wg = ctx.createLinearGradient(0, WY, 0, CH);
    wg.addColorStop(0, SPOTS[S.spot].water); wg.addColorStop(1, '#060d18');
    ctx.fillStyle = wg; ctx.fillRect(0, WY, CW, WB);
  }
  // 時間帯トーン（水面のみ）
  const TONE = ['rgba(255,230,180,.07)', 'rgba(255,255,255,.05)', 'rgba(255,150,80,.12)', 'rgba(8,12,36,.40)'];
  ctx.fillStyle = TONE[ph]; ctx.fillRect(0, WY, CW, WB);
  // 波
  ctx.strokeStyle = 'rgba(255,255,255,.10)'; ctx.lineWidth = 1;
  for (let k = 0; k < 3; k++) {
    ctx.beginPath();
    for (let x = 0; x <= CW; x += 8) {
      const y = WY + 12 + k * (ocean ? WB / 3.6 : 20) + Math.sin(x / 26 + t * 1.1 + k * 2) * 2.2;
      x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  if (ocean) {
    // 遠景の小波（彼方ほど細かく）
    ctx.strokeStyle = 'rgba(255,255,255,.07)';
    for (let k = 0; k < 2; k++) {
      ctx.beginPath();
      for (let x = 0; x <= 170; x += 6) {
        const y = WY + 7 + k * 6 + Math.sin(x / 12 + t * 1.6 + k) * 0.9;
        x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    // 水平線の光
    const hg = ctx.createLinearGradient(0, WY, 0, WY + 10);
    hg.addColorStop(0, 'rgba(190,225,255,.18)'); hg.addColorStop(1, 'rgba(190,225,255,0)');
    ctx.fillStyle = hg; ctx.fillRect(0, WY, 180, 10);
    // 帆船のシルエット（彼方を漂う）
    const sbx = 40 + Math.sin(t * 0.18) * 22, sby = WY + 13 + Math.sin(t * 0.8) * 1.2;
    ctx.fillStyle = 'rgba(20,32,56,.55)';
    ctx.beginPath(); ctx.moveTo(sbx - 9, sby); ctx.lineTo(sbx + 9, sby); ctx.lineTo(sbx + 5, sby + 4); ctx.lineTo(sbx - 5, sby + 4); ctx.fill();
    ctx.beginPath(); ctx.moveTo(sbx, sby - 1); ctx.lineTo(sbx, sby - 13); ctx.lineTo(sbx + 7, sby - 3); ctx.fill();
    // 彼方の霞（大気遠近）
    const fg = ctx.createLinearGradient(0, 0, 130, 0);
    fg.addColorStop(0, 'rgba(205,225,245,.16)'); fg.addColorStop(1, 'rgba(205,225,245,0)');
    ctx.fillStyle = fg; ctx.fillRect(0, WY, 130, WB);
  }
  // スポット小物
  if (S.spot === 0) {
    ctx.fillStyle = 'rgba(110,125,150,.5)';
    ctx.beginPath(); ctx.ellipse(ocean ? 150 : 46, WY + 10, 16, 7, 0, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.ellipse(ocean ? 180 : 78, WY + 13, 10, 5, 0, 0, 7); ctx.fill();
  } else if (S.spot === 1) {
    const by2 = WY + 10 + Math.sin(t * 1.6) * 2;
    const bxx = ocean ? 165 : 60;
    ctx.fillStyle = '#c94f3a'; ctx.beginPath(); ctx.arc(bxx, by2, 6, 0, 7); ctx.fill();
    ctx.fillStyle = '#e8edf8'; ctx.fillRect(bxx - 2, by2 - 11, 4, 6);
  } else {
    ctx.fillStyle = 'rgba(150,200,255,.35)';
    bubbles.forEach(b => {
      b.y -= 0.25; if (b.y < 4) b.y = WB - 6;
      ctx.beginPath(); ctx.arc(b.x + (ocean ? 130 : 0), WY + Math.min(b.y, WB - 4), 1.6, 0, 7); ctx.fill();
    });
  }
  // 月明かりの反射（夜）
  if (ph === 3) {
    ctx.fillStyle = 'rgba(200,220,255,.10)';
    for (let i = 0; i < 5; i++) ctx.fillRect(150 + Math.sin(t + i) * 8, WY + 8 + i * 12, 30 - i * 4, 2);
  }
  // 雨・霧（上隅モードでは空にも降る）
  if (Wx.weather === '雨') {
    ctx.strokeStyle = 'rgba(160,200,255,.45)'; ctx.lineWidth = 1;
    rainDrops.forEach(d => {
      d.y += 6; d.x -= 1.5; if (d.y > WY + WB) { d.y = sky ? -8 : WY - 10; d.x = rnd() * CW + 30; }
      if (d.y > (sky ? -8 : WY - 8)) { ctx.beginPath(); ctx.moveTo(d.x, d.y); ctx.lineTo(d.x - 2, d.y + 7); ctx.stroke(); }
    });
  } else if (Wx.weather === '霧') {
    ctx.fillStyle = 'rgba(210,225,240,.13)';
    ctx.fillRect(0, WY + 6 + Math.sin(t * .4) * 4, CW, 18);
    ctx.fillRect(0, WY + 34 + Math.cos(t * .3) * 4, CW, 14);
  }
  ctx.restore();   // カード/水域クリップ解除

  // パノラマ帯: 左右両端をフェードして「続いている」見せ方
  if (pano) {
    ctx.save();
    ctx.globalCompositeOperation = 'destination-out';
    let g = ctx.createLinearGradient(0, 0, 46, 0);
    g.addColorStop(0, 'rgba(0,0,0,.96)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.fillRect(0, WY - 2, 46, WB + 6);
    g = ctx.createLinearGradient(CW, 0, CW - 30, 0);
    g.addColorStop(0, 'rgba(0,0,0,.96)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.fillRect(CW - 30, WY - 2, 30, WB + 6);
    ctx.restore();
  }

  // 海鳥（大海モード・水面の上空を彼方へ）
  if (ocean && ph !== 3) {
    ctx.strokeStyle = sky ? 'rgba(30,45,70,.7)' : 'rgba(40,60,90,.6)'; ctx.lineWidth = 1.4;
    for (let i = 0; i < 3; i++) {
      const bxx = 150 - ((t * 7 + i * 55) % 190);
      const byy = WY - 26 - i * 13 + Math.sin(t * 2 + i) * 2;
      if (bxx < -10) continue;
      ctx.beginPath(); ctx.arc(bxx - 3, byy, 3, Math.PI * 1.15, Math.PI * 1.85);
      ctx.arc(bxx + 3, byy, 3, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke();
    }
  }

  /* ── 桟橋と釣り人 ── */
  ctx.fillStyle = '#5a4632'; ctx.fillRect(pierL - 8, WY - 9, pierR - pierL + 8, 9);
  ctx.fillStyle = '#3e3022';
  for (let x = pierL - 4; x < pierR; x += 18) ctx.fillRect(x, WY - 9, 2, 9);
  ctx.fillRect(pierL + 12, WY, 6, 30); ctx.fillRect(pierL + 74, WY, 6, 30);
  const bob = Math.sin(t * 1.4) * 1.2;
  ctx.fillStyle = '#27405e'; ctx.fillRect(pierL + 50, WY - 30 + bob, 14, 18);
  ctx.fillStyle = '#f1c27d'; ctx.beginPath(); ctx.arc(pierL + 57, WY - 36 + bob, 6, 0, 7); ctx.fill();
  ctx.fillStyle = '#c9543a'; ctx.beginPath(); ctx.arc(pierL + 57, WY - 39 + bob, 7, Math.PI, 0); ctx.fill();
  ctx.fillRect(pierL + 48, WY - 39 + bob, 18, 2);
  ctx.fillStyle = '#27405e'; ctx.fillRect(pierL + 48, WY - 13 + bob, 18, 5);
  // 夜はランタン
  if (ph === 3) {
    const lx = pierL + 76;
    const lg = ctx.createRadialGradient(lx, WY - 16, 2, lx, WY - 16, 26);
    lg.addColorStop(0, 'rgba(255,190,90,.5)'); lg.addColorStop(1, 'rgba(255,190,90,0)');
    ctx.fillStyle = lg; ctx.beginPath(); ctx.arc(lx, WY - 16, 26, 0, 7); ctx.fill();
    ctx.fillStyle = '#ffb74a'; ctx.fillRect(lx - 2, WY - 19, 5, 7);
  }
  // 竿と糸
  ctx.strokeStyle = '#caa468'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(pierL + 52, WY - 26 + bob); ctx.lineTo(tipX, tipY + bob); ctx.stroke();
  const st = stats();
  const dur = BASE_CAST / st.spd;
  const progC = clamp(R.castT / dur, 0, 1);
  const near = progC > 0.86;
  const by = WY + 8 + Math.sin(t * 3) * 1.5 + (near ? Math.sin(t * 26) * 2.4 : 0);
  ctx.strokeStyle = 'rgba(220,230,245,.5)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(tipX, tipY + bob); ctx.lineTo(bx, by - 3); ctx.stroke();
  // ウキ
  ctx.fillStyle = '#ff5d3b'; ctx.beginPath(); ctx.arc(bx, by - 2, 3, Math.PI, 0); ctx.fill();
  ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(bx, by + 1, 3, 0, Math.PI); ctx.fill();
  if (near) {
    const rr = (t * 30 % 14);
    ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.beginPath(); ctx.arc(bx, by, 4 + rr, 0, 7); ctx.stroke();
  }
  // 釣り上げアニメ＋レア閃光
  if (R.anim) {
    R.anim.p += 0.022 * R.speed;
    const p = R.anim.p;
    if (p >= 1) R.anim = null;
    else {
      if (R.anim.r >= 2 && p < 0.35) {   // エピック以上は閃光
        const fl = ctx.createRadialGradient(bx, by, 4, bx, by, 90);
        const a = (0.35 - p) * 1.4;
        fl.addColorStop(0, `rgba(255,225,140,${a})`); fl.addColorStop(1, 'rgba(255,225,140,0)');
        ctx.fillStyle = fl; ctx.beginPath(); ctx.arc(bx, by, 90, 0, 7); ctx.fill();
      }
      const ax = bx + (pierL + 54 - bx) * p, ay = (by - 2) - Math.sin(p * Math.PI) * 52;
      const c = RAR[R.anim.r].col, w = 11 * R.anim.sz;
      ctx.save(); ctx.translate(ax, ay); ctx.rotate(-0.5 + p);
      ctx.fillStyle = c;
      ctx.beginPath(); ctx.ellipse(0, 0, w, w * 0.42, 0, 0, 7); ctx.fill();
      ctx.beginPath(); ctx.moveTo(w, 0); ctx.lineTo(w + 6, -4); ctx.lineTo(w + 6, 4); ctx.fill();
      ctx.restore();
      if (R.anim.r >= 2) {
        ctx.fillStyle = 'rgba(255,215,106,.9)';
        for (let i = 0; i < 4; i++) ctx.fillRect(ax - 14 + rnd() * 28, ay - 12 + rnd() * 24, 2, 2);
      }
      if (p < 0.25) {
        ctx.strokeStyle = 'rgba(255,255,255,.5)';
        ctx.beginPath(); ctx.arc(bx, by, p * 40, 0, 7); ctx.stroke();
      }
    }
  }
  // フィーバー
  if (S.buffs.some(b => b.spd >= .5)) {
    ctx.fillStyle = 'rgba(255,215,106,.8)';
    for (let i = 0; i < 5; i++) ctx.fillRect(rnd() * CW, WY - 60 + rnd() * (WB + 60), 2, 2);
  }

  ctx.restore();   // ミラー解除

  /* ── テキスト・キャスト進行バー（画面座標・反転しない） ── */
  ctx.fillStyle = 'rgba(226,236,249,.55)'; ctx.font = '10px "DotGothic16"';
  ctx.textAlign = 'left';
  ctx.fillText(`${SPOTS[S.spot].n} ${WX_ICON[Wx.weather]}${PHASES[ph].i}`, 20, WY + 18);
  ctx.fillText(`💰${Math.floor(S.gold)} 🐟${S.catches}`, 20, WY + WB - 10);
  // キャスト進行バー（水面下端で光る）
  const pbY = sky || bottomO ? CH - 3 : WY + WB - 4;
  const pbX0 = ocean ? 0 : 10, pbX1 = ocean ? CW : CW - 10;
  ctx.save();
  ctx.strokeStyle = 'rgba(63,182,255,.18)'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(pbX0, pbY); ctx.lineTo(pbX1, pbY); ctx.stroke();
  ctx.strokeStyle = near ? '#ffd76a' : '#3fb6ff';
  ctx.shadowColor = near ? '#ffd76a' : '#3fb6ff'; ctx.shadowBlur = 6;
  ctx.beginPath(); ctx.moveTo(pbX0, pbY); ctx.lineTo(pbX0 + (pbX1 - pbX0) * progC, pbY); ctx.stroke();
  ctx.restore();
  // 残り時間（ウキの近く・反転時は位置を画面座標に変換）
  const sbx2 = mir ? CW - bx : bx;
  ctx.fillStyle = 'rgba(226,236,249,.45)'; ctx.font = '9px "DotGothic16"';
  ctx.textAlign = 'center';
  ctx.fillText(`${Math.max(0, (dur - R.castT)).toFixed(1)}s`, sbx2, by + 16);
}
