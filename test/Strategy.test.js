import assert from 'assert';
import Logger from '../src/Logger.js';
import Analysis from '../src/Analysis.js';
import { atrSeries } from '../src/Indicators.js';
import { DEFAULTS, loadStrategy, netEconomics } from '../src/Strategy.js';

const l = new Logger(false, false, true);

describe('Strategy', () => {

	it('should compute net reward, risk and break-even win rate after fees', () => {
		const economics = netEconomics(DEFAULTS);

		assert.ok(Math.abs(economics.netRewardPercent - 4.35) < 1e-9);
		assert.ok(Math.abs(economics.netRiskPercent - 3.15) < 1e-9);
		assert.ok(Math.abs(economics.breakEvenWinRate - 3.15 / 7.5) < 1e-9);
	});

	it('should show that a 2:1 gross setup is roughly 1:1 at 0.4%/0.8% fees', () => {
		const economics = netEconomics(DEFAULTS, 0.4, 0.8);

		assert.ok(economics.rewardRisk > 1 && economics.rewardRisk < 1.05);
		assert.ok(economics.breakEvenWinRate > 0.49);
	});

	it('should load overrides from properties and keep defaults for the rest', () => {
		const values = { 'strategy.STOP_LOSS_PERCENT': 3, 'strategy.BTC_PAIR': 'XBTEUR' };
		const strategy = loadStrategy({ get: key => (key in values ? values[key] : null) });

		assert.strictEqual(strategy.stopLossPercent, 3);
		assert.strictEqual(strategy.btcPair, 'XBTEUR');
		assert.strictEqual(strategy.takeProfitPercent, DEFAULTS.takeProfitPercent);
	});

	it('should reject an invalid number', () => {
		assert.throws(() => loadStrategy({ get: key => (key === 'strategy.MAX_RISK_AMOUNT' ? 'abc' : null) }), /Invalid number/);
	});

});

describe('Indicators', () => {

	it('should compute a constant ATR for candles with a constant range', () => {
		const ticks = Array.from({ length: 30 }, () => ({ high: 11, low: 9, close: 10 }));
		const atr = atrSeries(ticks, 14);

		assert.strictEqual(atr[13], null);
		assert.ok(Math.abs(atr[14] - 2) < 1e-9);
		assert.ok(Math.abs(atr[29] - 2) < 1e-9);
	});

});

function candleRows(closes) {
	const start = 1700000000;
	return closes.map((close, i) => [start + i * 300, String(close), String(close * 1.001), String(close * 0.999), String(close), String(close), '10', 5]);
}

function bitcoinAnalysis(closes) {
	const getOHLC = async () => ({ body: JSON.stringify({ error: [], result: { XXBTZEUR: candleRows(closes), last: 1 } }) });
	const analysis = new Analysis(['SOL'], 720, 'EUR', l, true);
	return analysis.analyseBitcoin(getOHLC);
}

describe('Analysis market regime', () => {

	it('should allow entries when BTC is rising', async () => {
		const result = await bitcoinAnalysis(Array.from({ length: 300 }, (_, i) => 100 + i * 0.05));

		assert.strictEqual(result.result, 'success');
		assert.strictEqual(result.allowsEntries, true);
	});

	it('should block entries after a sharp BTC drop', async () => {
		const result = await bitcoinAnalysis(Array.from({ length: 300 }, (_, i) => 100 - i * 0.05));

		assert.strictEqual(result.result, 'success');
		assert.strictEqual(result.allowsEntries, false);
	});

});
