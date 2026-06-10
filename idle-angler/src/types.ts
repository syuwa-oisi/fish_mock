export interface Species {
  id: string;
  n: string;
  s: number;            // 釣り場index
  r: number;            // レアリティ 0..3
  v: number;            // 基礎値
  bq?: number;          // 必要餌Tier（0=練り餌可）
  cond?: 'rain' | 'night';
}

export interface Fish { sp: number; sz: number }   // sp=SPECIES index

export type EquipKind = 'reel' | 'lure' | 'charm';

export interface Equip {
  id: string;
  k: EquipKind;
  r: number;
  name: string;
  icon: string;
  txt: string;
  bv: number;           // 市場の基準価格
  spd?: number;
  rare?: number;
  size?: number;
  sell?: number;
}

export interface Buff { spd: number; rare: number; until: number; txt: string }

export interface Stats { spd: number; rare: number; size: number; sell: number }

export interface DexEntry { c: number; mx: number }

export interface GameState {
  gold: number;
  spot: number;
  rodLv: number;
  baitSel: number;
  bait: Record<number, number>;
  autoB: boolean;
  box: Fish[];
  equip: Record<EquipKind, Equip | null>;
  eqInv: Equip[];
  aqua: (Fish | null)[];
  aquaMax: number;
  dex: Record<string, DexEntry>;
  buffs: Buff[];
  unlocked: boolean[];
  skills: Record<string, number>;   // スキルID → Lv
  ocean: boolean;                   // コーナーフィット大海モード
  catches: number;
  gt: number;           // ゲーム内経過秒
  ts: number;           // 最終セーブ実時刻（オフライン進行用）
}

export interface Skill {
  id: string;
  n: string;
  icon: string;
  max: number;
  base: number;     // Lv1の費用
  mult: number;     // レベル毎の費用倍率
  fx: string;       // 効果説明
}

export type Listing =
  | { kind: 'bait'; t: number; qty: number; price: number }
  | { kind: 'equip'; it: Equip; price: number }
  | { kind: 'fish'; sp: number; sz: number; price: number };

export interface Quotes { bait: number; equip: number; fish: number }

/* ──────────────────────────────────────────────────────────────
   ★RMT外付けポイント★
   ゲーム本体・UIはこの MarketAPI 経由でのみ市場に触れる。
   本デモは createLocalMarketSim()（ローカル需給シミュ）を注入する。
   Steam Market / 外部RMT基盤に接続する場合は、同じ形のアダプタ
   （market.ts の createSteamMarketAdapter スタブ参照）に差し替える。
   ────────────────────────────────────────────────────────────── */
export interface MarketAPI {
  getQuotes(): Promise<{ q: Quotes; prev: Quotes }>;
  getListings(): Promise<Listing[]>;
  buy(i: number): Promise<boolean>;
  sellBait(t: number): Promise<number>;
  sellEquip(e: Equip): Promise<number>;
  sellFish(f: Fish): Promise<number>;
}

export type PopKind = 'box' | 'eq' | 'skill' | 'aq' | 'mkt' | 'set';

export interface CatchAnim { p: number; r: number; sz: number }
