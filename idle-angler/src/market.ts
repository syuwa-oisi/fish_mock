/* ──────────────────────────────────────────────────────────────
   マーケット層 — ローカル需給シミュレーション
   ★RMT外付けポイント★
   本デモでは需要が確率的にドリフトし、プレイヤーの売買で価格が
   動くローカルシミュレーション。将来 Steam Market / 外部RMT基盤に
   接続する場合は、createSteamMarketAdapter() を実装して main.ts の
   注入箇所を差し替えるだけで、ゲーム本体のコードは変更不要。
   ────────────────────────────────────────────────────────────── */
import type { Equip, Fish, Listing, MarketAPI, Quotes } from './types';
import { BAIT, SPECIES } from './data';
import { S, clamp, getBoxCap, mkEquip } from './game';

const rnd = Math.random;

export interface LocalMarket extends MarketAPI {
  /** ローカルシミュ専用: ゲーム内時間で需給をドリフトさせる */
  tick(gt: number): void;
}

export function createLocalMarketSim(): LocalMarket {
  const q: Quotes = { bait: 1, equip: 1, fish: 1 };          // 需要係数 0.6〜1.8
  const prev: Quotes = { bait: 1, equip: 1, fish: 1 };
  let listings: Listing[] = [];
  let lastDrift = 0, lastGen = -999;

  function bump(k: keyof Quotes, d: number) { q[k] = clamp(q[k] + d, 0.6, 1.8); }

  function genListings() {
    listings = [];
    const n = 5 + Math.floor(rnd() * 3);
    for (let i = 0; i < n; i++) {
      const r = rnd();
      if (r < .4) {        // 餌
        const t = 1 + Math.floor(rnd() * 3), qty = 5;
        listings.push({ kind: 'bait', t, qty, price: Math.round(BAIT[t].price * qty * q.bait * (0.9 + rnd() * 0.3)) });
      } else if (r < .75) { // 装備
        const it = mkEquip(rnd() < .25 ? 2 : 1);
        listings.push({ kind: 'equip', it, price: Math.round(it.bv * q.equip * (0.9 + rnd() * 0.3)) });
      } else {              // 観賞魚（E/L）
        const pool = SPECIES.filter(x => x.r >= 2 && x.id !== 'abyss');
        const sp = pool[Math.floor(rnd() * pool.length)];
        const sz = Math.round((0.8 + rnd() * 0.6) * 100) / 100;
        listings.push({ kind: 'fish', sp: SPECIES.indexOf(sp), sz, price: Math.round(sp.v * sz * q.fish * (1.1 + rnd() * 0.4)) });
      }
    }
  }

  return {
    tick(gt: number) {
      if (gt - lastDrift >= 8) {
        lastDrift = gt;
        for (const k of Object.keys(q) as (keyof Quotes)[]) {
          prev[k] = q[k];
          q[k] = clamp(q[k] * (1 + (rnd() - .5) * .08), 0.6, 1.8);
        }
      }
      if (gt - lastGen >= 60) { lastGen = gt; genListings(); }
    },
    async getQuotes() { return { q: { ...q }, prev: { ...prev } }; },
    async getListings() { return listings.slice(); },
    async buy(i: number) {
      const L = listings[i];
      if (!L || S.gold < L.price) return false;
      if (L.kind === 'fish' && S.box.length >= getBoxCap()) return false;
      S.gold -= L.price; listings.splice(i, 1);
      if (L.kind === 'bait') { S.bait[L.t] += L.qty; bump('bait', +.06); }
      else if (L.kind === 'equip') { S.eqInv.push(L.it); bump('equip', +.06); }
      else { S.box.push({ sp: L.sp, sz: L.sz }); bump('fish', +.06); }
      return true;
    },
    async sellBait(t: number) {
      const n = Math.min(5, S.bait[t]); if (n <= 0) return 0;
      const g = Math.floor(BAIT[t].price * n * q.bait * 0.9);
      S.bait[t] -= n; S.gold += g; bump('bait', -.05);
      return g;
    },
    async sellEquip(e: Equip) {
      const g = Math.floor(e.bv * q.equip * 0.9);
      S.gold += g; bump('equip', -.05);
      return g;
    },
    async sellFish(f: Fish) {
      const sp = SPECIES[f.sp];
      const g = Math.floor(sp.v * f.sz * q.fish * 0.9 * (f.nu ? 2 : 1));
      S.gold += g; bump('fish', -.05);
      return g;
    },
  };
}

/* Steam Market / 外部RMT接続用アダプタ（スタブ）
   実装したら main.ts の Market 注入をこちらに切り替える。 */
export function createSteamMarketAdapter(): MarketAPI {
  const todo = () => Promise.reject(new Error('TODO: Steamworks / 外部RMT基盤との連携を実装'));
  return {
    getQuotes: todo, getListings: todo, buy: todo,
    sellBait: todo, sellEquip: todo, sellFish: todo,
  };
}

/* ── 注入されたアダプタと、UI描画用の相場キャッシュ ── */
export const Market: LocalMarket = createLocalMarketSim();

export const mktCache: { q: Quotes; prev: Quotes; listings: Listing[] } = {
  q: { bait: 1, equip: 1, fish: 1 },
  prev: { bait: 1, equip: 1, fish: 1 },
  listings: [],
};
export async function refreshMarket(): Promise<void> {
  const { q, prev } = await Market.getQuotes();
  mktCache.q = q; mktCache.prev = prev;
  mktCache.listings = await Market.getListings();
}
