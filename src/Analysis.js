import fs from 'fs';
import OHLC from './OHLC.js';
import { sleep, prcnt, isEmpty } from './utils.js';

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
			if (!ohlcPastHour) return [];
			let changePastHour = ohlcPastHour.getChange();

			await sleep(2000);

			let ohlc6h = await (OHLC.request(getOHLC, assetPair, past6h.toISOString(), this.maxNumOHLCResults, this.l, this.simulationMode));
			if (!ohlc6h) { await sleep(2000); continue; }
			let change6h = ohlc6h.getChange();

			let ohlc3h = new OHLC(assetPair, this.l, this.simulationMode, null);
			ohlc3h.setTicks(ohlc6h.getTicks().slice(Math.ceil(ohlc6h.getTicks().length/2), ohlc6h.getTicks().length));
			let change3h = ohlc3h.getChange();

			await sleep(2000);

			let ohlcDay24h = await (OHLC.request(getOHLC, assetPair, day24h.toISOString(), this.maxNumOHLCResults, this.l, this.simulationMode));
			if (!ohlcDay24h) { await sleep(2000); continue; }
			let changeDay24h = ohlcDay24h.getChange();

			let ohlc12h = new OHLC(assetPair, this.l, this.simulationMode);
			ohlc12h.setTicks(ohlcDay24h.getTicks().slice(Math.ceil(ohlcDay24h.getTicks().length/2), ohlcDay24h.getTicks().length));
			let change12h = ohlc12h.getChange();

			await sleep(2000);

			let ohlcWeek = await (OHLC.request(getOHLC, assetPair, week.toISOString(), this.maxNumOHLCResults, this.l, this.simulationMode));
			if (!ohlcWeek) { await sleep(2000); continue; }
			let changeWeek = ohlcWeek.getChange();
			let candleStickScore = ohlcWeek.getCandleStickScore();

			let ohlcWeekHalf = new OHLC(assetPair, this.l, this.simulationMode);
			ohlcWeekHalf.setTicks(ohlcWeek.getTicks().slice(Math.ceil(ohlcWeek.getTicks().length/2), ohlcWeek.getTicks().length));
			let changeWeekHalf = ohlcWeekHalf.getChange();

			await sleep(2000);

			let ohlcMonth = await (OHLC.request(getOHLC, assetPair, month.toISOString(), this.maxNumOHLCResults, this.l, this.simulationMode));
			if (!ohlcMonth) { await sleep(2000); continue; }
			let changeMonth = ohlcMonth.getChange();
			let macd_a = 12;
			let macd_b = 26;
			let macd_c = 9;
			let macdCurrent;
			let macdPrevious;
			// if there is enough ohlc data to calculate MACD
			if (Math.max(macd_a, macd_b) + macd_c + 1 <= ohlcMonth.getTicks().length) {
				macdCurrent = parseFloat(ohlcMonth.getMACD(macd_a, macd_b, macd_c, null, 0, 'close'));
				macdPrevious = parseFloat(ohlcMonth.getMACD(macd_a, macd_b, macd_c, null, 1, 'close'));
			}else {
				macdCurrent = 'N/A';
				macdPrevious = 'N/A';
			}

			let ohlcMonthHalf = new OHLC(assetPair, this.l, this.simulationMode);
			ohlcMonthHalf.setTicks(ohlcMonth.getTicks().slice(Math.ceil(ohlcMonth.getTicks().length/2), ohlcMonth.getTicks().length));
			let changeMonthHalf = ohlcMonthHalf.getChange();

			await sleep(2000);

			let ohlcQuarter = await (OHLC.request(getOHLC, assetPair, quarter.toISOString(), this.maxNumOHLCResults, this.l, this.simulationMode));
			if (!ohlcQuarter) { await sleep(3000); continue; }
			let changeQuarter = ohlcQuarter.getChange();

			let ohlcQuarterHalf = new OHLC(assetPair, this.l, this.simulationMode);
			ohlcQuarterHalf.setTicks(ohlcQuarter.getTicks().slice(Math.ceil(ohlcQuarter.getTicks().length/2), ohlcQuarter.getTicks().length));
			let changeQuarterHalf = ohlcQuarterHalf.getChange();

			await sleep(2000);

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
					(macdCurrent !== 'N/A' && macdPrevious !== 'N/A' && macdCurrent > 0 && macdPrevious < 0)
				)
			{
				isCandidate = true;
				currAssetResult = {
					name: asset,
					score: (((macdCurrent + Math.abs(macdPrevious)) / ohlcPastHour.getAverage()) - candleStickScore).toFixed(3),
					candleStickScore: candleStickScore,
					macdCurrent: macdCurrent.toFixed(3),
					macdPrevious: macdPrevious.toFixed(3),
					report: "",
					changePastHour: changePastHour,
					change3h: change3h,
					change6h: change6h,
					change12h: change12h,
					changeDay24h: changeDay24h,
					changeWeekHalf: changeWeekHalf,
					changeWeek: changeWeek,
					changeMonthHalf: changeMonthHalf,
					changeMonth: changeMonth,
					changeQuarterHalf: changeQuarterHalf,
					changeQuarter: changeQuarter,
					priceOverHighestWeek: priceOverHighestWeek,
					priceOverHighestMonth: priceOverHighestMonth
				};

				currAssetReport = this.l.i(`${asset}: ${prcnt(changePastHour)}%1h ${prcnt(change3h)}%3h ${prcnt(change6h)}%6h ${prcnt(change12h)}%12h ${prcnt(changeDay24h)}%24h ${prcnt(changeWeekHalf)}%Wh ${prcnt(changeWeek)}%W ${prcnt(changeMonthHalf)}%Mh ${prcnt(changeMonth)}%M ${prcnt(changeQuarterHalf)}%Qh ${prcnt(changeQuarter)}%Q`, 1) + '\n';
				currAssetReport += this.l.i(`${asset} price is: \n${prcnt(priceOverLowestWeek)}% > week lowest,\n${prcnt(priceOverHighestWeek)}% < week highest,\n${prcnt(priceOverLowestMonth)}% > month lowest,\n${prcnt(priceOverHighestMonth)}% < month highest.`, 1) + '\n';
				currAssetReport += this.l.i(`${asset} candlestick score: ${candleStickScore.toFixed(3)}`, 1) + '\n';
				currAssetReport += this.l.i(`${asset} score: ${currAssetResult.score}`, 1) + '\n';
				currAssetReport += this.l.i(`${asset} MACD-now:  ${currAssetResult.macdCurrent},\nMACD-prev: ${currAssetResult.macdPrevious}`, 1) + '\n\n';

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

		if (isEmpty(assetResults)) {
			fs.writeFile(reportFilePath, '', function(err) { if (err) this.l.err(err, 0, true); } );
		}

		return assetResults;
	}

}

export default Analysis;