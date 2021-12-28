import fs from 'fs';
import OHLC from './OHLC.js';
import { sleep, prcnt } from './utils.js';

class Analysis {

	constructor(assets, maxNumOHLCResults, baseCurrency, loggerObj, simulationMode=false) {
		this.assets = assets;
		this.maxNumOHLCResults = maxNumOHLCResults;
		this.baseCurrency = baseCurrency;
		this.l = loggerObj;
		this.simulationMode = simulationMode;
		this.simObjOHLCPastHour = {};
		this.simObjOHLC6h = {};
		this.simObjOHLCDay24h = {};
		this.simObjOHLCWeek = {};
		this.simObjOHLCMonth = {};
		this.simObjOHLCQuarter = {};
	}

	setSims(simObjOHLCPastHour, simObjOHLC6h, simObjOHLCDay24h, simObjOHLCWeek, simObjOHLCMonth, simObjOHLCQuarter) {
		this.simObjOHLCPastHour = simObjOHLCPastHour;
		this.simObjOHLC6h = simObjOHLC6h;
		this.simObjOHLCDay24h = simObjOHLCDay24h;
		this.simObjOHLCWeek = simObjOHLCWeek;
		this.simObjOHLCMonth = simObjOHLCMonth;
		this.simObjOHLCQuarter = simObjOHLCQuarter;
	}

	async recommend(getOHLC, reportFilePath) {

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
		let report = "";
		let assetResults = [];
		for (let i=0; i < this.assets.length; i++) {
			let asset = this.assets[i];
			let assetPair = `${asset}${this.baseCurrency}`;

			report = this.l.i(`EVALUATING ASSET: ${asset} - START`) + '\n';

			let ohlcPastHour = await (OHLC.request(getOHLC, assetPair, pastHour.toISOString(), this.maxNumOHLCResults, this.l, this.simulationMode));
			let changePastHour = ohlcPastHour.getChange();

			await sleep(1000);

			let ohlc6h = await (OHLC.request(getOHLC, assetPair, past6h.toISOString(), this.maxNumOHLCResults, this.l, this.simulationMode));
			let change6h = ohlc6h.getChange();

			let ohlc3h = new OHLC(assetPair, this.l, this.simulationMode, null);
			ohlc3h.setTicks(ohlc6h.ticks.slice(0, Math.ceil(ohlc6h.getTicks().length/2)));
			let change3h = ohlc3h.getChange();

			await sleep(1000);

			let ohlcDay24h = await (OHLC.request(getOHLC, assetPair, day24h.toISOString(), this.maxNumOHLCResults, this.l, this.simulationMode));
			let changeDay24h = ohlcDay24h.getChange();

			let ohlc12h = new OHLC(assetPair, this.l, this.simulationMode);
			ohlc12h.setTicks(ohlcDay24h.ticks.slice(0, Math.ceil(ohlcDay24h.getTicks().length/2)));
			let change12h = ohlc12h.getChange();

			await sleep(1000);

			let ohlcWeek = await (OHLC.request(getOHLC, assetPair, week.toISOString(), this.maxNumOHLCResults, this.l, this.simulationMode));
			let changeWeek = ohlcWeek.getChange();

			let ohlcWeekHalf = new OHLC(assetPair, this.l, this.simulationMode);
			ohlcWeekHalf.setTicks(ohlcWeek.ticks.slice(0, Math.ceil(ohlcWeek.getTicks().length/2)));
			let changeWeekHalf = ohlcWeekHalf.getChange();

			await sleep(1000);

			let ohlcMonth = await (OHLC.request(getOHLC, assetPair, month.toISOString(), this.maxNumOHLCResults, this.l, this.simulationMode));
			let changeMonth = ohlcMonth.getChange();
			let candleStickScore = ohlcMonth.getCandleStickScore();

			let ohlcMonthHalf = new OHLC(assetPair, this.l, this.simulationMode);
			ohlcMonthHalf.setTicks(ohlcMonth.ticks.slice(0, Math.ceil(ohlcMonth.getTicks().length/2)));
			let changeMonthHalf = ohlcMonthHalf.getChange();

			await sleep(1000);

			let ohlcQuarter = await (OHLC.request(getOHLC, assetPair, quarter.toISOString(), this.maxNumOHLCResults, this.l, this.simulationMode));
			let changeQuarter = ohlcQuarter.getChange();

			let ohlcQuarterHalf = new OHLC(assetPair, this.l, this.simulationMode);
			ohlcQuarterHalf.setTicks(ohlcQuarter.ticks.slice(0, Math.ceil(ohlcQuarter.getTicks().length/2)));
			let changeQuarterHalf = ohlcQuarterHalf.getChange();

			await sleep(1000);

			let lowestCloseWeek = ohlcWeek.getLowestClose().close;
			let priceOverLowestWeek = 0;
			if ( lowestCloseWeek > 0) {
				priceOverLowestWeek = ( ohlcDay24h.ticks[ohlcDay24h.ticks.length -1].close - lowestCloseWeek ) / lowestCloseWeek;
			}
			let highestCloseWeek = ohlcWeek.getHighestClose().close;
			let priceOverHighestWeek = 0;
			if ( highestCloseWeek > 0) {
				priceOverHighestWeek = ( highestCloseWeek - ohlcDay24h.ticks[ohlcDay24h.ticks.length -1].close ) / highestCloseWeek;
			}
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
			let currAssetReport = "";
			let currAssetResult = {};
			if (
					(
						(change3h <= -0.1 || change6h <= -0.1 || change12h <= -0.1 || changeDay24h <= -0.1 || changeWeekHalf <= -0.1 || changeWeek <= -0.1)
						&& candleStickScore >= 0.005
						&& changeQuarter > 0
					) ||
					(
						(
						(changePastHour <= 0.02 && change3h < 0 && change6h < 0 && change12h < 0 && changeDay24h < -0.05 && changeWeekHalf < 0)
						||

						(change3h < 0.02 && change6h < 0 && change12h < 0 && changeDay24h < -0.05 && changeWeekHalf < 0 && changeWeek > 0)
						||

						(change6h < 0.02 && change12h < 0 && changeDay24h < -0.05 && changeWeekHalf < 0 && changeWeek < 0 && changeMonthHalf > 0)
						||

						(change12h < 0.02 && changeDay24h < -0.05 && changeWeekHalf < 0 && changeWeek < 0 && changeMonthHalf < 0 && changeMonth > 0)
						||

						(changeDay24h < -0.05 && changeWeekHalf < 0 && changeWeek < 0 && changeMonthHalf < 0 && changeMonth < 0 && changeQuarterHalf > 0)
						||

						(changeWeekHalf < 0.05 && changeWeek < 0 && changeMonthHalf < 0 && changeMonth < 0 && changeQuarterHalf < 0 && changeQuarter > 0)
						)
						&&
						(priceOverHighestWeek > 0.2 || priceOverHighestMonth > 0.3)
					)
				)
			{
				isCandidate = true;
				currAssetResult = {name: asset, score: 0, candleStickScore: candleStickScore, report: "", changePastHour: changePastHour, changeDay24h: changeDay24h, changeWeek: changeWeek, changeMonth: changeMonth, changeQuarter: changeQuarter, priceOverHighestWeek: priceOverHighestWeek, priceOverHighestMonth: priceOverHighestMonth};

				if ((change3h <= -0.1 || change6h <= -0.1 || change12h <= -0.1 || changeDay24h <= -0.1 || changeWeekHalf <= -0.1 || changeWeek <= -0.1)
					&& candleStickScore >= 0
					&& changeQuarter > 0) {
					currAssetReport = this.l.i(`${asset}: ${prcnt(changeDay24h)}%24h with candlestick score ${candleStickScore}`, 1) + '\n';
					currAssetResult.score = 0.5 * Math.abs(Math.min(change3h, change6h, change12h, changeDay24h, changeWeekHalf, changeWeek)) + 0.5 * candleStickScore * 100;

				}else if (changePastHour <= 0.02 && change3h < 0 && change6h < 0 && change12h < 0 && changeDay24h < -0.05 && changeWeekHalf < 0) {
					currAssetReport = this.l.i(`${asset}: ${prcnt(changePastHour)}%1h ${prcnt(change3h)}%3h ${prcnt(change6h)}%6h ${prcnt(change12h)}%12h ${prcnt(changeDay24h)}%24h ${prcnt(changeWeekHalf)}%Wh`, 1) + '\n';
					currAssetResult.score = 0.30 * Math.abs(changePastHour) + 0.25 * Math.abs(change3h) + 0.20 * Math.abs(change6h) + 0.15 * Math.abs(change12h) + 0.05 * Math.abs(changeDay24h) + 0.05 * Math.abs(changeWeekHalf);

				}else if (change3h < 0.02 && change6h < 0 && change12h < 0 && changeDay24h < -0.05 && changeWeekHalf < 0 && changeWeek > 0) {
					currAssetReport = this.l.i(`${asset}: ${prcnt(change3h)}%3h ${prcnt(change6h)}%6h ${prcnt(change12h)}%12h ${prcnt(changeDay24h)}%24h ${prcnt(changeWeekHalf)}%Wh ${prcnt(changeWeek)}%W`, 1) + '\n';
					currAssetResult.score = 0.30 * Math.abs(change3h) + 0.25 * Math.abs(change6h) + 0.20 * Math.abs(change12h) + 0.15 * Math.abs(changeDay24h) + 0.05 * Math.abs(changeWeekHalf) + 0.05 * Math.abs(changeWeek);

				}else if (change6h < 0.02 && change12h < 0 && changeDay24h < -0.05 && changeWeekHalf < 0 && changeWeek < 0 && changeMonthHalf > 0) {
					currAssetReport = this.l.i(`${asset}: ${prcnt(change6h)}%6h ${prcnt(change12h)}%12h ${prcnt(changeDay24h)}%24h ${prcnt(changeWeekHalf)}%Wh ${prcnt(changeWeek)}%W ${prcnt(changeMonthHalf)}%Mh`, 1) + '\n';
					currAssetResult.score = 0.30 * Math.abs(change6h) + 0.25 * Math.abs(change12h) + 0.20 * Math.abs(changeDay24h) + 0.15 * Math.abs(changeWeekHalf) + 0.05 * Math.abs(changeWeek) + 0.05 * Math.abs(changeMonthHalf);

				}else if (change12h < 0.02 && changeDay24h < -0.05 && changeWeekHalf < 0 && changeWeek < 0 && changeMonthHalf < 0 && changeMonth > 0) {
					currAssetReport = this.l.i(`${asset}: ${prcnt(change12h)}%12h ${prcnt(changeDay24h)}%24h ${prcnt(changeWeekHalf)}%Wh ${prcnt(changeWeek)}%W ${prcnt(changeMonthHalf)}%Mh ${prcnt(changeMonth)}%M`, 1) + '\n';
					currAssetResult.score = 0.30 * Math.abs(change12h) + 0.25 * Math.abs(changeDay24h) + 0.20 * Math.abs(changeWeekHalf) + 0.15 * Math.abs(changeWeek) + 0.05 * Math.abs(changeMonthHalf) + 0.05 * Math.abs(changeMonth);

				}else if (changeDay24h < -0.05 && changeWeekHalf < 0 && changeWeek < 0 && changeMonthHalf < 0 && changeMonth < 0 && changeQuarterHalf > 0) {
					currAssetReport = this.l.i(`${asset}: ${prcnt(changeDay24h)}%24h ${prcnt(changeWeekHalf)}%Wh ${prcnt(changeWeek)}%W ${prcnt(changeMonthHalf)}%Mh ${prcnt(changeMonth)}%M ${prcnt(changeQuarterHalf)}%Qh`, 1) + '\n';
					currAssetResult.score = 0.30 * Math.abs(changeDay24h) + 0.25 * Math.abs(changeWeekHalf) + 0.20 * Math.abs(changeWeek) + 0.15 * Math.abs(changeMonthHalf) + 0.05 * Math.abs(changeMonth) + 0.05 * Math.abs(changeQuarterHalf);

				}else if (changeWeekHalf < 0.05 && changeWeek < 0 && changeMonthHalf < 0 && changeMonth < 0 && changeQuarterHalf < 0 && changeQuarter > 0) {
					currAssetReport = this.l.i(`${asset}: ${prcnt(changeWeekHalf)}%Wh ${prcnt(changeWeek)}%W ${prcnt(changeMonthHalf)}%Mh ${prcnt(changeMonth)}%M ${prcnt(changeQuarterHalf)}%Qh ${prcnt(changeQuarter)}%Q`, 1) + '\n';
					currAssetResult.score = 0.30 * Math.abs(changeWeekHalf) + 0.25 * Math.abs(changeWeek) + 0.20 * Math.abs(changeMonthHalf) + 0.15 * Math.abs(changeMonth) + 0.05 * Math.abs(changeQuarterHalf) + 0.05 * Math.abs(changeQuarter);
				}
				currAssetReport += this.l.i(`${asset} price is: \n${prcnt(priceOverLowestWeek)}% > week lowest,\n${prcnt(priceOverHighestWeek)}% < week highest,\n${prcnt(priceOverLowestMonth)}% > month lowest,\n${prcnt(priceOverHighestMonth)}% < month highest.`, 1) + '\n';
				currAssetReport += this.l.i(`${asset} candlestick score: ${candleStickScore.toFixed(3)}`, 1) + '\n';

				currAssetResult.report = currAssetReport;
				currAssetReport = "";
				assetResults.push(currAssetResult);

				assetResults.sort(function (a, b) {
					return a.score - b.score;
				});
				report = "";
				assetResults.forEach(element => {
					report += element.report;
				});
				fs.writeFile(reportFilePath, report, function(err) { if (err) this.l.err(err, 0, true); } );
			}
			report += this.l.i(`EVALUATING ASSET: ${asset} - END`);
		}
		return assetResults;
	}

}

export default Analysis;