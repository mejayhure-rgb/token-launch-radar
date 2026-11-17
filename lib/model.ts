// Token Launch Radar, model v2 (peer-anchored).
//
// What this model does differently from a flat TVL multiple:
//
// 1. It prices a pre-token protocol against its own kind. Every category in the
//    snapshot has live-token members whose market cap and TVL are both recorded,
//    so each category gets the multiple its traded peers actually carry: the
//    median market-cap / TVL of the category's live protocols, shrunk toward
//    the global median in log space (ratios shrink geometrically, so a single
//    rich peer cannot set a wild price), and clamped so no category is priced
//    as worthless or as a mania.
//
// 2. It only ranks protocols that could plausibly launch a token of their own.
//    The ranked board is the house watchlist (every slug, always) plus early
//    protocols below the watchlist floor that pass the same launchability rule
//    the watchlist itself was built with: no token recorded, and not a wrapped,
//    staked or bridged product of one that trades, not an exchange, not a
//    versioned pool of another protocol. The biggest names that fail the rule
//    are kept aside as a watch-only list with the reason, so a reader can see
//    what the radar refuses to rank and why.
//
// 3. The adjustments after the peer price are the snapshot's own figures: the
//    seven-day TVL change (momentum), the days since DefiLlama first tracked
//    the protocol (maturity), and how many chains it runs on (breadth).
//
// No protocol name is special-cased anywhere below. The same functions score
// every row, and the dashboard states the constants the model runs with.

/** The snapshot's protocol entry: exactly the ten fields the sealed input carries. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The model's constants, stated on the dashboard and changeable in one place. */
export interface ModelConstants {
  shrink_prior: number;
  multiple_floor: number;
  multiple_cap: number;
  growth_weight: number;
  growth_floor_pct: number;
  growth_cap_pct: number;
  growth_min_mult: number;
  maturity_floor: number;
  maturity_range: number;
  maturity_days: number;
  unknown_age_days: number;
  breadth_per_chain: number;
  breadth_max_chains: number;
}

export const MODEL: ModelConstants = {
  shrink_prior: 4,
  multiple_floor: 0.03,
  multiple_cap: 1.5,
  growth_weight: 0.6,
  growth_floor_pct: -40,
  growth_cap_pct: 60,
  growth_min_mult: 0.55,
  maturity_floor: 0.65,
  maturity_range: 0.35,
  maturity_days: 1095,
  unknown_age_days: 300,
  breadth_per_chain: 0.015,
  breadth_max_chains: 10,
};

/** The model's version label: the dashboard names it and the board carries it. */
export const MODEL_VERSION = 'radar-2-peer';

/** How many early (below the floor) protocols the board carries at most. */
export const EARLY_ROWS = 180;

/** How many live-token protocols the comparison view carries, by market cap. */
export const LIVE_ROWS = 24;

/** How many watch-only (not launchable) names the dashboard names, by TVL. */
export const WATCH_ONLY_ROWS = 12;

/** One row of board.json. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  tier: 'watchlist' | 'early';
  age_days: number | null;
  implied_value_usd: number;
  model: {
    peer_multiple: number;
    peer_count: number;
    growth_pct: number;
    growth_multiplier: number;
    maturity_multiplier: number;
    breadth_multiplier: number;
    age_days: number | null;
  };
  farm_steps: string[];
}

/** The dashboard's view of one board row: everything the page renders. */
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  listed_at: string | null;
  age_days: number | null;
  tier: 'watchlist' | 'early';
  implied_value_usd: number;
  peer_multiple: number;
  peer_count: number;
  growth_multiplier: number;
  maturity_multiplier: number;
  breadth_multiplier: number;
  farm_steps: string[];
}

/** A live-token protocol: it already trades, so the page shows the market's value. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
}

/** A big pre-token name the radar will not rank, with the rule that kept it off. */
export interface WatchOnlyRow {
  slug: string;
  name: string;
  category: string | null;
  tvl_usd: number;
  reason: string;
}

/** One category's peer statistics, as the method view states them. */
export interface CategoryStat {
  category: string;
  live_count: number;
  median_multiple: number;
  used_multiple: number;
}

/** Everything the dashboard needs. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  global_multiple: number;
  scanned: number;
  pre_token: number;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  rows: RadarRow[];
  live: LiveRow[];
  watch_only: WatchOnlyRow[];
  categories: CategoryStat[];
}

/** Why a snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;

function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

/** Whole days from `listedAt` to `asOf`, clamped at zero; null when unknown. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** The median of a non-empty list of numbers. */
function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** Categories that are products of a token that already trades, per the watchlist rule. */
const WRAPPED_CATEGORIES = new Set(['Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC', 'CEX']);

/** Exchange names a protocol may not begin with, per the watchlist rule. */
const EXCHANGE_PREFIXES = ['Binance', 'Coinbase', 'Bybit', 'Kraken', 'Bitget', 'OKX', 'Bitfinex', 'Gemini'];

/** A name ending in a version marker is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** A name carrying the whole word wrapped, staked or staking is a product of another token. */
const WRAPPED_WORD = /\b(wrapped|staked|staking)\b/i;

/**
 * Why a pre-token protocol is not launchable, or null when it is: the same rule
 * the snapshot's watchlist was built with, applied to any protocol.
 */
export function launchBlocker(p: SnapshotProtocol): string | null {
  if (p.category !== null && WRAPPED_CATEGORIES.has(p.category)) {
    return p.category === 'CEX'
      ? 'An exchange balance sheet, not a protocol that issues its own token.'
      : `A ${p.category.toLowerCase()} product of a token that already trades.`;
  }
  if (WRAPPED_WORD.test(p.name)) return 'Its name marks it as a wrapped or staked product of another token.';
  if (VERSIONED.test(p.name)) return 'A versioned pool of another protocol, not a protocol of its own.';
  for (const prefix of EXCHANGE_PREFIXES) {
    if (p.name === prefix || p.name.startsWith(`${prefix} `)) return 'It begins with an exchange\u2019s name: an exchange product, not a launch candidate.';
  }
  return null;
}

/** Whether the board may rank this protocol: pre-token and launchable. */
export function isRankable(p: SnapshotProtocol): boolean {
  return isPreToken(p) && launchBlocker(p) === null;
}

/** The peer multiples: one shrunk, clamped multiple per category, plus the global one. */
export function peerMultiples(snapshot: Snapshot, model: ModelConstants = MODEL): { global: number; byCategory: Map<string, { multiple: number; count: number; median: number }> } {
  const live = snapshot.protocols.filter((p) => p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0);
  const global = median(live.map((p) => p.mcap_usd! / p.tvl_usd));
  const groups = new Map<string, number[]>();
  for (const p of live) {
    const key = p.category ?? 'Uncategorized';
    const list = groups.get(key) ?? [];
    list.push(p.mcap_usd! / p.tvl_usd);
    groups.set(key, list);
  }
  const byCategory = new Map<string, { multiple: number; count: number; median: number }>();
  for (const [category, ratios] of groups) {
    const med = median(ratios);
    // Shrink in log space: multiples are ratios, so a single peer at 3x must not
    // outweigh the global median the way a plain average lets it. The category's
    // log-median is averaged with the global log-median, weighted by how many
    // live peers the category actually has against the prior's weight.
    const logShrunk =
      (ratios.length * Math.log(Math.max(med, 1e-6)) + model.shrink_prior * Math.log(Math.max(global, 1e-6))) /
      (ratios.length + model.shrink_prior);
    const shrunk = Math.exp(logShrunk);
    byCategory.set(category, {
      multiple: Math.min(model.multiple_cap, Math.max(model.multiple_floor, shrunk)),
      count: ratios.length,
      median: med,
    });
  }
  return { global, byCategory };
}

/** The parts of one protocol's implied value, and the value itself. */
export function impliedValue(
  p: SnapshotProtocol,
  asOf: string,
  peers: { multiple: number; count: number },
  model: ModelConstants = MODEL,
): { implied: number; growthPct: number; growthMult: number; maturityMult: number; breadthMult: number; age: number | null } {
  const age = ageDays(asOf, p.listed_at);
  const growthPct = Math.min(model.growth_cap_pct, Math.max(model.growth_floor_pct, finite(p.change_7d, 0)));
  const growthMult = Math.max(model.growth_min_mult, 1 + (growthPct / 100) * model.growth_weight);
  const ageForModel = age ?? model.unknown_age_days;
  const maturityMult = model.maturity_floor + (Math.min(Math.max(ageForModel, 0), model.maturity_days) / model.maturity_days) * model.maturity_range;
  const breadthMult = 1 + Math.min(Math.max(p.chains.length - 1, 0), model.breadth_max_chains) * model.breadth_per_chain;
  const implied = Math.max(1, Math.round(p.tvl_usd * peers.multiple * growthMult * maturityMult * breadthMult));
  return { implied, growthPct, growthMult, maturityMult, breadthMult, age };
}

/** How much capital one farm position needs, from the protocol's own TVL. */
function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 5_000_000_000) return 250;
  if (p.tvl_usd >= 1_000_000_000) return 150;
  if (p.tvl_usd >= 100_000_000) return 100;
  if (p.tvl_usd >= 10_000_000) return 50;
  return 25;
}

/** How long to hold, from the protocol's age: younger protocols get a longer window. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 45;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

/** The first chain a protocol names, or a neutral phrase. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** The category's core farming action, in words a reader can follow. */
function coreAction(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('risk curator') || c.includes('allocator') || c.includes('curator')) return `Deposit $${capital} of USDC into a ${name} curated vault on ${chain}; curators route it to lending markets and the vault share is the position a points program can see.`;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Supply $${capital} of USDC as collateral in ${name} on ${chain} and borrow at most 30% against it once, so the account shows both sides of the market.`;
  if (c.includes('dex') || c.includes('amm')) return `Add $${capital} of liquidity to ${name}'s deepest USDC pair on ${chain}, split evenly across both assets, and keep the LP position open.`;
  if (c.includes('perpetual') || c.includes('derivative') || c.includes('basis')) return `Deposit $${capital} of USDC as margin on ${name} and run one small hedged trade a week, long and short in equal size, so volume accrues without directional risk.`;
  if (c.includes('rwa') || c.includes('real world')) return `Mint $${capital} of ${name}'s yield-bearing real-world-asset token on ${chain} through its own app and hold the token in the same wallet.`;
  if (c.includes('insurance')) return `Buy $${capital} of cover from ${name} on ${chain} for the longest term it offers and keep the policy NFT in the wallet.`;
  if (c.includes('restak') || c.includes('staking') || c.includes('collateral market')) return `Stake $${capital} of the underlying asset through ${name} on ${chain} and hold the receipt token; do not loop it into a second protocol.`;
  if (c.includes('yield') || c.includes('aggregator')) return `Deposit $${capital} of USDC into ${name}'s main vault on ${chain} and leave auto-compounding on, so the share balance grows on its own.`;
  if (c.includes('stable')) return `Mint or deposit $${capital} of the stable asset through ${name} on ${chain} and hold it rather than swapping out the same day.`;
  if (c.includes('chain') || c.includes('payment')) return `Bridge $${capital} of USDC to ${name}'s network through its canonical route and make one payment or transfer from a wallet on that network.`;
  if (c.includes('governance') || c.includes('incentive')) return `Deposit $${capital} of USDC into ${name} on ${chain} and vote once on its governance or incentives page so the wallet is recorded as a participant.`;
  return `Deposit $${capital} of USDC into ${name} on ${chain} through its own app and keep the position open past the first weekly snapshot.`;
}

/** The category's weekly recurring action, so the wallet keeps qualifying. */
function weeklyAction(p: SnapshotProtocol): string {
  const c = (p.category ?? '').toLowerCase();
  if (c.includes('dex') || c.includes('amm')) return 'Make one small swap through the same pool each week and add or remove a few dollars of liquidity, so the wallet reads as a regular liquidity provider.';
  if (c.includes('perpetual') || c.includes('derivative') || c.includes('basis')) return 'Repeat the hedged trade once a week at the same small size; consistency across weeks counts for more than one large trade.';
  if (c.includes('lend') || c.includes('cdp')) return 'Adjust the position once a week: repay a little of the borrow or supply a few dollars more, keeping the health factor comfortably above liquidation.';
  if (c.includes('chain') || c.includes('payment')) return 'Make one real transfer or payment on the network each week from the same wallet, and keep a small balance there between visits.';
  return 'Repeat the core action once a week at a small size, or top the position up by a few dollars, so the wallet shows continuing use rather than a single visit.';
}

/**
 * A protocol's farm plan: six steps, each an action with a cost and a time,
 * derived from the protocol's category, chains, TVL and age, never from a
 * hand-written list of names. Every step lands inside the gate's 20 to 600
 * characters once the cost and time are appended.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null): string[] {
  const chain = chainOf(p);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const gas = capital >= 150 ? 8 : capital >= 50 ? 4 : 2;
  const steps: Array<{ text: string; cost: string; time: string }> = [
    {
      text: `Set up one fresh wallet for ${p.name} alone and fund it on ${chain}; a wallet per protocol keeps one exploit or one mistake from costing every farm at once.`,
      cost: 'under $3 of gas to fund and make the first approval',
      time: '10 minutes',
    },
    {
      text: coreAction(p, capital, chain),
      cost: `$${capital} of capital plus about $${gas} of gas and fees`,
      time: '15 minutes to set up',
    },
    {
      text: weeklyAction(p),
      cost: 'about $2 of gas a week',
      time: '10 minutes a week',
    },
    {
      text: `Hold the position for at least ${hold} days without withdrawing below half of it, so the wallet appears in several weekly snapshots instead of one.`,
      cost: `the $${capital} stays in the position for the whole hold`,
      time: `${hold} days`,
    },
    {
      text: `Check ${p.name}'s own points, rewards or governance page from inside its app before claiming anything, and never pay a third-party site that offers to claim for you.`,
      cost: 'nothing to check, and never pay to claim',
      time: '10 minutes',
    },
    {
      text: `Keep a farm log with the wallet, the dates, the amounts and the transaction hashes, and unwind the position the same way it was opened once the hold ends or the protocol announces a snapshot.`,
      cost: 'nothing but the log itself',
      time: '15 minutes to close out',
    },
  ];
  return steps.map((s) => {
    let line = `${s.text} Cost: ${s.cost}. Time: ${s.time}.`;
    if (line.length > 600) line = `${line.slice(0, 596)}...`;
    return line;
  });
}

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL): BoardRow[] {
  const { byCategory, global } = peerMultiples(snapshot, model);
  const peersFor = (p: SnapshotProtocol): { multiple: number; count: number } => {
    const hit = byCategory.get(p.category ?? 'Uncategorized');
    return hit === undefined ? { multiple: Math.min(model.multiple_cap, Math.max(model.multiple_floor, global)), count: 0 } : { multiple: hit.multiple, count: hit.count };
  };
  const index = new Map(snapshot.protocols.map((p) => [p.slug, p]));
  const chosen = new Map<string, { p: SnapshotProtocol; tier: 'watchlist' | 'early' }>();
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, { p, tier: 'watchlist' });
  }
  // Early rows are scored by the same model first, then taken from the top:
  // the radar exists to find smaller protocols whose peer price is strong,
  // not simply the next-largest by TVL.
  const early = snapshot.protocols
    .filter((p) => !chosen.has(p.slug) && isRankable(p) && p.tvl_usd < snapshot.floor_usd)
    .map((p) => ({ p, implied: impliedValue(p, snapshot.as_of, peersFor(p), model).implied }))
    .sort((a, b) => b.implied - a.implied || (a.p.slug < b.p.slug ? -1 : 1))
    .slice(0, EARLY_ROWS);
  for (const e of early) chosen.set(e.p.slug, { p: e.p, tier: 'early' });

  const scored = [...chosen.values()].map(({ p, tier }) => {
    const peers = peersFor(p);
    const v = impliedValue(p, snapshot.as_of, peers, model);
    return { p, tier, peers, v };
  });
  scored.sort((a, b) => b.v.implied - a.v.implied || (a.p.slug < b.p.slug ? -1 : 1));
  return scored.map((s, i) => ({
    rank: i + 1,
    slug: s.p.slug,
    name: s.p.name,
    category: s.p.category,
    chains: s.p.chains,
    tvl_usd: s.p.tvl_usd,
    change_7d: s.p.change_7d,
    mcap_usd: s.p.mcap_usd,
    listed_at: s.p.listed_at,
    gecko_id: s.p.gecko_id,
    symbol: s.p.symbol,
    token_status: 'pre-token',
    tier: s.tier,
    age_days: s.v.age,
    implied_value_usd: s.v.implied,
    model: {
      peer_multiple: round4(s.peers.multiple),
      peer_count: s.peers.count,
      growth_pct: round4(s.v.growthPct),
      growth_multiplier: round4(s.v.growthMult),
      maturity_multiplier: round4(s.v.maturityMult),
      breadth_multiplier: round4(s.v.breadthMult),
      age_days: s.v.age,
    },
    farm_steps: farmSteps(s.p, s.v.age),
  }));
}

/** The live-token protocols, by market cap, for the comparison view. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, LIVE_ROWS)
    .map((p) => ({ slug: p.slug, name: p.name, category: p.category, chains: p.chains, tvl_usd: p.tvl_usd, mcap_usd: p.mcap_usd, change_7d: p.change_7d }));
}

/** The biggest pre-token names kept off the board, each with its reason. */
export function watchOnlyRows(snapshot: Snapshot): WatchOnlyRow[] {
  return snapshot.protocols
    .filter((p) => isPreToken(p) && launchBlocker(p) !== null)
    .sort((a, b) => b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : 1))
    .slice(0, WATCH_ONLY_ROWS)
    .map((p) => ({ slug: p.slug, name: p.name, category: p.category, tvl_usd: p.tvl_usd, reason: launchBlocker(p)! }));
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const board = buildBoard(snapshot, model);
  const { global, byCategory } = peerMultiples(snapshot, model);
  const categories: CategoryStat[] = [...byCategory.entries()]
    .map(([category, v]) => ({ category, live_count: v.count, median_multiple: round4(v.median), used_multiple: round4(v.multiple) }))
    .sort((a, b) => b.live_count - a.live_count || (a.category < b.category ? -1 : 1));
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    global_multiple: round4(global),
    scanned: snapshot.protocols.length,
    pre_token: snapshot.protocols.filter(isPreToken).length,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: board.filter((r) => r.tier === 'early').length,
    live_size: LIVE_ROWS,
    rows: board.map((r) => ({
      rank: r.rank,
      slug: r.slug,
      name: r.name,
      category: r.category,
      chains: r.chains,
      tvl_usd: r.tvl_usd,
      change_7d: r.change_7d,
      listed_at: r.listed_at,
      age_days: r.age_days,
      tier: r.tier,
      implied_value_usd: r.implied_value_usd,
      peer_multiple: r.model.peer_multiple,
      peer_count: r.model.peer_count,
      growth_multiplier: r.model.growth_multiplier,
      maturity_multiplier: r.model.maturity_multiplier,
      breadth_multiplier: r.model.breadth_multiplier,
      farm_steps: r.farm_steps,
    })),
    live: liveRows(snapshot),
    watch_only: watchOnlyRows(snapshot),
    categories,
  };
  return { board, radar };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return { as_of: o.as_of, source: o.source, floor_usd: o.floor_usd, protocols, watchlist: o.watchlist as string[] };
}

/** Why a board is not one the gate will take, or null. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  if (board.length < 100) return `the board holds ${board.length} rows, fewer than the 100 the gate asks for`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    if (r.farm_steps.length < 3 || r.farm_steps.length > 12) return `${r.slug} has ${r.farm_steps.length} farm steps`;
    for (const s of r.farm_steps) if (s.length < 20 || s.length > 600) return `${r.slug} has a farm step of ${s.length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch, no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
