import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { loadSeries, monthStartSec, listMonths } from './data.js';
import { computeSignals } from './signals.js';
import { simulate, summarize, SIM_DEFAULTS } from './simulate.js';
import { parseArgs, dataDir, assetsOf } from './config.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const SIM_KEYS = Object.keys(SIM_DEFAULTS);

export function loadExec(args) {
	let fromSec = monthStartSec(args.from);
	let last = args.to.split('-').map(Number);
	let toSec = Date.UTC(last[0], last[1], 1) / 1000;
	let exec = {};
	for (let asset of assetsOf(args)) {
		let pair = `${asset}${args.quote}`;
		let s = loadSeries(dataDir(args), pair, fromSec, toSec);
		exec[pair] = { n: s.n, t: s.t, o: s.o, h: s.h, l: s.l, c: s.c };
	}
	return exec;
}

export function overridesFrom(args) {
	let overrides = {};
	for (let key of SIM_KEYS) if (args[key] !== undefined) overrides[key] = args[key];
	return overrides;
}

function buyAndHold(exec, fromSec, toSec) {
	let results = {};
	for (let pair in exec) {
		let s = exec[pair];
		let a = s.t.findIndex((t, i) => i < s.n && t >= fromSec);
		let b = s.n - 1;
		while (b > 0 && s.t[b] >= toSec) b--;
		results[pair] = a >= 0 ? (s.c[b] / s.c[a] - 1) * 100 : NaN;
	}
	let values = Object.values(results).filter(Number.isFinite);
	return { perPair: results, average: values.reduce((s, v) => s + v, 0) / values.length };
}

const money = v => (v < 0 ? '-' : '') + '€' + Math.abs(v).toFixed(2);

function mulberry32(seed) {
	return () => {
		seed |= 0; seed = seed + 0x6D2B79F5 | 0;
		let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
		t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
		return ((t ^ t >>> 14) >>> 0) / 4294967296;
	};
}

// Entries at random times and assets, run through the same execution model: shows what costs and drift alone produce.
export function randomSteps(exec, quote, fromSec, toSec, count, seed) {
	let rand = mulberry32(seed);
	let pairs = Object.keys(exec);
	let steps = [];
	for (let k = 0; k < count; k++) {
		let t = Math.floor((fromSec + rand() * (toSec - fromSec)) / 900) * 900;
		let pair = pairs[Math.floor(rand() * pairs.length)];
		let asset = pair.slice(0, pair.length - quote.length);
		let s = exec[pair];
		let lo = 0, hi = s.n;
		while (lo < hi) { let mid = (lo + hi) >> 1; if (s.t[mid] < t) lo = mid + 1; else hi = mid; }
		if (lo === 0 || lo >= s.n) continue;
		steps.push({ t, btc24h: null, c: [{ n: asset, g: 1, p: s.c[lo - 1], d24: 0, atr: null }] });
	}
	return steps.sort((a, b) => a.t - b.t);
}

export function printSummary(title, sum, log = console.log) {
	log(`\n== ${title} ==`);
	if (!sum.trades) { log('no trades'); log(JSON.stringify(sum.stats)); return; }
	log(`trades ${sum.trades}  win rate ${(sum.winRate * 100).toFixed(1)}%  net ${money(sum.netPnl)} (${sum.returnPercent.toFixed(1)}% of start)  profit factor ${sum.profitFactor.toFixed(2)}`);
	log(`avg win ${money(sum.avgWin)}  avg loss ${money(sum.avgLoss)}  expectancy ${sum.expectancyPercent.toFixed(3)}% per trade (+/- ${sum.expectancyStdErrPercent.toFixed(3)} s.e.)  max drawdown ${money(sum.maxDrawdown)}  avg hold ${sum.avgHours.toFixed(1)}h`);
	let fmt = g => Object.entries(g).sort().map(([k, v]) => `${k}: ${v.trades} trades ${money(v.pnl)} (${(v.wins / v.trades * 100).toFixed(0)}% win)`).join('\n  ');
	log(`by exit:\n  ${fmt(sum.byReason)}`);
	log(`by asset:\n  ${fmt(sum.byAsset)}`);
	log(`by year:\n  ${fmt(sum.byYear)}`);
	log(`signals dropped: ${JSON.stringify(sum.stats)}`);
}

async function main() {
	let args = parseArgs(process.argv.slice(2));
	let steps = await computeSignals(args);
	let exec = loadExec(args);
	let simFrom = monthStartSec(args.simFrom || args.from);
	let [ey, em] = (args.simTo || args.to).split('-').map(Number);
	let simTo = Date.UTC(ey, em, 1) / 1000;
	let inRange = steps.filter(s => s.t >= simFrom && s.t < simTo);

	let result = simulate(inRange, exec, args.quote, overridesFrom(args));
	let sum = summarize(result);
	let bh = buyAndHold(exec, simFrom, simTo);
	console.log(`\nperiod ${args.simFrom || args.from} to ${args.simTo || args.to}, ${args.quote} pairs, ${inRange.length} candidate steps`);
	console.log(`net reward/risk ${sum.economics.rewardRisk.toFixed(2)}, break-even win rate ${(sum.economics.breakEvenWinRate * 100).toFixed(1)}%`);
	printSummary('strategy', sum);
	console.log(`\nbuy and hold, equal weight: ${bh.average.toFixed(1)}%  (${Object.entries(bh.perPair).map(([k, v]) => `${k} ${v.toFixed(0)}%`).join(', ')})`);

	if (args.nullRuns) {
		let expectancies = [], winRates = [];
		for (let seed = 1; seed <= args.nullRuns; seed++) {
			let n = randomSteps(exec, args.quote, simFrom, simTo, inRange.length * 3, seed);
			let r = summarize(simulate(n, exec, args.quote, overridesFrom(args)));
			expectancies.push(r.expectancyPercent); winRates.push(r.winRate);
		}
		let mean = a => a.reduce((s, v) => s + v, 0) / a.length;
		console.log(`random-entry null (${args.nullRuns} seeds, same execution model): expectancy ${mean(expectancies).toFixed(3)}% per trade (range ${Math.min(...expectancies).toFixed(3)} to ${Math.max(...expectancies).toFixed(3)}), win rate ${(mean(winRates) * 100).toFixed(1)}%`);
	}

	if (args.save) {
		fs.mkdirSync(path.join(here, 'results'), { recursive: true });
		let file = path.join(here, 'results', `${args.save}.csv`);
		let header = 'asset,grade,fillT,exitT,entry,exit,cost,pnl,pct,reason,hours';
		fs.writeFileSync(file, [header, ...result.trades.map(t => [t.asset, t.grade.toFixed(3), new Date(t.fillT * 1000).toISOString(), new Date(t.exitT * 1000).toISOString(), t.entry, t.exit, t.cost.toFixed(2), t.pnl.toFixed(3), t.pct.toFixed(3), t.reason, t.hours.toFixed(2)].join(','))].join('\n'));
		console.log(`\ntrades written to ${file}`);
	}
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
