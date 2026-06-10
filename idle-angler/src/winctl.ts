/* ウィンドウ制御 — 透過ボーダレス常駐の要
   ・通常時: 情景のみの小窓 424×200
   ・メニュー/ポップアップ表示時: 600px に一時拡張（下端ドック時は上方向へ伸ばす）
   ・📌/設定からワークエリア四隅＋中央へスナップ
   ・大海モード(S.ocean): 下隅にマージン0でぴったり吸着し、水面が画面端まで続いて見える
   Tauri 外（vite単体プレビュー）では CSS フォールバックで擬似ドック。 */
import { LogicalPosition, LogicalSize, currentMonitor, getCurrentWindow, primaryMonitor } from '@tauri-apps/api/window';
import { S } from './game';

export const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

const WW = 424, HB = 200, HX = 600;
const DOCK_KEYS = ['br', 'bl', 'tl', 'tr', 'c'] as const;

let corner = 0;          // 0:br 1:bl 2:tl 3:tr 4:中央
let expanded = false;

export function getCorner(): number { return corner; }
const topAnchored = () => corner === 2 || corner === 3;

function applyDomDock(): void {
  document.body.classList.toggle('dock-top', topAnchored());
  document.body.classList.toggle('ocean', S.ocean);
  if (!isTauri) document.body.dataset.dock = DOCK_KEYS[corner];
}

export async function setCorner(i: number): Promise<void> {
  corner = i;
  applyDomDock();
  if (!isTauri) return;
  const win = getCurrentWindow();
  const mon = (await currentMonitor()) ?? (await primaryMonitor());
  if (!mon) return;
  const sf = mon.scaleFactor;
  type Area = { position: { x: number; y: number }; size: { width: number; height: number } };
  const wa: Area = (mon as unknown as { workArea?: Area }).workArea
    ?? { position: { x: mon.position.x, y: mon.position.y }, size: { width: mon.size.width, height: mon.size.height } };
  const wx = wa.position.x / sf, wy = wa.position.y / sf;
  const ww = wa.size.width / sf, wh = wa.size.height / sf;
  const M = S.ocean && corner <= 3 ? 0 : 10;   // 大海モードは四隅にぴったり
  const h = expanded ? HX : HB;
  const x = corner === 1 || corner === 2 ? wx + M : corner === 4 ? wx + (ww - WW) / 2 : wx + ww - WW - M;
  const y = topAnchored() ? wy + M : corner === 4 ? wy + (wh - h) / 2 : wy + wh - h - M;
  await win.setSize(new LogicalSize(WW, h));
  await win.setPosition(new LogicalPosition(Math.round(x), Math.round(y)));
}

export async function cycleCorner(): Promise<void> {
  await setCorner((corner + 1) % DOCK_KEYS.length);
}

/** 大海モードの切替（四隅=画面端まで断ち落ち / 中央=パノラマ帯） */
export async function setOcean(on: boolean): Promise<void> {
  S.ocean = on;
  await setCorner(corner);
}

/** ポップアップ表示に合わせてウィンドウを拡張/縮小する。
    手動ドラッグ後でも崩れないよう、現在位置からの相対計算で行う。 */
export async function setExpanded(x: boolean): Promise<void> {
  if (expanded === x) return;
  expanded = x;
  if (!isTauri) return;
  const win = getCurrentWindow();
  const dh = HX - HB;
  if (topAnchored()) {
    await win.setSize(new LogicalSize(WW, x ? HX : HB));
    return;
  }
  const sf = await win.scaleFactor();
  const pos = (await win.outerPosition()).toLogical(sf);
  if (x) {
    await win.setPosition(new LogicalPosition(pos.x, pos.y - dh));
    await win.setSize(new LogicalSize(WW, HX));
  } else {
    await win.setSize(new LogicalSize(WW, HB));
    await win.setPosition(new LogicalPosition(pos.x, pos.y + dh));
  }
}

export async function initWindow(): Promise<void> {
  applyDomDock();
  if (!isTauri) return;
  await setCorner(0);                    // 右下からスタート
  const win = getCurrentWindow();
  await win.unminimize();                // まれに最小化状態で起動するのを防ぐ
  await win.show();                      // 配置完了後に表示（チラつき防止）
  await setCorner(corner);               // 表示後にもう一度スナップ（モニタ判定の安定化）
}
