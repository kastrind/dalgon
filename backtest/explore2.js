import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { loadHourly, features, collectEvents } from './research.js';
import { extras, snapshot } from './research2.js';
import { loadExecF32 } from './explore.js';
import { simulate, summarize } from './simulate.js';
import { parseArgs, assetsOf } from './config.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const sec = (y, m) => Date.UTC(y, m - 1, 1) / 1000;
const BLOCKS = [
	{ name: 'A 2022-01..2023-06', from: sec(2022, 1), to: sec(2023, 7) },
	{ name: 'B 2023-07..2024-12', from: sec(2023, 7), to: sec(2025, 1) },
	{ name: 'C 2025-01..2026-10', from: sec(2025, 1), to: sec(2026, 11) }
];
const NEUTRAL = { startBalance: 1e7, minBuyAmount: 100, buyPercent: 0, minBalance: 0, maxRiskAmount: 1e9, dailyMaxLoss: 1e9, weeklyMaxLoss: 1e9, minNetRewardRisk: 0, btcMaxDropPercent: 1e9, atrStopMultiple: 0, maxSurgePercent: 1e9, gradeThreshold: 0 };

// Signals chosen from the forward-return study because they replicated on the holdout; the grid below is kept small on purpose.
const SIGNALS = {
	'z24<=-3': s => s.z24 <= -3,
	'z12<=-3': s => s.z12 <= -3,
	'z12<=-4': s => s.z12 <= -4,
	'z24<=-3 & BTC24h<=-5%': (s, b) => s.z24 <= -3 && b.r24 <= -0.05
};
const severity = { 'z24': s => -s.z24, 'z12': s => -s.z12 };

function stepsFor(name, data, feats, tradable) {
	let test = SIGNALS[name];
	let events = collectEvents(data, feats, { test: (f, i, b) => test(snapshot(f, i), snapshot(b, i)) }).filter(e => tradable.includes(e.asset));
	let byTime = new Map();
	for (let e of events) {
		let f = feats[e.asset];
		let t = data.fromSec + (e.i + 1) * 3600;
		let z = name.startsWith('z12') ? -f.z12[e.i] : -f.z24[e.i];
		if (!byTime.has(t)) byTime.set(t, { t, btc24h: null, c: [] });
		byTime.get(t).c.push({ n: e.asset, g: z, p: f.c[e.i], d24: f.r24[e.i], atr: null });
	}
	return [...byTime.values()].sort((a, b) => a.t - b.t);
}

function grid() {
	let out = [];
	for (let signal of Object.keys(SIGNALS))
	for (let stopLossPercent of [8, 12, 15, 25, 99])
	for (let takeProfitPercent of [5, 8, 12, 1000])
	for (let maxHoldHours of [24, 48, 72])
		out.push({ signal, stopLossPercent, takeProfitPercent, maxHoldHours });
	return out;
}

const label = c => `${c.signal} sl${c.stopLossPercent} tp${c.takeProfitPercent} hold${c.maxHoldHours}h`;
const fmt = r => `${String(r.trades).padStart(3)}t ${r.pnl.toFixed(0).padStart(5)} (${(r.win * 100).toFixed(0)}%)`;
const total = rows => rows.reduce((s, r) => s + r.pnl, 0);

async function main() {
	let args = parseArgs(process.argv.slice(2));
	let assets = assetsOf(args);
	let loaded = [...new Set([...assets, 'BTC'])];
	let data = loadHourly(args, loaded);
	let feats = {};
	for (let a of loaded) feats[a] = features(data.assets[a], data.hours);
	extras(feats, data.hours);
	let exec = loadExecF32(args, assets);

	let steps = {};
	for (let name of Object.keys(SIGNALS)) steps[name] = stepsFor(name, data, feats, assets);
	let rows = grid().map(config => {
		let overrides = { ...NEUTRAL, stopLossPercent: config.stopLossPercent, takeProfitPercent: config.takeProfitPercent, maxHoldHours: config.maxHoldHours };
		let blocks = BLOCKS.map(block => {
			let r = simulate(steps[config.signal].filter(s => s.t >= block.from && s.t < block.to), exec, args.quote, overrides);
			let sum = summarize(r, NEUTRAL.startBalance);
			return { trades: sum.trades, pnl: sum.netPnl, win: sum.winRate, expectancy: sum.expectancyPercent, se: sum.expectancyStdErrPercent };
		});
		return { config, blocks };
	});

	console.log(`${assets.length} coins, ${rows.length} sets. P&L per 100 traded, per block (trades, pnl, win rate). Blocks: ${BLOCKS.map(b => b.name).join(' | ')}`);
	let byTune = [...rows].sort((a, b) => total(b.blocks.slice(0, 2)) - total(a.blocks.slice(0, 2)));
	console.log('\nBest on A+B; C is the holdout:');
	for (let r of byTune.slice(0, 12)) console.log(`${label(r.config).padEnd(40)} | ${r.blocks.map(fmt).join(' | ')}  holdout ${r.blocks[2].pnl.toFixed(0)}`);
	let held = rows.map(r => r.blocks[2].pnl).sort((a, b) => a - b);
	console.log(`\nholdout C over all ${rows.length} sets: median ${held[Math.floor(held.length / 2)].toFixed(0)}, share profitable ${(held.filter(v => v > 0).length / held.length * 100).toFixed(0)}%; mean of the 12 chosen: ${(byTune.slice(0, 12).reduce((s, r) => s + r.blocks[2].pnl, 0) / 12).toFixed(0)}`);
	let allPos = rows.filter(r => r.blocks.every(b => b.pnl > 0));
	console.log(`profitable in all three blocks: ${allPos.length} of ${rows.length}`);
	for (let signal of Object.keys(SIGNALS)) {
		let own = rows.filter(r => r.config.signal === signal);
		console.log(`  ${signal}: ${own.filter(r => r.blocks.every(b => b.pnl > 0)).length}/${own.length} all-positive, median holdout ${own.map(r => r.blocks[2].pnl).sort((a, b) => a - b)[Math.floor(own.length / 2)].toFixed(0)}, trades per year about ${(own[0].blocks.reduce((s, b) => s + b.trades, 0) / 4.8).toFixed(0)}`);
	}
	fs.mkdirSync(path.join(here, 'results'), { recursive: true });
	fs.writeFileSync(path.join(here, 'results', `explore2-${args.quote}.json`), JSON.stringify(rows, null, 1));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
