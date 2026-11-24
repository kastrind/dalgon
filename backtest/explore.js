import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { loadSeries, monthStartSec } from './data.js';
import { loadHourly, collectEvents, features } from './research.js';
import { simulate, summarize } from './simulate.js';
import { parseArgs, assetsOf, dataDir } from './config.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const sec = (y, m) => Date.UTC(y, m - 1, 1) / 1000;
const BLOCKS = [
	{ name: 'A 2022-01..2023-06', from: sec(2022, 1), to: sec(2023, 7) },
	{ name: 'B 2023-07..2024-12', from: sec(2023, 7), to: sec(2025, 1) },
	{ name: 'C 2025-01..2026-10', from: sec(2025, 1), to: sec(2026, 11) }
];
// Equal-size trades and no portfolio limits, so parameters are compared and not account sizing.
const NEUTRAL = { startBalance: 1e7, minBuyAmount: 100, buyPercent: 0, minBalance: 0, maxRiskAmount: 1e9, dailyMaxLoss: 1e9, weeklyMaxLoss: 1e9, minNetRewardRisk: 0, btcMaxDropPercent: 1e9, atrStopMultiple: 0, maxSurgePercent: 1e9 };

export function loadExecF32(args, assets) {
	let fromSec = monthStartSec(args.from);
	let [ey, em] = args.to.split('-').map(Number);
	let toSec = Date.UTC(ey, em, 1) / 1000;
	let exec = {};
	for (let asset of assets) {
		let s = loadSeries(dataDir(args), `${asset}${args.quote}`, fromSec, toSec);
		let f = a => Float32Array.from(a.subarray(0, s.n));
		exec[`${asset}${args.quote}`] = { n: s.n, t: s.t.slice(0, s.n), o: f(s.o), h: f(s.h), l: f(s.l), c: f(s.c) };
	}
	return exec;
}

// Candidates for the simulator: one entry decision at the close of each hour in which a coin fell far enough.
export function dropSteps(data, feats, window, thresholdPercent, tradable, regime = 'none') {
	let byTime = new Map();
	let key = `r${window}`;
	// btc50d: only buy dips while BTC trades above its 50-day average.
	let regimeOk = (f, i, b) => regime === 'none' || (b.c[i] > b.ema1200[i]);
	let events = collectEvents(data, feats, { test: (f, i, b) => f[key][i] <= -thresholdPercent / 100 && regimeOk(f, i, b) }).filter(e => tradable.includes(e.asset));
	for (let e of events) {
		let t = data.fromSec + (e.i + 1) * 3600;
		let f = feats[e.asset];
		let severity = -f[key][e.i] * 100 / thresholdPercent;
		if (!byTime.has(t)) byTime.set(t, { t, btc24h: null, c: [] });
		byTime.get(t).c.push({ n: e.asset, g: severity, p: f.c[e.i], d24: f.r24[e.i], atr: null });
	}
	return [...byTime.values()].sort((a, b) => a.t - b.t);
}

const SIGNALS = [[1, 4], [1, 6], [4, 5], [4, 7], [24, 15]];

function grid() {
	let out = [];
	for (let [window, threshold] of SIGNALS)
	for (let regime of ['none', 'btc50d'])
	for (let stopLossPercent of [8, 12, 15, 20, 99])
	for (let takeProfitPercent of [5, 8, 12, 20, 1000])
	for (let maxHoldHours of [24, 48, 72, 168])
		out.push({ window, threshold, regime, stopLossPercent, takeProfitPercent, maxHoldHours });
	return out;
}

const label = c => `drop ${c.window}h<=-${c.threshold}% ${c.regime} sl${c.stopLossPercent} tp${c.takeProfitPercent} hold${c.maxHoldHours}h`;
const fmt = r => `${String(r.trades).padStart(3)}t ${r.pnl.toFixed(0).padStart(5)} (${(r.win * 100).toFixed(0)}%)`;
const total = rows => rows.reduce((s, r) => s + r.pnl, 0);

function evaluate(stepsFor, exec, quote, config, extra) {
	let overrides = { ...NEUTRAL, ...extra, stopLossPercent: config.stopLossPercent, takeProfitPercent: config.takeProfitPercent, maxHoldHours: config.maxHoldHours, gradeThreshold: 0 };
	let steps = stepsFor(config);
	return BLOCKS.map(block => {
		let result = simulate(steps.filter(s => s.t >= block.from && s.t < block.to), exec, quote, overrides);
		let sum = summarize(result, NEUTRAL.startBalance);
		return { trades: sum.trades, pnl: sum.netPnl, win: sum.winRate, expectancy: sum.expectancyPercent };
	});
}

async function main() {
	let args = parseArgs(process.argv.slice(2));
	let assets = assetsOf(args);
	let loaded = [...new Set([...assets, 'BTC'])];
	let data = loadHourly(args, loaded);
	let feats = {};
	for (let asset of loaded) feats[asset] = features(data.assets[asset], data.hours);
	let exec = loadExecF32(args, assets);
	let extra = {};
	for (let key of ['makerFeePercent', 'takerFeePercent', 'halfSpreadPercent', 'stopSlipPercent', 'entryOffsetPercent']) if (args[key] !== undefined) extra[key] = args[key];

	let cache = new Map();
	let stepsFor = c => { let k = `${c.window}/${c.threshold}/${c.regime}`; if (!cache.has(k)) cache.set(k, dropSteps(data, feats, c.window, c.threshold, assets, c.regime)); return cache.get(k); };

	let rows = grid().map(config => ({ config, blocks: evaluate(stepsFor, exec, args.quote, config, extra) }));
	let enough = rows.filter(r => r.blocks.every(b => b.trades >= 10));
	console.log(`assets ${assets.join(' ')}; ${rows.length} sets, ${enough.length} with >= 10 trades per block. P&L per 100 traded, per block (trades, pnl, win rate).`);
	console.log(`blocks: ${BLOCKS.map(b => b.name).join(' | ')}`);

	let byTrain = [...enough].sort((a, b) => total(b.blocks.slice(0, 2)) - total(a.blocks.slice(0, 2)));
	console.log('\nBest on A+B (tuning); C is the unseen holdout:');
	for (let r of byTrain.slice(0, 15)) console.log(`${label(r.config).padEnd(46)} | ${r.blocks.map(fmt).join(' | ')}  holdout ${r.blocks[2].pnl.toFixed(0)}`);
	let held = enough.map(r => r.blocks[2].pnl).sort((a, b) => a - b);
	let top = byTrain.slice(0, 15);
	console.log(`\nholdout C across all sets: median ${held[Math.floor(held.length / 2)].toFixed(0)}, share profitable ${(held.filter(v => v > 0).length / held.length * 100).toFixed(0)}%; mean of the 15 chosen on A+B: ${(top.reduce((s, r) => s + r.blocks[2].pnl, 0) / top.length).toFixed(0)}`);
	let allPositive = enough.filter(r => r.blocks.every(b => b.pnl > 0));
	console.log(`sets profitable in all three blocks: ${allPositive.length} of ${enough.length}`);

	fs.mkdirSync(path.join(here, 'results'), { recursive: true });
	fs.writeFileSync(path.join(here, 'results', `explore-${args.quote}.json`), JSON.stringify(rows, null, 1));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
