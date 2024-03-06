import fs, { exists } from 'fs';
import OHLC from './OHLC.js';
import Candidate from './Candidate.js';
import { sleep, prcnt, isEmpty } from './utils.js';

class Analysis {

	constructor(assets, maxNumOHLCResults, baseCurrency, loggerObj, simulationMode=false) {
		this.assets = assets;
		this.maxNumOHLCResults = maxNumOHLCResults;
		this.baseCurrency = baseCurrency;
		this.l = loggerObj;
		this.report = '';
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
		let pastHour = new Date();
		pastHour.setHours(pastHour.getHours() - 1);
		let ohlcPastHour = await (OHLC.request(getOHLC, 'BTCEUR', pastHour.toISOString(), this.maxNumOHLCResults, this.l, this.simulationMode, this.simObjOHLCBitcoin));
		if (!ohlcPastHour) return { result: 'failure' };
		
		let latestClosingPrice = ohlcPastHour.getTicks()[ohlcPastHour.getTicks().length - 1].close;
		await sleep(this.sleepMillis);

		let month = new Date();
		month.setHours(month.getHours() - 24*30);
		// get OHLC for month in 4h intervals, to calculate MACD further back in the past
		let ohlcMonth4hIntervals = await (OHLC.request(getOHLC, 'BTCEUR', month.toISOString(), Math.ceil(this.maxNumOHLCResults/4), this.l, this.simulationMode, this.simObjOHLCMonth));
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
		if (Math.max(macd_a, macd_b) + macd_c + 2 <= ohlcMonth4hIntervals.getTicks().length) {
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

		let ohlcMonth = await (OHLC.request(getOHLC, 'BTCEUR', month.toISOString(), this.maxNumOHLCResults, this.l, this.simulationMode, this.simObjOHLCMonth));
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

		let sixMonths = new Date();
		sixMonths.setHours(sixMonths.getHours() - 6*24*30);
		let ohlc6Months = await (OHLC.request(getOHLC, 'BTCEUR', sixMonths.toISOString(), this.maxNumOHLCResults, this.l, this.simulationMode, this.simObjOHLCBitcoin));
		if (!ohlc6Months) return { result: "failure" };
		await sleep(this.sleepMillis);

		let day24Hours = new Date();
		day24Hours.setHours(day24Hours.getHours() - 24);
		let ohlc24Hours = await (OHLC.request(getOHLC, 'BTCEUR', day24Hours.toISOString(), this.maxNumOHLCResults, this.l, this.simulationMode, this.simObjOHLCBitcoin));
		if (!ohlc24Hours) return { result: "failure" };

		let eightDaysEMA = ohlc6Months.getEMA(8, null, 0, 'close');
		let latestClosingPriceDiff8DaysEMAPercent = (latestClosingPrice - eightDaysEMA) / eightDaysEMA;

		await sleep(this.sleepMillis);
		return {result: 'success',
				eightDaysEMA: eightDaysEMA,
				latestClosingPriceDiff8DaysEMAPercent: latestClosingPriceDiff8DaysEMAPercent,
				latestClosingPriceDiffYesterdaysPercent: ohlc24Hours.getChange(),
				isOverSold: isOverSold,
				existsMACDReversal: existsMACDReversal,
				keptMACDPositive: keptMACDPositive,
				existsMACDReversalLong: existsMACDReversalLong,
				keptMACDPositiveLong: keptMACDPositiveLong
				};

	}

	async recommend(getOHLC, reportFilePath, onDemandAsset=null) {

		if (onDemandAsset && !this.assets.includes(onDemandAsset)) {
			let report = this.l.err(`ASSET: ${onDemandAsset} NOT FOUND.`) + '\n';
			this.report = report;
			return [];
		}

		let report = onDemandAsset ? this.l.i(`ON-DEMAND ASSET RECOMMENDATION ANALYSIS - START`) + '\n' : this.l.i(`ASSET RECOMMENDATION ANALYSIS CYCLE - START`) + '\n';
		let bitcoinAnalysis = await this.analyseBitcoin(getOHLC);
		this.bitcoinAnalysis = bitcoinAnalysis;
		let isBTCBullish = bitcoinAnalysis.result == 'success' && (bitcoinAnalysis.latestClosingPriceDiff8DaysEMAPercent >= 0.01 || bitcoinAnalysis.latestClosingPriceDiffYesterdaysPercent >= 0.01);
		let isBTCBearish = bitcoinAnalysis.result == 'success' && (bitcoinAnalysis.latestClosingPriceDiff8DaysEMAPercent <= -0.01 || bitcoinAnalysis.latestClosingPriceDiffYesterdaysPercent <= -0.01);
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

		report += bitcoinAnalysisReportPart;
		
		let pastHour = new Date();
		pastHour.setHours(pastHour.getHours() - 1);
		let past6h = new Date();
		past6h.setHours(past6h.getHours() - 6);
		let day24h = new Date();
		day24h.setHours(day24h.getHours() - 24);
		let week = new Date();
		week.setHours(week.getHours() - 24*7);
		let month = new Date();
		month.setHours(month.getHours() - 24*30);
		let quarter = new Date();
		quarter.setHours(quarter.getHours() - 24*30*3);

		let assetResults = [];

		for (let i=0; i < this.assets.length; i++) {
			let asset = onDemandAsset ? onDemandAsset : this.assets[i];
			let assetPair = `${asset}${this.baseCurrency}`;

			report += this.l.i(`EVALUATING ASSET: ${asset} - START`, 1) + '\n';

			let ohlcPastHour = await (OHLC.request(getOHLC, assetPair, pastHour.toISOString(), this.maxNumOHLCResults, this.l, this.simulationMode, this.simObjOHLCPastHour));
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

			let ohlc6h = await (OHLC.request(getOHLC, assetPair, past6h.toISOString(), this.maxNumOHLCResults, this.l, this.simulationMode, this.simObjOHLC6h));
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
			ohlc3h.setTicks(ohlc6h.getTicks().slice(Math.ceil(ohlc6h.getTicks().length/2), ohlc6h.getTicks().length));
			let change3h = ohlc3h.getChange();
			let derivative3h = ohlc3h.getDerivative();
			let onBalanceVol3h = ohlc3h.getOnBalanceVol();

			report += this.l.i(`On-Balance Volume 3h: ${onBalanceVol3h}`, 2) + '\n';

			await sleep(this.sleepMillis);

			let ohlcDay24h = await (OHLC.request(getOHLC, assetPair, day24h.toISOString(), this.maxNumOHLCResults, this.l, this.simulationMode, this.simObjOHLCDay24h));
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
			ohlc12h.setTicks(ohlcDay24h.getTicks().slice(Math.ceil(ohlcDay24h.getTicks().length/2), ohlcDay24h.getTicks().length));
			let change12h = ohlc12h.getChange();
			let derivative12h = ohlc12h.getDerivative();

			await sleep(this.sleepMillis);

			let ohlcWeek = await (OHLC.request(getOHLC, assetPair, week.toISOString(), this.maxNumOHLCResults, this.l, this.simulationMode, this.simObjOHLCWeek));
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
			ohlcWeekHalf.setTicks(ohlcWeek.getTicks().slice(Math.ceil(ohlcWeek.getTicks().length/2), ohlcWeek.getTicks().length));
			let changeWeekHalf = ohlcWeekHalf.getChange();
			let derivativeWeekHalf = ohlcWeekHalf.getDerivative();

			await sleep(this.sleepMillis);

			let ohlcMonth = await (OHLC.request(getOHLC, assetPair, month.toISOString(), this.maxNumOHLCResults, this.l, this.simulationMode, this.simObjOHLCMonth));
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

			let ohlcMonthPerDay = new OHLC(assetPair, this.l, this.simulationMode);
			let ohlcMonthTicks = ohlcMonth.getTicks();
			let ohlcMonthPerDayTicks = [];
			for(let i=0; i<ohlcMonthTicks.length; i+=24) {
				if (i<ohlcMonthTicks.length) ohlcMonthPerDayTicks.push(ohlcMonthTicks[i]);
			}
			ohlcMonthPerDay.setTicks(ohlcMonthPerDayTicks);

			let eightDaysEMA = ohlcMonthPerDay.getEMA(8, null, 0, 'close');
			let latestClosingPriceDiff8DaysEMAPercent = (latestClosingPrice - eightDaysEMA) / eightDaysEMA;

			// for testing
			report += this.simulationMode ? this.l.d(`changeMonth: ${changeMonth}`, 2) + '\n' : '';
			report += this.simulationMode ? this.l.d(`macdCurrent: ${macdCurrent}`, 2) + '\n' : '';
			report += this.simulationMode ? this.l.d(`eightDaysEMA: ${eightDaysEMA}`, 2) + '\n' : '';

			// look for a green hammer, inverted or normal, in the past 3 hours
			let ohlcMonthLastTick = ohlcMonth.getLastTick();
			let isGreenHammer = ohlcMonthLastTick.isGreen() && ( ohlcMonthLastTick.isHammer() || ohlcMonthLastTick.isInvertedHammer() );

			let ohlcMonth2ndLastTick = ohlcMonth.getTicks()[ohlcMonth.getTicks().length - 2];
			let isGreenHammer2 = ohlcMonth2ndLastTick.isGreen() && ( ohlcMonth2ndLastTick.isHammer() || ohlcMonth2ndLastTick.isInvertedHammer() );

			let ohlcMonth3rdLastTick = ohlcMonth.getTicks()[ohlcMonth.getTicks().length - 3];
			let isGreenHammer3 = ohlcMonth3rdLastTick.isGreen() && ( ohlcMonth3rdLastTick.isHammer() || ohlcMonth3rdLastTick.isInvertedHammer() );

			let existsGreenHammer3h = isGreenHammer || isGreenHammer2 || isGreenHammer3;

			// for testing
			report += this.simulationMode ? this.l.d(`isGreenHammer: ${isGreenHammer}`, 2) + '\n' : '';

			let ohlcMonthHalf = new OHLC(assetPair, this.l, this.simulationMode);
			ohlcMonthHalf.setTicks(ohlcMonth.getTicks().slice(Math.ceil(ohlcMonth.getTicks().length/2), ohlcMonth.getTicks().length));
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
			let ohlcMonth4hIntervals = await (OHLC.request(getOHLC, assetPair, month.toISOString(), Math.ceil(this.maxNumOHLCResults/4), this.l, this.simulationMode, this.simObjOHLCMonth));
			if (!ohlcMonth4hIntervals) {
				await sleep(this.sleepMillis);
				report += this.l.err(`Failed to get ohlcMonth4hIntervals!`, 2, true) + '\n';
				continue;
			}
			// if there is enough ohlc data to calculate MACD
			if (!this.simulationMode && Math.max(macd_a, macd_b) + macd_c + 2 <= ohlcMonth4hIntervals.getTicks().length) {
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

			// Recommendation Conditions

			// On-Balance Vol > 0 AND
			// price dropping rate in 3h/6h more than it dropped in 6h/12h AND
			// price not the lowest/highest of the month AND
			// price not the highest of the week AND
			// MACD went positive

			if (
				(!isOverbought) &&
				(onBalanceVol3h > 0) &&
				(
					(change3h < 0 && change6h < 0) ||
					(change6h < 0 && change12h < 0)
				) &&
				// (priceOverHighestMonth >= 0.04) &&
				// (priceOverLowestMonth >= 0.04) &&
				// (priceOverHighestWeek >= 0.04) &&
				(existsMACDReversal || existsMACDReversalShort) &&
				(keptMACDPositive || keptMACDPositiveShort)
			) {
				isCandidate = true;
				candidateGrade = 1;
			}

			if (isCandidate || onDemandAsset) {

				// bonus: negative change increasing (short-term)
				if (change6h < 0 && change12h < change6h && change12h <= -0.03) {
					candidateGrade += 3;
				}else if (change3h < 0 && change6h < change3h && change6h <= -0.03) {
					candidateGrade += 2.5;
				}

				// bonus: negative change increasing (mid-term)
				if (changeDay24h < 0 && changeWeekHalf < changeDay24h && changeWeekHalf <= -0.05) {
					candidateGrade += 2;
				}else if (change12h < 0 && changeDay24h < change12h && changeDay24h <= -0.04) {
					candidateGrade += 1.75;
				}

				// bonus: negative change increasing (long-term)
				if (changeWeek < 0 && changeMonthHalf < changeWeek && changeMonthHalf <= -0.07) {
					candidateGrade += 1.5;
				}else if (changeWeekHalf < 0 && changeWeek < changeWeekHalf && changeWeek <= -0.07) {
					candidateGrade += 1.25;
				}

				// bonus: if asset price difference to 8-days EMA <= -3%
				if 	(latestClosingPriceDiff8DaysEMAPercent <= -0.03) {
					candidateGrade += 0.41;
				}

				// bonus: green hammer
				// if (existsGreenHammer3h) {
				// 	candidateGrade += 0.25;
				// }

				// exclude too high grades
				if (candidateGrade > 4) {
					isCandidate = false;
					if (!onDemandAsset) continue;
				}

				currAssetResult = new Candidate(
					asset,
					this.baseCurrency,
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
					""
				);

				report += isCandidate ? this.l.suc(`It's a candidate!`, 2, true) + '\n' : '';
				report += this.l.suc(`Candidate grade: ${currAssetResult.candidateGrade.toFixed(3)}`, 2, true) + '\n';

				currAssetReport = this.l.i(`${asset}: ${prcnt(currAssetResult.changePastHour)}%1h ${prcnt(currAssetResult.change3h)}%3h ${prcnt(currAssetResult.change6h)}%6h ${prcnt(currAssetResult.change12h)}%12h ${prcnt(currAssetResult.changeDay24h)}%24h ${prcnt(currAssetResult.changeWeekHalf)}%Wh ${prcnt(currAssetResult.changeWeek)}%W ${prcnt(currAssetResult.changeMonthHalf)}%Mh ${prcnt(currAssetResult.changeMonth)}%M`, 2) + '\n';
				currAssetReport += this.l.i(`${asset} price is: \n${prcnt(currAssetResult.priceOverLowestWeek)}% > week lowest,\n${prcnt(currAssetResult.priceOverHighestWeek)}% < week highest,\n${prcnt(currAssetResult.priceOverLowestMonth)}% > month lowest,\n${prcnt(currAssetResult.priceOverHighestMonth)}% < month highest.`, 2) + '\n';
				currAssetReport += this.l.i(`${asset} close is: ${currAssetResult.latestClosingPrice}\n8-days EMA is: ${currAssetResult.eightDaysEMA} (${prcnt(latestClosingPriceDiff8DaysEMAPercent)}%)`, 2) + '\n';
				currAssetReport += this.l.i(`${asset} green hammer: ${currAssetResult.existsGreenHammer3h}`, 2) + '\n';
				currAssetReport += this.l.i(`${asset} grade: ${currAssetResult.candidateGrade.toFixed(3)}`, 2) + '\n';
				currAssetReport += this.l.i(`${asset} MACD short/regular/long reversal: ${currAssetResult.existsMACDReversalShort}/${currAssetResult.existsMACDReversal}/${currAssetResult.existsMACDReversalLong}`, 2) + '\n';
				currAssetReport += this.l.i(`${asset} MACD short/regular/long kept + : ${currAssetResult.keptMACDPositiveShort}/${currAssetResult.keptMACDPositive}/${currAssetResult.keptMACDPositiveLong}`, 2) + '\n';
				currAssetReport += this.l.i(`${asset} On-Balance Volume 3h: ${currAssetResult.onBalanceVol3h}`, 2) + '\n';
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

					fs.writeFile(reportFilePath, writtenReport, function(err) { if (err) this.l.err(err, 0, true); } );
				}
			}
			report += this.l.i(`EVALUATING ASSET: ${asset} - END`, 1) + '\n';
			if (onDemandAsset) { break; }
		}
		report += onDemandAsset ? this.l.i(`ON-DEMAND ASSET RECOMMENDATION ANALYSIS - END`) + '\n' : this.l.i(`ASSET RECOMMENDATION ANALYSIS CYCLE - END`) + '\n';

		if (isEmpty(assetResults) && !onDemandAsset) {
			fs.writeFile(reportFilePath, '', function(err) { if (err) this.l.err(err, 0, true); } );
		}

		this.report = report;
		return assetResults;
	}

}

export default Analysis;
