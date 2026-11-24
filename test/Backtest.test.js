import assert from 'assert';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { simulate, summarize } from '../backtest/simulate.js';
import { Market } from '../backtest/market.js';

const T0 = Date.UTC(2024, 0, 1) / 1000;

// One 1m candle per entry of closes; high and low default to the close.
function series(points) {
	let n = points.length;
	let s = { n, t: new Float64Array(n), o: new Float64Array(n), h: new Float64Array(n), l: new Float64Array(n), c: new Float64Array(n) };
	points.forEach((p, i) => {
		let [close, low = close, high = close] = Array.isArray(p) ? p : [p];
		s.t[i] = T0 + i * 60; s.o[i] = close; s.c[i] = close; s.l[i] = low; s.h[i] = high;
	});
	return s;
}

const flat = (price, count) => Array(count).fill(price);
const step = [{ t: T0 + 30 * 60, btc24h: null, c: [{ n: 'XRP', g: 1, p: 100, d24: 0, atr: null }] }];
const run = (points, overrides = {}) => simulate(step, { XRPUSDT: series(points) }, 'USDT', { minNetRewardRisk: 0, ...overrides });

describe('Backtest simulation', () => {

	it('should not enter when the post-only bid is never traded through', () => {
		let result = run([...flat(100, 30), ...flat(100.5, 200)]);
		assert.strictEqual(result.trades.length, 0);
		assert.strictEqual(result.stats.unfilledEntries, 1);
	});

	it('should stop out below the stop price with fees and slippage', () => {
		let result = run([...flat(100, 30), 99.9, ...flat(99, 5), [98, 96, 98], ...flat(95, 60)]);
		assert.strictEqual(result.trades.length, 1);
		let trade = result.trades[0];
		assert.strictEqual(trade.reason, 'stop');
		assert.ok(trade.pct < -3.0 && trade.pct > -3.8, `pct ${trade.pct}`);
	});

	it('should gap through the stop at the next open when price jumps below it', () => {
		let result = run([...flat(100, 30), 99.9, ...flat(99, 5), ...flat(95, 60)]);
		assert.strictEqual(result.trades[0].reason, 'stop');
		assert.ok(result.trades[0].pct < -5, `pct ${result.trades[0].pct}`);
	});

	it('should exit at the target once a candle closes at or above it', () => {
		let result = run([...flat(100, 30), 99.9, ...flat(101, 5), ...flat(106, 5)]);
		let trade = result.trades[0];
		assert.strictEqual(trade.reason, 'target');
		assert.ok(trade.pnl > 0);
	});

	it('should ignore a target that is only touched by a wick when triggering on close', () => {
		let points = [...flat(100, 30), 99.9, ...flat(101, 5), [101, 101, 110], ...flat(101, 40)];
		assert.notStrictEqual(run(points, { maxHoldHours: 0.2 }).trades[0].reason, 'target');
		assert.strictEqual(run(points, { targetTrigger: 'high' }).trades[0].reason, 'target');
	});

	it('should stop before taking the target when both occur in one candle', () => {
		let result = run([...flat(100, 30), 99.9, [100, 90, 110], ...flat(100, 10)]);
		assert.strictEqual(result.trades[0].reason, 'stop');
	});

	it('should exit on time when neither stop nor target is reached', () => {
		let result = run([...flat(100, 30), 99.9, ...flat(100, 200)], { maxHoldHours: 1 });
		assert.strictEqual(result.trades[0].reason, 'time');
		assert.ok(Math.abs(result.trades[0].hours - 1) < 0.05);
	});

	it('should step the target down as the position ages', () => {
		let points = [...flat(100, 30), 99.9, ...flat(100, 55), ...flat(103, 20), ...flat(100, 20)];
		let flatTarget = run(points, { takeProfitPercent: 10, maxHoldHours: 2, targetDecay: [1] }).trades[0];
		let decayed = run(points, { takeProfitPercent: 10, maxHoldHours: 2, targetDecay: [1, 0.2] }).trades[0];
		assert.notStrictEqual(flatTarget.reason, 'target');
		assert.strictEqual(decayed.reason, 'target');
	});

	it('should hold off new entries after the daily loss limit is reached', () => {
		let steps = [30, 400].map(k => ({ t: T0 + k * 60, btc24h: null, c: [{ n: 'XRP', g: 1, p: 100, d24: 0, atr: null }] }));
		let points = [...flat(100, 30), 99.9, ...flat(95, 369), 100, ...flat(95, 60)];
		let result = simulate(steps, { XRPUSDT: series(points) }, 'USDT', { minNetRewardRisk: 0, dailyMaxLoss: 1 });
		assert.strictEqual(result.trades.length, 1);
		assert.strictEqual(result.stats.blockedByLossLimit, 1);
	});

	it('should block entries after a market-wide BTC drop', () => {
		let blocked = [{ ...step[0], btc24h: -0.05 }];
		let result = simulate(blocked, { XRPUSDT: series([...flat(100, 30), 99.9, ...flat(106, 40)]) }, 'USDT', { minNetRewardRisk: 0 });
		assert.strictEqual(result.trades.length, 0);
		assert.strictEqual(result.stats.blockedByBtc, 1);
	});

	it('should summarize wins, losses and drawdown', () => {
		let sum = summarize({ trades: [{ pnl: 5, pct: 5, hours: 1, reason: 'target', asset: 'XRP', exitT: T0 }, { pnl: -3, pct: -3, hours: 2, reason: 'stop', asset: 'XRP', exitT: T0 }], stats: {}, economics: {} }, 100);
		assert.strictEqual(sum.trades, 2);
		assert.strictEqual(sum.winRate, 0.5);
		assert.strictEqual(sum.netPnl, 2);
		assert.strictEqual(sum.maxDrawdown, 3);
	});
});

describe('Backtest market replay', () => {
	let dir;

	before(() => {
		dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dalgon-market-'));
		// 20 one-minute candles whose close equals the minute index, starting at a 5m boundary.
		let rows = new Float64Array(20 * 8);
		for (let i = 0; i < 20; i++) rows.set([T0 + i * 60, i, i + 0.5, i - 0.5, i, 1, 10, 1], i * 8);
		fs.writeFileSync(path.join(dir, 'XRPUSDT-1m-2024-01.bin'), Buffer.from(rows.buffer));
	});

	after(() => fs.rmSync(dir, { recursive: true, force: true }));

	it('should expose only data from before the requested time in the forming candle', () => {
		let market = new Market(dir, ['XRPUSDT'], T0, T0 + 86400);
		let rows = market.ohlcRows('XRPUSDT', 5, T0 + 7 * 60, 10);
		assert.strictEqual(rows.length, 2);
		assert.deepStrictEqual(rows[0].slice(0, 5), [T0, 0, 4.5, -0.5, 4]);
		// The second candle covers minutes 5 and 6 only: minute 7 has not happened yet.
		assert.deepStrictEqual(rows[1].slice(0, 5), [T0 + 300, 5, 6.5, 4.5, 6]);
		assert.strictEqual(rows[1][6], 2);
	});

	it('should return a completed candle unchanged once its interval has passed', () => {
		let market = new Market(dir, ['XRPUSDT'], T0, T0 + 86400);
		let rows = market.ohlcRows('XRPUSDT', 5, T0 + 10 * 60, 10);
		assert.deepStrictEqual(rows[1].slice(0, 5), [T0 + 300, 5, 9.5, 4.5, 9]);
	});

	it('should answer the exchange OHLC request in Kraken format', async () => {
		let market = new Market(dir, ['XRPUSDT'], T0, T0 + 86400);
		let response = await market.getOHLC(T0 + 10 * 60)({ searchParams: { pair: 'XRPUSDT', since: T0, interval: 1 } });
		let body = JSON.parse(response.body);
		assert.strictEqual(body.result.XRPUSDT.length, 10);
		assert.strictEqual(body.result.XRPUSDT[9][4], 9);
	});
});
