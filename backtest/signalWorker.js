import { parentPort, workerData } from 'worker_threads';
import fs from 'fs';
import os from 'os';
import { Market } from './market.js';
import Analysis from '../src/Analysis.js';

const { dir, pairs, assets, quote, fromSec, toSec, stepSec, warmupSec, strategy, out } = workerData;

// The analysis pauses between exchange requests; there is no exchange here.
globalThis.setTimeout = (fn, ms, ...args) => { queueMicrotask(() => fn(...args)); return 0; };
const realNow = Date.now;
const silent = { i: () => '', d: () => '', w: () => '', suc: () => '', err: () => '', l: () => '' };

let market = new Market(dir, pairs, fromSec - warmupSec, toSec);
let analysis = new Analysis(assets, 720, quote, silent, false, strategy);
analysis.sleepMillis = 0;

let lines = [];
for (let t = fromSec; t < toSec; t += stepSec) {
	// Analysis reads the clock to decide which candle is still forming.
	Date.now = () => t * 1000;
	let candidates = await analysis.recommend(market.getOHLC(t), os.devNull);
	if (!candidates.length) continue;
	let btc = analysis.bitcoinAnalysis;
	lines.push(JSON.stringify({
		t,
		btc24h: btc.result === 'success' ? btc.latestClosingPriceDiffYesterdaysPercent : null,
		c: candidates.map(c => ({ n: c.name, g: c.candidateGrade, p: c.latestClosingPrice, d24: c.changeDay24h, atr: c.atrPercent, al: c.timeframesAligned }))
	}));
}
Date.now = realNow;
fs.writeFileSync(out, lines.join('\n') + (lines.length ? '\n' : ''));
parentPort.postMessage({ done: true, signals: lines.length });
