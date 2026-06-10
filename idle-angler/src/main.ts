import './styles.css';
import { BASE_CAST } from './data';
import { R, S, doCatch, loadGame, saveGame, stats, tickWeather } from './game';
import { Market, refreshMarket } from './market';
import { draw, initRender } from './render';
import { $, bindUI, currentPop, log, renderAll, renderHud, renderPane, toast } from './ui';
import { initWindow } from './winctl';

/* ───────────────────────── メインループ ─────────────────────────
   ロジックは setInterval 駆動（ウィンドウが背面でも進行する）。
   rAF は描画専用。長い停止（スリープ等）はキャッチアップで一括消化。 */
let lastL = performance.now(), hudTm = 0, mktTm = 0;

function logicTick(): void {
  const now = performance.now();
  const dt = (now - lastL) / 1000;
  lastL = now;
  if (dt <= 0) return;
  if (dt > 5) { // 停止からの復帰: まとめて消化
    const st = stats(), dur = BASE_CAST / st.spd;
    const n = Math.min(400, Math.floor(dt * R.speed / dur));
    for (let i = 0; i < n; i++) doCatch(true);
    S.gt += dt * R.speed;
    if (n > 2) toast(`💤 留守中に ${n} 匹釣り上げた！`);
    renderAll();
    return;
  }
  const gdt = dt * R.speed;
  S.gt += gdt;
  tickWeather();
  S.buffs = S.buffs.filter(b => b.until > S.gt);
  Market.tick(S.gt);
  R.castT += gdt;
  const dur = BASE_CAST / stats().spd;
  if (R.castT >= dur) { R.castT = 0; doCatch(false); }
  hudTm += dt;
  if (hudTm > 0.5) { hudTm = 0; renderHud(); }
  mktTm += dt;
  if (mktTm > 1 && currentPop() === 'mkt') {  // 相場のライブ感
    mktTm = 0;
    void refreshMarket().then(renderPane);
  }
}

function frame(now: number): void {
  draw(now / 1000);
  requestAnimationFrame(frame);
}

/* ───────────────────────── 起動 ───────────────────────── */
async function boot(): Promise<void> {
  initRender($('cv') as HTMLCanvasElement);
  bindUI();
  await loadGame();          // セーブ復元＋オフライン進行
  await refreshMarket();
  await initWindow();        // 右下スナップ→表示
  renderAll();
  log('🎣 釣りを開始。魚は「餌・捌く・飾る・放流」の4つの使い道がある');
  setInterval(logicTick, 200);
  requestAnimationFrame(frame);
  setInterval(() => { void saveGame(); }, 10000);
  window.addEventListener('beforeunload', () => { void saveGame(); });
}
void boot();

// デバッグ・動作検証用（コンソールから状態を触れるように）
(window as unknown as Record<string, unknown>).IA = { S, R, stats };
