import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { Worker } from 'worker_threads';
import { fileURLToPath } from 'url';
import { listMonths, monthStartSec } from './data.js';
import { assetsOf, cacheDir, dataDir, pairsOf } from './config.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const SOURCES = ['Analysis.js', 'OHLC.js', 'Tick.js', 'Indicators.js', 'Candidate.js', 'utils.js', 'Strategy.js'];
// Filters that Analysis applies to candidates are switched off here and re-applied in the simulation, so they can be tuned without re-running the analysis.
const FILTERS_OFF = { maxSurgePercent: 1e9, atrStopMultiple: 0, btcMaxDropPercent: 1e9, minDailyQuoteVolume: 0 };
const WARMUP_SEC = 35 * 86400;

function sourceHash(strategy, scope) {
	let hash = crypto.createHash('sha1');
	for (let file of SOURCES) hash.update(fs.readFileSync(path.join(here, '..', 'src', file)));
	hash.update(JSON.stringify(strategy) + scope);
	return hash.digest('hex').slice(0, 10);
}

// Runs the real Analysis at every step through the period, one worker per month, and caches the candidates it produced.
export async function computeSignals(args, log = console.log) {
	let strategy = { ...FILTERS_OFF, btcPair: `BTC${args.quote}` };
	if (args.hammerSupportPercent !== undefined) strategy.hammerSupportPercent = args.hammerSupportPercent;
	for (let key of ['signalMode', 'capitulationDropPercent', 'capitulationWindowHours']) if (args[key] !== undefined) strategy[key] = args[key];
	let assets = assetsOf(args);
	let key = `${sourceHash(strategy, assets.join('-'))}-step${args.step}`;
	let dir = path.join(cacheDir(args), key);
	fs.mkdirSync(dir, { recursive: true });

	let months = listMonths(args.from, args.to);
	let queue = months.filter(month => args.refresh || !fs.existsSync(path.join(dir, `${month}.jsonl`)));
	log(`signals: ${months.length - queue.length} months cached, ${queue.length} to compute (step ${args.step}m, cache ${key})`);

	let pairs = pairsOf(args);
	let run = month => new Promise((resolve, reject) => {
		let [y, m] = month.split('-').map(Number);
		let worker = new Worker(path.join(here, 'signalWorker.js'), { workerData: {
			dir: dataDir(args), pairs, assets, quote: args.quote,
			fromSec: monthStartSec(month), toSec: Date.UTC(y, m, 1) / 1000, stepSec: args.step * 60, warmupSec: WARMUP_SEC,
			strategy, out: path.join(dir, `${month}.jsonl`)
		} });
		worker.on('message', msg => { if (msg.done) { log(`  ${month}: ${msg.signals} signal steps`); resolve(); } });
		worker.on('error', reject);
		worker.on('exit', code => { if (code !== 0) reject(new Error(`worker for ${month} exited with ${code}`)); });
	});

	let next = 0;
	let lanes = Array.from({ length: args.workers || 4 }, async () => {
		while (next < queue.length) await run(queue[next++]);
	});
	await Promise.all(lanes);

	let steps = [];
	for (let month of months) {
		let file = path.join(dir, `${month}.jsonl`);
		if (!fs.existsSync(file)) continue;
		for (let line of fs.readFileSync(file, 'utf8').split('\n')) if (line) steps.push(JSON.parse(line));
	}
	return steps;
}
