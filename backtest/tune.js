import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { computeSignals } from './signals.js';
import { loadExec, randomSteps, printSummary } from './run.js';
import { parseArgs } from './config.js';
import { simulate, summarize } from './simulate.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const sec = (y, m) => Date.UTC(y, m - 1, 1) / 1000;

// Three consecutive blocks: a parameter set has to hold up in each of them, not only on average.
const BLOCKS = [
	{ name: 'A 2022-01..2023-06', from: sec(2022, 1), to: sec(2023, 7) },
	{ name: 'B 2023-07..2024-12', from: sec(2023, 7), to: sec(2025, 1) },
	{ name: 'C 2025-01..2026-10', from: sec(2025, 1), to: sec(2026, 11) }
];

// Equal-size trades, no loss limits or risk cap, so results compare parameters and not account sizing.
const NEUTRAL = { startBalance: 1e7, minBuyAmount: 100, buyPercent: 0, minBalance: 0, maxRiskAmount: 1e9, dailyMaxLoss: 1e9, weeklyMaxLoss: 1e9, minNetRewardRisk: 0 };

const DECAYS = { flat: [1], gentle: [1, 0.85, 0.7, 0.55, 0.4], fast: [1, 0.7, 0.5, 0.35, 0.25] };

function grid() {
	let out = [];
	for (let gradeThreshold of [0.7, 0.99, 1.2])
	for (let takeProfitPercent of [5, 10, 12, 15])
	for (let stopLossPercent of [2.5, 5, 8, 12, 99])
	for (let maxHoldHours of [48, 72, 168])
	for (let decay of Object.keys(DECAYS))
	for (let atrStopMultiple of [0, 1.5])
	for (let btcMaxDropPercent of [4, 100])
		out.push({ gradeThreshold, takeProfitPercent, stopLossPercent, maxHoldHours, decay, atrStopMultiple, btcMaxDropPercent });
	return out;
}

const label = c => `grade>=${c.gradeThreshold} tp${c.takeProfitPercent} sl${c.stopLossPercent} hold${c.maxHoldHours}h ${c.decay} atr${c.atrStopMultiple} btc${c.btcMaxDropPercent}`;

function evaluate(steps, exec, quote, config, extra) {
	let overrides = { ...NEUTRAL, ...extra, ...config, targetDecay: DECAYS[config.decay] };
	return BLOCKS.map(block => {
		let result = simulate(steps.filter(s => s.t >= block.from && s.t < block.to), exec, quote, overrides);
		let sum = summarize(result, NEUTRAL.startBalance);
		return { trades: sum.trades, pnl: sum.netPnl, win: sum.winRate, expectancy: sum.expectancyPercent };
	});
}

const fmt = r => `${String(r.trades).padStart(3)}t ${r.pnl.toFixed(0).padStart(5)} (${(r.win * 100).toFixed(0)}%)`;
const total = rows => rows.reduce((s, r) => s + r.pnl, 0);

async function main() {
	let args = parseArgs(process.argv.slice(2));
	let steps = await computeSignals(args);
	let exec = loadExec(args);
	let extra = {};
	for (let key of ['makerFeePercent', 'takerFeePercent', 'halfSpreadPercent', 'stopSlipPercent']) if (args[key] !== undefined) extra[key] = args[key];

	let configs = grid();
	let rows = configs.map(config => ({ config, blocks: evaluate(steps, exec, args.quote, config, extra) }));
	let enough = rows.filter(r => r.blocks.every(b => b.trades >= 8));
	console.log(`${configs.length} parameter sets, ${enough.length} with at least 8 trades in every block. P&L is EUR/USD per 100 traded, per block (trades, pnl, win rate).`);
	console.log(`blocks: ${BLOCKS.map(b => b.name).join(' | ')}`);

	let byTrain = [...enough].sort((a, b) => total(b.blocks.slice(0, 2)) - total(a.blocks.slice(0, 2)));
	console.log('\nBest on A+B (the tuning period); C is the unseen holdout:');
	for (let r of byTrain.slice(0, 12)) console.log(`${label(r.config).padEnd(62)} | ${r.blocks.map(fmt).join(' | ')}  holdout ${r.blocks[2].pnl.toFixed(0)}`);

	let heldOut = enough.map(r => r.blocks[2].pnl).sort((a, b) => a - b);
	let top = byTrain.slice(0, 12);
	console.log(`\nholdout C across all sets: median ${heldOut[Math.floor(heldOut.length / 2)].toFixed(0)}, best ${heldOut[heldOut.length - 1].toFixed(0)}, share profitable ${(heldOut.filter(v => v > 0).length / heldOut.length * 100).toFixed(0)}%`);
	console.log(`holdout C of the 12 chosen on A+B: mean ${(top.reduce((s, r) => s + r.blocks[2].pnl, 0) / top.length).toFixed(0)}`);

	let byWorst = [...enough].sort((a, b) => Math.min(...b.blocks.map(x => x.pnl)) - Math.min(...a.blocks.map(x => x.pnl)));
	console.log('\nBest worst-block result (every block counted, so this is in-sample):');
	for (let r of byWorst.slice(0, 8)) console.log(`${label(r.config).padEnd(62)} | ${r.blocks.map(fmt).join(' | ')}`);

	fs.mkdirSync(path.join(here, 'results'), { recursive: true });
	fs.writeFileSync(path.join(here, 'results', `tune-${args.quote}.json`), JSON.stringify(rows, null, 1));
}

await main();
