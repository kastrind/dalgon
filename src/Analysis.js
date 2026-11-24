import fs from 'fs';
import OHLC from './OHLC.js';
import Candidate from './Candidate.js';
import { atrSeries } from './Indicators.js';
import { DEFAULTS } from './Strategy.js';
import { sleep, prcnt, isEmpty } from './utils.js';

// [interval in minutes, candle count] per timeframe, so MACD timeframes never depend on MAX_NUM_RESULTS.
const FRAMES = {
	pastHour: [1, 60],
	hours6: [1, 360],
	hours24: [5, 288],
	week: [15, 672],
	month: [60, 720],
	month4h: [240, 180],
	sixMonthsDaily: [1440, 180]
};

class Analysis {

	constructor(assets, maxNumOHLCResults, baseCurrency, loggerObj, simulationMode=false, strategy={}) {
		this.assets = assets;
		this.maxNumOHLCResults = maxNumOHLCResults;
		this.baseCurrency = baseCurrency;
		this.l = loggerObj;
		this.report = '';
		this.strategy = { ...DEFAULTS, ...strategy };
		this.simulationMode = simulationMode;
		this.simObjOHLCPastHour = {};
		this.simObjOHLC6h = {};
		this.simObjOHLCDay24h = {};
		this.simObjOHLCWeek = {};
		this.simObjOHLCMonth = {};
		this.simObjOHLCQuarter = {};
		this.simObjOHLCBitcoin = {};
		this.sleepMillis = this.simulationMode ? 0 : 2000;
		this.bitcoinAnalysis = {};
		this.bitcoinAnalysisReport = '';
	}

	setSims(simObjOHLCPastHour, simObjOHLC6h, simObjOHLCDay24h, simObjOHLCWeek, simObjOHLCMonth, simObjOHLCQuarter, simObjOHLCBitcoin) {
		this.simObjOHLCPastHour = simObjOHLCPastHour;
		this.simObjOHLC6h = simObjOHLC6h;
		this.simObjOHLCDay24h = simObjOHLCDay24h;
		this.simObjOHLCWeek = simObjOHLCWeek;
		this.simObjOHLCMonth = simObjOHLCMonth;
		this.simObjOHLCQuarter = simObjOHLCQuarter;
		this.simObjOHLCBitcoin = simObjOHLCBitcoin;
	}

	async analyseBitcoin(getOHLC) {
		let ohlcPastHour = await (OHLC.requestInterval(getOHLC, this.strategy.btcPair, ...FRAMES.pastHour, this.l, this.simulationMode, this.simObjOHLCBitcoin));
		if (!ohlcPastHour) return { result: 'failure' };
		
		let latestClosingPrice = ohlcPastHour.getTicks()[ohlcPastHour.getTicks().length - 1].close;
		await sleep(this.sleepMillis);

		// get OHLC for month in 4h intervals, to calculate MACD further back in the past
		let ohlcMonth4hIntervals = await (OHLC.requestInterval(getOHLC, this.strategy.btcPair, ...FRAMES.month4h, this.l, this.simulationMode, this.simObjOHLCMonth));
		if (!ohlcMonth4hIntervals) return { result: 'failure' };

		let macd_a = 12;
		let macd_b = 26;
		let macd_c = 9;
		// if there is enough ohlc data to calculate MACD
		let macdCurrentLong;
		let macdPreviousLong;
		let macdLatestLong;
		let existsMACDReversalLong = false;
		let keptMACDPositiveLong = false;
		let macdLongOffset0;
		let macdLongOffset1;
		let macdLongOffset2;
		let macdLongOffset3;
		let macdLongOffset4;
		let macdLongOffset5;
		let isOverSold = false;
		// the overbought/oversold check reads the MACD down to offset 5
		if (Math.max(macd_a, macd_b) + macd_c + 4 <= ohlcMonth4hIntervals.getTicks().length) {
			macdCurrentLong = parseFloat(ohlcMonth4hIntervals.getMACD(macd_a, macd_b, macd_c, null, 1, 'close'));
			macdPreviousLong = parseFloat(ohlcMonth4hIntervals.getMACD(macd_a, macd_b, macd_c, null, 2, 'close'));
			macdLatestLong = parseFloat(ohlcMonth4hIntervals.getMACD(macd_a, macd_b, macd_c, null, 0, 'close'));
			existsMACDReversalLong = macdCurrentLong > 0 && macdPreviousLong < 0;
			keptMACDPositiveLong = existsMACDReversalLong && macdLatestLong > 0;

			macdLongOffset0 = macdLatestLong;
			macdLongOffset1 = macdCurrentLong;
			macdLongOffset2 = macdPreviousLong;
			macdLongOffset3 = parseFloat(ohlcMonth4hIntervals.getMACD(macd_a, macd_b, macd_c, null, 3, 'close'));
			macdLongOffset4 = parseFloat(ohlcMonth4hIntervals.getMACD(macd_a, macd_b, macd_c, null, 4, 'close'));
			macdLongOffset5 = parseFloat(ohlcMonth4hIntervals.getMACD(macd_a, macd_b, macd_c, null, 5, 'close'));
			isOverSold = (
				(macdLongOffset0 > macdLongOffset1 && macdLongOffset1 < macdLongOffset2 && macdLongOffset2 < macdLongOffset3 && macdLongOffset3 < 0) ||
				(macdLongOffset1 > macdLongOffset2 && macdLongOffset2 < macdLongOffset3 && macdLongOffset3 < macdLongOffset4 && macdLongOffset4 < 0) ||
				(macdLongOffset2 > macdLongOffset3 && macdLongOffset3 < macdLongOffset4 && macdLongOffset4 < macdLongOffset5 && macdLongOffset5 < 0)
				);
		}

		let ohlcMonth = await (OHLC.requestInterval(getOHLC, this.strategy.btcPair, ...FRAMES.month, this.l, this.simulationMode, this.simObjOHLCMonth));
		if (!ohlcMonth) return { result: "failure" };
		await sleep(this.sleepMillis);

		let macdCurrent;
		let macdPrevious;
		let macdLatest;
		let existsMACDReversal = false;
		let keptMACDPositive = false;
		// if there is enough ohlc data to calculate MACD
		if (Math.max(macd_a, macd_b) + macd_c + 3 <= ohlcMonth.getTicks().length) {
			macdCurrent = parseFloat(ohlcMonth.getMACD(macd_a, macd_b, macd_c, null, 1, 'close'));
			macdPrevious = parseFloat(ohlcMonth.getMACD(macd_a, macd_b, macd_c, null, 2, 'close'));
			macdLatest = parseFloat(ohlcMonth.getMACD(macd_a, macd_b, macd_c, null, 0, 'close'));
			existsMACDReversal = macdCurrent > 0 && macdPrevious < 0;
			keptMACDPositive = existsMACDReversal && macdLatest > 0; // && macd2ndLatest > 0;
		}

		let ohlc6Months = await (OHLC.requestInterval(getOHLC, this.strategy.btcPair, ...FRAMES.sixMonthsDaily, this.l, this.simulationMode, this.simObjOHLCBitcoin));
		if (!ohlc6Months) return { result: "failure" };
		await sleep(this.sleepMillis);

		let ohlc24Hours = await (OHLC.requestInterval(getOHLC, this.strategy.btcPair, ...FRAMES.hours24, this.l, this.simulationMode, this.simObjOHLCBitcoin));
		if (!ohlc24Hours) return { result: "failure" };

		// Same reference as for assets: the 8-day EMA of the closes 1 to 8 days back
		let btcDailyCloses = ohlc6Months.getClosesDaysBack(8);
		let eightDaysEMA = latestClosingPrice;
		if (btcDailyCloses.length >= 8) {
			let ohlcBtcPerDay = new OHLC(this.strategy.btcPair, this.l, this.simulationMode);
			ohlcBtcPerDay.setTicks(btcDailyCloses);
			eightDaysEMA = ohlcBtcPerDay.getEMA(8, null, 0, 'close');
		}
		let latestClosingPriceDiff8DaysEMAPercent = (latestClosingPrice - eightDaysEMA) / eightDaysEMA;

		await sleep(this.sleepMillis);
		return {result: 'success',
				eightDaysEMA: eightDaysEMA,
				latestClosingPriceDiff8DaysEMAPercent: latestClosingPriceDiff8DaysEMAPercent,
				latestClosingPriceDiffYesterdaysPercent: ohlc24Hours.getChange(),
				allowsEntries: ohlc24Hours.getChange() > -this.strategy.btcMaxDropPercent / 100,
				isOverSold: isOverSold,
				existsMACDReversal: existsMACDReversal,
				keptMACDPositive: keptMACDPositive,
				existsMACDReversalLong: existsMACDReversalLong,
				keptMACDPositiveLong: keptMACDPositiveLong
				};

	}

	// Buys coins that fell far in a short window: in 2022-2026 data such capitulation drops were followed by rebounds larger than the trading costs, unlike the MACD/OBV signal.
	async recommendCapitulation(getOHLC, reportFilePath, onDemandAsset=null) {
		let s = this.strategy;
		if (onDemandAsset && !this.assets.includes(onDemandAsset)) {
			this.report = this.l.err(`ASSET: ${onDemandAsset} NOT FOUND.`) + '\n';
			return [];
		}
		this.bitcoinAnalysis = {};
		this.bitcoinAnalysisReport = '';
		let report = this.l.i(`CAPITULATION ANALYSIS - START (drop of ${s.capitulationDropPercent}% or more within ${s.capitulationWindowHours}h)`) + '\n';
		let windowSec = s.capitulationWindowHours * 3600;
		let assetResults = [];

		for (let asset of (onDemandAsset ? [onDemandAsset] : this.assets)) {
			let pair = `${asset}${this.baseCurrency}`;
			let ohlc = await OHLC.requestInterval(getOHLC, pair, 15, s.capitulationWindowHours * 4 + 8, this.l, this.simulationMode, this.simObjOHLCDay24h);
			await sleep(this.sleepMillis);
			if (!ohlc) {
				report += this.l.err(`Failed to get 15m candles for ${pair}!`, 1, true) + '\n';
				continue;
			}
			let ticks = ohlc.getTicks();
			let latest = ticks[ticks.length - 1];
			// Reference is the close of the last candle that ended at least one window before the newest candle ends.
			let reference = null;
			for (let i = ticks.length - 1; i >= 0; i--) {
				if (ticks[i].time + 900 <= latest.time + 900 - windowSec) { reference = ticks[i]; break; }
			}
			if (!reference || !(reference.close > 0)) {
				report += this.l.w(`${asset}: not enough history to measure a ${s.capitulationWindowHours}h change.`, 1) + '\n';
				continue;
			}
			let change = latest.close / reference.close - 1;
			let isCandidate = change * 100 <= -s.capitulationDropPercent;
			report += this.l.i(`${asset}: ${prcnt(change)}% over ${s.capitulationWindowHours}h${isCandidate ? ' - capitulation candidate' : ''}`, 1) + '\n';
			if (!isCandidate && !onDemandAsset) continue;

			// Deeper drops rebounded more in the data, so they rank first.
			let grade = 1 + (-change * 100 - s.capitulationDropPercent) / s.capitulationDropPercent;
			let candidate = new Candidate({
				name: asset, baseCurrency: this.baseCurrency, latestClosingPrice: latest.close, candidateGrade: grade,
				changeDay24h: change, atrPercent: null, timeframesAligned: 0, report: `${asset}: ${prcnt(change)}% over ${s.capitulationWindowHours}h, grade ${grade.toFixed(3)}\n`
			});
			if (isCandidate) {
				report += this.l.suc(`It's a candidate! Grade ${grade.toFixed(3)}`, 2, true) + '\n';
				assetResults.push(candidate);
			}
		}
		assetResults.sort((a, b) => b.candidateGrade - a.candidateGrade);
		report += this.l.i(`CAPITULATION ANALYSIS - END`) + '\n';
		this.report = report;
		if (!onDemandAsset) {
			fs.writeFile(reportFilePath, assetResults.map(c => c.report).join(''), err => { if (err) this.l.err(err, 0, true); });
		}
		return assetResults;
	}

	async recommend(getOHLC, reportFilePath, onDemandAsset=null) {

		if (this.strategy.signalMode === 'capitulation') return await this.recommendCapitulation(getOHLC, reportFilePath, onDemandAsset);

		if (onDemandAsset && !this.assets.includes(onDemandAsset)) {
			let report = this.l.err(`ASSET: ${onDemandAsset} NOT FOUND.`) + '\n';
			this.report = report;
			return [];
		}

		let report = onDemandAsset ? this.l.i(`ON-DEMAND ASSET RECOMMENDATION ANALYSIS - START`) + '\n' : this.l.i(`ASSET RECOMMENDATION ANALYSIS CYCLE - START`) + '\n';
		let bitcoinAnalysis = await this.analyseBitcoin(getOHLC);
		this.bitcoinAnalysis = bitcoinAnalysis;
		let btcPositive = bitcoinAnalysis.result == 'success' && (bitcoinAnalysis.latestClosingPriceDiff8DaysEMAPercent >= 0.01 || bitcoinAnalysis.latestClosingPriceDiffYesterdaysPercent >= 0.01);
		let btcNegative = bitcoinAnalysis.result == 'success' && (bitcoinAnalysis.latestClosingPriceDiff8DaysEMAPercent <= -0.01 || bitcoinAnalysis.latestClosingPriceDiffYesterdaysPercent <= -0.01);
		// Conflicting readings are neutral, not both bullish and bearish.
		let isBTCBullish = btcPositive && !btcNegative;
		let isBTCBearish = btcNegative && !btcPositive;
		let isBTCOverSold = bitcoinAnalysis.result == 'success' && bitcoinAnalysis.isOverSold;
		let existsBTCMACDReversal = bitcoinAnalysis.result == 'success' && (bitcoinAnalysis.existsMACDReversal || bitcoinAnalysis.existsMACDReversalLong);
		let keptBTCMACDPositive = bitcoinAnalysis.result == 'success' && (bitcoinAnalysis.keptMACDPositive || bitcoinAnalysis.keptMACDPositiveLong);

		let bitcoinAnalysisReportPart = '';
		if (isBTCBullish) { bitcoinAnalysisReportPart += this.l.i(`BTC is bullish.`, 1) + '\n'; }
		else if (isBTCBearish) { bitcoinAnalysisReportPart += this.l.i(`BTC is bearish.`, 1) + '\n'; }
		if (bitcoinAnalysis.result == 'success') {
			bitcoinAnalysisReportPart += this.l.i(`BTCEUR 8-days EMA is: ${bitcoinAnalysis.eightDaysEMA} (change ${prcnt(bitcoinAnalysis.latestClosingPriceDiff8DaysEMAPercent)}%)`, 1) + '\n';
			bitcoinAnalysisReportPart += this.l.i(`BTCEUR yesterday's price change: ${prcnt(bitcoinAnalysis.latestClosingPriceDiffYesterdaysPercent)}%`, 1) + '\n';
			bitcoinAnalysisReportPart += this.l.i(`BTCEUR oversold: ${isBTCOverSold}`, 1) + '\n';
			bitcoinAnalysisReportPart += this.l.i(`BTCEUR MACD reversal: ${existsBTCMACDReversal}`, 1) + '\n';
			bitcoinAnalysisReportPart += this.l.i(`BTCEUR MACD kept positive: ${keptBTCMACDPositive}`, 1) + '\n';
		}else {
			bitcoinAnalysisReportPart += this.l.err(`Failed to analyse BTCEUR! Aborting analysis without recommendations.`, 1, true) + '\n';
			if (!this.simulationMode) return [];
		}
		this.bitcoinAnalysisReport = bitcoinAnalysisReportPart;

		// A market-wide drop makes alt dip-buys fail together, so no entries until it settles.
		if (bitcoinAnalysis.result == 'success' && !bitcoinAnalysis.allowsEntries) {
			bitcoinAnalysisReportPart += this.l.w(`${this.strategy.btcPair} fell ${prcnt(bitcoinAnalysis.latestClosingPriceDiffYesterdaysPercent)}% in 24h: market-wide drop, no entries.`, 1, true) + '\n';
			this.bitcoinAnalysisReport = bitcoinAnalysisReportPart;
			if (!onDemandAsset) {
				this.report = report + bitcoinAnalysisReportPart;
				fs.writeFile(reportFilePath, '', err => { if (err) this.l.err(err, 0, true); });
				return [];
			}
		}

		report += bitcoinAnalysisReportPart;
		
		let assetResults = [];

		for (let i=0; i < this.assets.length; i++) {
			let asset = onDemandAsset ? onDemandAsset : this.assets[i];
			let assetPair = `${asset}${this.baseCurrency}`;

			report += this.l.i(`EVALUATING ASSET: ${asset} - START`, 1) + '\n';

			let ohlcPastHour = await (OHLC.requestInterval(getOHLC, assetPair, ...FRAMES.pastHour, this.l, this.simulationMode, this.simObjOHLCPastHour));
			if (!ohlcPastHour) {
				await sleep(this.sleepMillis);
				report += this.l.err(`Failed to get ohlcPastHour!`, 2, true) + '\n';
				continue;
			}
			let changePastHour = ohlcPastHour.getChange();
			let latestClosingPrice = ohlcPastHour.getTicks()[ohlcPastHour.getTicks().length - 1].close;
			let derivativePastHour = ohlcPastHour.getDerivative();

			// for testing
			report += this.simulationMode ? this.l.d(`changePastHour: ${changePastHour}`, 2) + '\n' : '';
			report += this.simulationMode ? this.l.d(`latestClosingPrice: ${latestClosingPrice}`, 2) + '\n' : '';
			report += this.simulationMode ? this.l.d(`derivativePastHour: ${derivativePastHour}`, 2) + '\n' : '';

			 await sleep(this.sleepMillis);

			let ohlc6h = await (OHLC.requestInterval(getOHLC, assetPair, ...FRAMES.hours6, this.l, this.simulationMode, this.simObjOHLC6h));
			if (!ohlc6h) {
				await sleep(this.sleepMillis);
				report += this.l.err(`Failed to get ohlc6h!`, 2, true) + '\n';
				continue;
			}
			let change6h = ohlc6h.getChange();
			let derivative6h = ohlc6h.getDerivative();

			// for testing
			report += this.simulationMode ? this.l.d(`change6h: ${change6h}`, 2) + '\n' : '';
			report += this.simulationMode ? this.l.d(`derivative6h: ${derivative6h}`, 2) + '\n' : '';

			let ohlc3h = new OHLC(assetPair, this.l, this.simulationMode, null);
			ohlc3h.setTicks(ohlc6h.getTicksSince(3 * 3600));
			let change3h = ohlc3h.getChange();
			let derivative3h = ohlc3h.getDerivative();
			let onBalanceVol3h = ohlc3h.getOnBalanceVol();

			report += this.l.i(`On-Balance Volume 3h: ${onBalanceVol3h}`, 2) + '\n';

			await sleep(this.sleepMillis);

			let ohlcDay24h = await (OHLC.requestInterval(getOHLC, assetPair, ...FRAMES.hours24, this.l, this.simulationMode, this.simObjOHLCDay24h));
			if (!ohlcDay24h) {
				await sleep(this.sleepMillis);
				report += this.l.err(`Failed to get ohlcDay24h!`, 2, true) + '\n';
				continue;
			}
			let changeDay24h = ohlcDay24h.getChange();
			let derivative24h = ohlcDay24h.getDerivative();

			// for testing
			report += this.simulationMode ? this.l.d(`changeDay24h: ${changeDay24h}`, 2) + '\n' : '';

			let ohlc12h = new OHLC(assetPair, this.l, this.simulationMode);
			ohlc12h.setTicks(ohlcDay24h.getTicksSince(12 * 3600));
			let change12h = ohlc12h.getChange();
			let derivative12h = ohlc12h.getDerivative();

			await sleep(this.sleepMillis);

			let ohlcWeek = await (OHLC.requestInterval(getOHLC, assetPair, ...FRAMES.week, this.l, this.simulationMode, this.simObjOHLCWeek));
			if (!ohlcWeek) {
				await sleep(this.sleepMillis);
				report += this.l.err(`Failed to get ohlcWeek!`, 2, true) + '\n';
				continue;
			}
			let changeWeek = ohlcWeek.getChange();

			let macd_a = this.simulationMode ? 2 : 12;
			let macd_b = this.simulationMode ? 3 : 26;
			let macd_c = this.simulationMode ? 1 : 9;

			let macdCurrentShort;
			let macdPreviousShort;
			let macd2ndLatestShort;
			let macdLatestShort;
			let existsMACDReversalShort = false;
			let keptMACDPositiveShort = false;

			// if there is enough ohlc data to calculate MACD
			if (!this.simulationMode && Math.max(macd_a, macd_b) + macd_c + 1 <= ohlcWeek.getTicks().length) {
				macdCurrentShort = parseFloat(ohlcWeek.getMACD(macd_a, macd_b, macd_c, null, 1, 'close'));
				macdPreviousShort = parseFloat(ohlcWeek.getMACD(macd_a, macd_b, macd_c, null, 2, 'close'));
				macdLatestShort = parseFloat(ohlcWeek.getMACD(macd_a, macd_b, macd_c, null, 0, 'close'));
				//macd2ndLatestShort = parseFloat(ohlcWeek.getMACD(macd_a, macd_b, macd_c, null, 1, 'close'));
				existsMACDReversalShort = macdCurrentShort > 0 && macdPreviousShort < 0;
				keptMACDPositiveShort = existsMACDReversalShort && macdLatestShort > 0; // && macd2ndLatestShort > 0 ;
			}else {
				macdCurrentShort = 'N/A';
				macdPreviousShort = 'N/A';
				macd2ndLatestShort = 'N/A';
				macdLatestShort = 'N/A';
			}
			report += this.l.i(`Short MACD current  ${macdCurrentShort}`, 2) + '\n';
			report += this.l.i(`Short MACD previous ${macdPreviousShort}`, 2) + '\n';
			//report += this.l.i(`Short MACD 2nd latest ${macd2ndLatestShort}`, 2) + '\n';
			report += this.l.i(`Short MACD latest ${macdLatestShort}`, 2) + '\n';
			report += this.l.i(`Short MACD reversal: ${existsMACDReversalShort}`, 2) + '\n';

			// for testing
			report += this.simulationMode ? this.l.d(`changeWeek: ${changeWeek}`, 2) + '\n' : '';

			let ohlcWeekHalf = new OHLC(assetPair, this.l, this.simulationMode);
			ohlcWeekHalf.setTicks(ohlcWeek.getTicksSince(3.5 * 86400));
			let changeWeekHalf = ohlcWeekHalf.getChange();
			let derivativeWeekHalf = ohlcWeekHalf.getDerivative();

			await sleep(this.sleepMillis);

			let ohlcMonth = await (OHLC.requestInterval(getOHLC, assetPair, ...FRAMES.month, this.l, this.simulationMode, this.simObjOHLCMonth));
			if (!ohlcMonth) {
				await sleep(this.sleepMillis);
				report += this.l.err(`Failed to get ohlcMonth!`, 2, true) + '\n';
				continue;
			}
			let changeMonth = ohlcMonth.getChange();
			let macdCurrent;
			let macdPrevious;
			let macd2ndLatest;
			let macdLatest;
			let existsMACDReversal = false;
			let keptMACDPositive = false;
			
			// if there is enough ohlc data to calculate MACD
			if (!this.simulationMode && Math.max(macd_a, macd_b) + macd_c + 3 <= ohlcMonth.getTicks().length) {
				macdCurrent = parseFloat(ohlcMonth.getMACD(macd_a, macd_b, macd_c, null, 1, 'close'));
				macdPrevious = parseFloat(ohlcMonth.getMACD(macd_a, macd_b, macd_c, null, 2, 'close'));
				macdLatest = parseFloat(ohlcMonth.getMACD(macd_a, macd_b, macd_c, null, 0, 'close'));
				//macd2ndLatest = parseFloat(ohlcMonth.getMACD(macd_a, macd_b, macd_c, null, 1, 'close'));
				existsMACDReversal = macdCurrent > 0 && macdPrevious < 0;
				keptMACDPositive = existsMACDReversal && macdLatest > 0; // && macd2ndLatest > 0;
			}else {
				macdCurrent = 'N/A';
				macdPrevious = 'N/A';
				macd2ndLatest = 'N/A';
				macdLatest = 'N/A';
			}

			report += this.l.i(`MACD current  ${macdCurrent}`, 2) + '\n';
			report += this.l.i(`MACD previous ${macdPrevious}`, 2) + '\n';
			// report += this.l.i(`MACD 2nd latest ${macd2ndLatest}`, 2) + '\n';
			report += this.l.i(`MACD latest ${macdLatest}`, 2) + '\n';
			report += this.l.i(`MACD reversal: ${existsMACDReversal}`, 2) + '\n';

			// 8-day EMA of the closes 1 to 8 days back, so the reference excludes the current day
			let dailyCloses = ohlcMonth.getClosesDaysBack(8);
			let eightDaysEMA = latestClosingPrice;
			if (dailyCloses.length >= 8) {
				let ohlcMonthPerDay = new OHLC(assetPair, this.l, this.simulationMode);
				ohlcMonthPerDay.setTicks(dailyCloses);
				eightDaysEMA = ohlcMonthPerDay.getEMA(8, null, 0, 'close');
			}
			let latestClosingPriceDiff8DaysEMAPercent = (latestClosingPrice - eightDaysEMA) / eightDaysEMA;

			// for testing
			report += this.simulationMode ? this.l.d(`changeMonth: ${changeMonth}`, 2) + '\n' : '';
			report += this.simulationMode ? this.l.d(`macdCurrent: ${macdCurrent}`, 2) + '\n' : '';
			report += this.simulationMode ? this.l.d(`eightDaysEMA: ${eightDaysEMA}`, 2) + '\n' : '';

			// look for a green hammer, inverted or normal, in the last three closed candles
			let isHammerTick = tick => tick.isGreen() && ( tick.isHammer() || tick.isInvertedHammer() );
			let recentClosedTicks = ohlcMonth.getClosed().getTicks().slice(-3);
			let isGreenHammer = recentClosedTicks.length > 0 && isHammerTick(recentClosedTicks[recentClosedTicks.length - 1]);
			let existsGreenHammer3h = recentClosedTicks.some(isHammerTick);

			// for testing
			report += this.simulationMode ? this.l.d(`isGreenHammer: ${isGreenHammer}`, 2) + '\n' : '';

			let ohlcMonthHalf = new OHLC(assetPair, this.l, this.simulationMode);
			ohlcMonthHalf.setTicks(ohlcMonth.getTicksSince(15 * 86400));
			let changeMonthHalf = ohlcMonthHalf.getChange();

			await sleep(this.sleepMillis);

			let macdCurrentLong;
			let macdPreviousLong;
			let macdLatestLong;
			let macdLongOffset0;
			let macdLongOffset1;
			let macdLongOffset2;
			let macdLongOffset3;
			let macdLongOffset4;
			let macdLongOffset5;
			let isOverbought = false;
			let existsMACDReversalLong = false;
			let keptMACDPositiveLong = false;

			// get OHLC for month in 4h intervals, to calculate MACD further back in the past
			let ohlcMonth4hIntervals = await (OHLC.requestInterval(getOHLC, assetPair, ...FRAMES.month4h, this.l, this.simulationMode, this.simObjOHLCMonth));
			if (!ohlcMonth4hIntervals) {
				await sleep(this.sleepMillis);
				report += this.l.err(`Failed to get ohlcMonth4hIntervals!`, 2, true) + '\n';
				continue;
			}
			// if there is enough ohlc data to calculate MACD
			// the overbought/oversold check reads the MACD down to offset 5
			if (!this.simulationMode && Math.max(macd_a, macd_b) + macd_c + 4 <= ohlcMonth4hIntervals.getTicks().length) {
				macdCurrentLong = parseFloat(ohlcMonth4hIntervals.getMACD(macd_a, macd_b, macd_c, null, 1, 'close'));
				macdPreviousLong = parseFloat(ohlcMonth4hIntervals.getMACD(macd_a, macd_b, macd_c, null, 2, 'close'));
				macdLatestLong = parseFloat(ohlcMonth4hIntervals.getMACD(macd_a, macd_b, macd_c, null, 0, 'close'));
				existsMACDReversalLong = macdCurrentLong > 0 && macdPreviousLong < 0;
				keptMACDPositiveLong = existsMACDReversalLong && macdLatestLong > 0;

				macdLongOffset0 = macdLatestLong;
				macdLongOffset1 = macdCurrentLong;
				macdLongOffset2 = macdPreviousLong;
				macdLongOffset3 = parseFloat(ohlcMonth4hIntervals.getMACD(macd_a, macd_b, macd_c, null, 3, 'close'));
				macdLongOffset4 = parseFloat(ohlcMonth4hIntervals.getMACD(macd_a, macd_b, macd_c, null, 4, 'close'));
				macdLongOffset5 = parseFloat(ohlcMonth4hIntervals.getMACD(macd_a, macd_b, macd_c, null, 5, 'close'));
				isOverbought = (
					(macdLongOffset0 < macdLongOffset1 && macdLongOffset1 > macdLongOffset2 && macdLongOffset2 > macdLongOffset3 && macdLongOffset3 > 0) ||
					(macdLongOffset1 < macdLongOffset2 && macdLongOffset2 > macdLongOffset3 && macdLongOffset3 > macdLongOffset4 && macdLongOffset4 > 0) ||
					(macdLongOffset2 < macdLongOffset3 && macdLongOffset3 > macdLongOffset4 && macdLongOffset4 > macdLongOffset5 && macdLongOffset5 > 0)
					);

			}else {
				macdCurrentLong = 'N/A';
				macdPreviousLong = 'N/A';
				macdLatestLong = 'N/A';
			}
			report += this.l.i(`Long MACD current  ${macdCurrentLong}`, 2) + '\n';
			report += this.l.i(`Long MACD previous ${macdPreviousLong}`, 2) + '\n';
			report += this.l.i(`Long MACD latest ${macdLatestLong}`, 2) + '\n';
			report += this.l.i(`Long MACD reversal: ${existsMACDReversalLong}`, 2) + '\n';


			let lowestCloseWeek = ohlcWeek.getLowestClose().close;

			// for testing
			report += this.simulationMode ? this.l.d(`lowestCloseWeek: ${lowestCloseWeek}`, 2) + '\n' : '';

			let priceOverLowestWeek = 0;
			if ( lowestCloseWeek > 0) {
				priceOverLowestWeek = ( ohlcDay24h.ticks[ohlcDay24h.ticks.length -1].close - lowestCloseWeek ) / lowestCloseWeek;
			}

			// for testing
			report += this.simulationMode ? this.l.d(`priceOverLowestWeek: ${priceOverLowestWeek}`, 2) + '\n' : '';

			let highestCloseWeek = ohlcWeek.getHighestClose().close;

			// for testing
			report += this.simulationMode ? this.l.d(`highestCloseWeek: ${highestCloseWeek}`, 2) + '\n' : '';

			let priceOverHighestWeek = 0;
			if ( highestCloseWeek > 0) {
				priceOverHighestWeek = ( highestCloseWeek - ohlcDay24h.ticks[ohlcDay24h.ticks.length -1].close ) / highestCloseWeek;
			}

			// for testing
			report += this.simulationMode ? this.l.d(`priceOverHighestWeek: ${priceOverHighestWeek}`, 2) + '\n' : '';

			let lowestCloseMonth = ohlcMonth.getLowestClose().close;
			let priceOverLowestMonth = 0;
			if ( lowestCloseMonth > 0) {
				priceOverLowestMonth = ( ohlcDay24h.ticks[ohlcDay24h.ticks.length -1].close - lowestCloseMonth ) / lowestCloseMonth;
			}
			let highestCloseMonth = ohlcMonth.getHighestClose().close;
			let priceOverHighestMonth = 0;
			if ( highestCloseMonth > 0) {
				priceOverHighestMonth = ( highestCloseMonth - ohlcDay24h.ticks[ohlcDay24h.ticks.length -1].close ) / highestCloseMonth;
			}

			let isCandidate = false;
			let candidateGrade = -1;
			let currAssetReport = '';
			let currAssetResult = {};

			// Risk filters, independent of the MACD/OBV signal: they protect the stop-loss sizing and avoid chasing or illiquid pairs.
			let atrValues = atrSeries(ohlcMonth.getTicks(), 14);
			let latestAtr = atrValues[atrValues.length - 1];
			let atrPercent = typeof latestAtr === 'number' && latestClosingPrice > 0 ? latestAtr / latestClosingPrice * 100 : null;
			let dailyQuoteVolume = ohlcDay24h.getTicks().reduce((sum, tick) => sum + tick.vol * (tick.volWavgPrice > 0 ? tick.volWavgPrice : tick.close), 0);
			let riskFilterFailures = [];
			if (changeDay24h * 100 >= this.strategy.maxSurgePercent) riskFilterFailures.push(`already up ${prcnt(changeDay24h)}% in 24h`);
			if (this.strategy.atrStopMultiple > 0 && atrPercent !== null && atrPercent > this.strategy.stopLossPercent / this.strategy.atrStopMultiple) {
				riskFilterFailures.push(`1H ATR ${atrPercent.toFixed(2)}% is too large for a ${this.strategy.stopLossPercent}% stop-loss`);
			}
			if (dailyQuoteVolume < this.strategy.minDailyQuoteVolume) riskFilterFailures.push(`24h traded volume ${dailyQuoteVolume.toFixed(0)} is below ${this.strategy.minDailyQuoteVolume}`);

			// Recommendation Conditions

			// On-Balance Vol > 0 AND
			// price dropping rate in 3h/6h more than it dropped in 6h/12h AND
			// price not the lowest/highest of the month AND
			// price not the highest of the week AND
			// MACD went positive

			let meetsSignalRules = (
				(!isOverbought) &&
				(onBalanceVol3h > 0) &&
				(
					(change3h < 0 && change6h < 0) ||
					(change6h < 0 && change12h < 0)
				) &&
				(existsMACDReversal || existsMACDReversalShort) &&
				(keptMACDPositive || keptMACDPositiveShort)
			);

			if (meetsSignalRules && riskFilterFailures.length) {
				report += this.l.w(`${asset} has a MACD/OBV signal but is blocked by risk filters: ${riskFilterFailures.join('; ')}.`, 2, true) + '\n';
			}
			if (meetsSignalRules && !riskFilterFailures.length) {
				isCandidate = true;
				candidateGrade = 1;
			}

			if (isCandidate || onDemandAsset) {

				// penalty: negative change increasing (short-term)
				if (change6h < 0 && change12h < change6h && change12h <= -0.03) {
					candidateGrade -= 0.2;
				}else if (change3h < 0 && change6h < change3h && change6h <= -0.03) {
					candidateGrade -= 0.15;
				}

				// penalty: negative change increasing (mid-term)
				if (changeDay24h < 0 && changeWeekHalf < changeDay24h && changeWeekHalf <= -0.05) {
					candidateGrade -= 0.3;
				}else if (change12h < 0 && changeDay24h < change12h && changeDay24h <= -0.04) {
					candidateGrade -= 0.25;
				}

				// penalty: negative change increasing (long-term)
				if (changeWeek < 0 && changeMonthHalf < changeWeek && changeMonthHalf <= -0.07) {
					candidateGrade -= 0.4;
				}else if (changeWeekHalf < 0 && changeWeek < changeWeekHalf && changeWeek <= -0.07) {
					candidateGrade -= 0.35;
				}

				// bonus: if asset price difference to 8-days EMA <= -3%
				if 	(latestClosingPriceDiff8DaysEMAPercent <= -0.03) {
					candidateGrade += 0.41;
				}

				// bonus: green hammer, only when price sits near the week's low, where a hammer has meaning
				if (existsGreenHammer3h && priceOverLowestWeek <= this.strategy.hammerSupportPercent / 100) {
					candidateGrade += 0.25;
				}

				// bonus: MACD reversal confirmed on several timeframes ranks first when only one position is allowed
				let timeframesAligned = [existsMACDReversalShort && keptMACDPositiveShort, existsMACDReversal && keptMACDPositive, existsMACDReversalLong && keptMACDPositiveLong].filter(Boolean).length;
				if (timeframesAligned > 1) {
					candidateGrade += 0.1 * (timeframesAligned - 1);
				}

				// // exclude too high grades
				// if (candidateGrade >= 5) {
				// 	isCandidate = false;
				// 	if (!onDemandAsset) continue;
				// }

				currAssetResult = new Candidate({
					name: asset,
					baseCurrency: this.baseCurrency,
					latestClosingPrice,
					eightDaysEMA,
					onBalanceVol3h,
					candidateGrade,
					existsGreenHammer3h,
					macdCurrent,
					macdPrevious,
					macdCurrentLong,
					macdPreviousLong,
					macdCurrentShort,
					macdPreviousShort,
					existsMACDReversal,
					existsMACDReversalLong,
					existsMACDReversalShort,
					keptMACDPositive,
					keptMACDPositiveLong,
					keptMACDPositiveShort,
					isOverbought,
					changePastHour,
					change3h,
					change6h,
					change12h,
					changeDay24h,
					changeWeekHalf,
					changeWeek,
					changeMonthHalf,
					changeMonth,
					priceOverLowestWeek,
					priceOverHighestWeek,
					priceOverLowestMonth,
					priceOverHighestMonth,
					atrPercent,
					timeframesAligned,
					report: ""
				});

				report += isCandidate ? this.l.suc(`It's a candidate!`, 2, true) + '\n' : '';
				report += this.l.suc(`Candidate grade: ${currAssetResult.candidateGrade.toFixed(3)}`, 2, true) + '\n';

				currAssetReport = this.l.i(`${asset}: ${prcnt(currAssetResult.changePastHour)}%1h ${prcnt(currAssetResult.change3h)}%3h ${prcnt(currAssetResult.change6h)}%6h ${prcnt(currAssetResult.change12h)}%12h ${prcnt(currAssetResult.changeDay24h)}%24h ${prcnt(currAssetResult.changeWeekHalf)}%Wh ${prcnt(currAssetResult.changeWeek)}%W ${prcnt(currAssetResult.changeMonthHalf)}%Mh ${prcnt(currAssetResult.changeMonth)}%M`, 2) + '\n';
				currAssetReport += this.l.i(`${asset} price is: \n${prcnt(currAssetResult.priceOverLowestWeek)}% > week lowest,\n${prcnt(currAssetResult.priceOverHighestWeek)}% < week highest,\n${prcnt(currAssetResult.priceOverLowestMonth)}% > month lowest,\n${prcnt(currAssetResult.priceOverHighestMonth)}% < month highest.`, 2) + '\n';
				currAssetReport += this.l.i(`${asset} close is: ${currAssetResult.latestClosingPrice}\n8-days EMA is: ${currAssetResult.eightDaysEMA} (${prcnt(latestClosingPriceDiff8DaysEMAPercent)}%)`, 2) + '\n';
				currAssetReport += this.l.i(`${asset} green hammer: ${currAssetResult.existsGreenHammer3h}`, 2) + '\n';
				currAssetReport += this.l.i(`${asset} grade: ${currAssetResult.candidateGrade.toFixed(3)}`, 2) + '\n';
				currAssetReport += this.l.i(`${asset} MACD short/regular/long reversal: ${currAssetResult.existsMACDReversalShort}/${currAssetResult.existsMACDReversal}/${currAssetResult.existsMACDReversalLong}`, 2) + '\n';
				currAssetReport += this.l.i(`${asset} MACD short/regular/long kept + : ${currAssetResult.keptMACDPositiveShort}/${currAssetResult.keptMACDPositive}/${currAssetResult.keptMACDPositiveLong}`, 2) + '\n';
				currAssetReport += this.l.i(`${asset} On-Balance Volume 3h: ${currAssetResult.onBalanceVol3h.toFixed(3)}`, 2) + '\n';
				currAssetReport += this.l.i(`${asset} is overbought: ${currAssetResult.isOverbought}`, 2) + '\n';

				currAssetResult.report = currAssetReport;
				report += currAssetReport;
				currAssetReport = '';

				if (isCandidate) {
					assetResults.push(currAssetResult);
				}

				assetResults.sort(function (a, b) {
					return b.candidateGrade - a.candidateGrade;
				});

				if (!onDemandAsset) {
					let writtenReport = assetResults.length ? bitcoinAnalysisReportPart : '';
					assetResults.forEach(element => {
						writtenReport += element.report;
					});

					fs.writeFile(reportFilePath, writtenReport, err => { if (err) this.l.err(err, 0, true); });
				}
			}
			report += this.l.i(`EVALUATING ASSET: ${asset} - END`, 1) + '\n';
			if (onDemandAsset) { break; }
		}
		report += onDemandAsset ? this.l.i(`ON-DEMAND ASSET RECOMMENDATION ANALYSIS - END`) + '\n' : this.l.i(`ASSET RECOMMENDATION ANALYSIS CYCLE - END`) + '\n';

		if (isEmpty(assetResults) && !onDemandAsset) {
			fs.writeFile(reportFilePath, '', err => { if (err) this.l.err(err, 0, true); });
		}

		this.report = report;
		return assetResults;
	}

}

export default Analysis;
