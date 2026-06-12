// デモ動画の自動収録: vite preview を立ち上げ、システムChromeで一連の操作を実演して webm に保存する
// 使い方: node scripts/record-demo.mjs
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import { mkdirSync, readdirSync, renameSync } from 'node:fs';
import path from 'node:path';

const PORT = 4188;
const CHROME = 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe';
const OUT_DIR = path.resolve('demo-video');
mkdirSync(OUT_DIR, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- vite preview 起動 ----
const server = spawn(process.execPath, ['./node_modules/vite/bin/vite.js', 'preview', '--port', String(PORT), '--strictPort'], {
  cwd: process.cwd(), stdio: 'pipe',
});
await new Promise((res, rej) => {
  server.stdout.on('data', (d) => { if (String(d).includes('http')) res(); });
  server.on('exit', () => rej(new Error('vite preview died')));
  setTimeout(res, 4000);
});

try {
  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  const ctx = await browser.newContext({
    viewport: { width: 1100, height: 720 },
    recordVideo: { dir: OUT_DIR, size: { width: 1100, height: 720 } },
  });
  const page = await ctx.newPage();
  // DOM直叩きクリック（playwrightのビューポート判定を迂回。動画にカーソルは映らないので見た目は同じ）
  const click = (sel, nth = 0) => page.evaluate(({ s, n }) => {
    const el = document.querySelectorAll(s)[n];
    if (el) el.click();
    return !!el;
  }, { s: sel, n: nth });

  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' });
  await sleep(2500);

  // デスクトップ風のダーク背景（動画見栄え用）
  await page.evaluate(() => {
    document.body.style.background = '#0d1117';
    document.body.style.backgroundImage =
      'linear-gradient(rgba(127,142,170,.05) 1px,transparent 1px),linear-gradient(90deg,rgba(127,142,170,.05) 1px,transparent 1px)';
    document.body.style.backgroundSize = '48px 48px';
  });

  // ---- デモ用の状態を注入 ----
  await page.evaluate(() => {
    const g = window.IA.game, S = window.IA.S, R = window.IA.R;
    S.gold = 4200;
    S.mats.scale = 40; S.mats.iri = 12; S.mats.pearl = 4;
    S.skills.speed = 6; S.skills.lucky = 4; S.skills.big = 60; // big高め=ヌシ勝率UP(演出用)
    S.skills.autob = 2;
    for (let i = 0; i < 9; i++) S.eqInv.push(g.buildEquip(0));   // 合成用のコモン9個
    S.eqInv.push(g.buildEquip(3));                               // 強化見せ用レジェンド
    S.equip.lure = g.buildEquip(2, 1);
    R.speed = 4;                                                 // テンポ良く
  });

  // 1) 放置釣りを眺める
  await sleep(5000);

  // 2) ヌシイベント（前兆をじっくり見せるため等速に・勝利を確実に）
  await page.evaluate(() => {
    window.__rndBak = Math.random;
    Math.random = () => 0.42;                  // 勝率0.9 > 0.42 → 確定勝利
    window.IA.R.speed = 1;
    window.IA.S.box.length = 0;
    window.IA.S.nushiAt = window.IA.S.gt - 1;
  });
  await sleep(12000);
  await page.evaluate(() => { Math.random = window.__rndBak; window.IA.R.speed = 4; });

  // 3) メニュー → スキル（∞パッシブ購入）
  const widget = await page.locator('#widget').boundingBox();
  await page.mouse.move(widget.x + 210, widget.y + 150);   // ホバーでFAB表示
  await sleep(900);
  await click('#fabMenu');
  await sleep(900);
  await click('#menu button[data-pop="skill"]');
  await sleep(1800);
  await click('#popBody button[data-act="skill"][data-id="speed"]');
  await sleep(900);
  await click('#popBody button[data-act="skill"][data-id="lucky"]');
  await sleep(1600);

  // 4) 装備 → 強化 → 合成
  await click('#fabMenu');
  await sleep(700);
  await click('#menu button[data-pop="eq"]');
  await sleep(1500);
  await click('#popBody .erow');                       // 最上位（レジェンド）を選択
  await sleep(1300);
  await click('#popBody button[data-act="enh"]');      // ⚒ 強化
  await sleep(1500);
  await click('#fabMenu'); await sleep(500);
  await click('#menu button[data-pop="eq"]');          // 再オープン → デフォルト=合成パネル
  await sleep(1300);
  await click('#popBody button[data-act="fuse"][data-r="0"]');   // ⚗ 合成
  await sleep(1700);

  // 5) 市場をチラ見
  await click('#fabMenu'); await sleep(600);
  await click('#menu button[data-pop="mkt"]');
  await sleep(2400);

  // 6) 大海モード（コーナーフィット）
  await click('#fabMenu'); await sleep(600);
  await click('#menu button[data-pop="set"]');
  await sleep(1000);
  await click('#popBody button[data-act="ocean"][data-v="1"]');
  await sleep(800);
  await click('#popClose');
  await page.mouse.move(20, 20);
  await sleep(4500);

  // 7) パノラマ（中央配置）→ 眺めて終わり
  await page.mouse.move(widget.x + 210, widget.y + 150);
  await sleep(700);
  await click('#fabMenu'); await sleep(500);
  await click('#menu button[data-pop="set"]');
  await sleep(800);
  await click('#popBody button[data-act="dock"][data-i="4"]');
  await sleep(600);
  await click('#popClose');
  await page.mouse.move(550, 80);
  await sleep(4500);

  await ctx.close();   // ここで動画が書き出される
  await browser.close();

  // 出力ファイルをリネーム
  const v = readdirSync(OUT_DIR).find((f) => f.endsWith('.webm'));
  if (v) {
    renameSync(path.join(OUT_DIR, v), path.join(OUT_DIR, 'idle_angler_demo.webm'));
    console.log('saved:', path.join(OUT_DIR, 'idle_angler_demo.webm'));
  } else {
    console.error('no video produced');
  }
} finally {
  server.kill();
}
