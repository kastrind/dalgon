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
			await sleep(1000);
			let ohlcDay24h = await (OHLC.request(getOHLC, assetPair, day24h.toISOString(), this.maxNumOHLCResults, this.l, this.simulationMode));
			let changeDay24h = ohlcDay24h.getChange();
			await sleep(1000);
			let ohlcWeek = await (OHLC.request(getOHLC, assetPair, week.toISOString(), this.maxNumOHLCResults, this.l, this.simulationMode));
			let changeWeek = ohlcWeek.getChange();
			await sleep(1000);
			let ohlcMonth = await (OHLC.request(getOHLC, assetPair, month.toISOString(), this.maxNumOHLCResults, this.l, this.simulationMode));
			let changeMonth = ohlcMonth.getChange();
			await sleep(1000);
			let ohlcQuarter = await (OHLC.request(getOHLC, assetPair, quarter.toISOString(), this.maxNumOHLCResults, this.l, this.simulationMode));
			let changeQuarter = ohlcQuarter.getChange();
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
				(changePastHour <= 0.02 && change6h < 0 && changeDay24h < 0 && changeWeek <= 0.1 && changeQuarter > 0)
				||
				(changePastHour >= 0 && changePastHour <= 0.02 && change6h < 0 && changeDay24h <= -0.07)
				||
				(changePastHour <= 0 && changeDay24h <= -0.05 && changeWeek > 0 )
				||
				(changeDay24h <= 0 && changeWeek <= 0 && changeMonth > 0)
				||
				(changeDay24h <= 0 && changeWeek <= 0 && changeMonth <= 0 && changeQuarter >= 0.4)
				)
				&&
				(priceOverHighestWeek > 0.2 || priceOverHighestMonth > 0.3)
				)
				{
				isCandidate = true;
				currAssetResult = {name: asset, score: 0, report: "", changePastHour: changePastHour, changeDay24h: changeDay24h, changeWeek: changeWeek, changeMonth: changeMonth, changeQuarter: changeQuarter, priceOverHighestWeek: priceOverHighestWeek, priceOverHighestMonth: priceOverHighestMonth};

				if (changePastHour <= 0.02 && change6h < 0 && changeDay24h < 0 && changeWeek <= 0.1 && changeQuarter > 0) {
					currAssetReport = this.l.i(`${asset} is ${prcnt(changePastHour)}% in 1h, down ${prcnt(change6h)}% in 6h, down ${prcnt(changeDay24h)}% in 24h, down ${prcnt(changeWeek)}% in week and up ${prcnt(changeQuarter)}% in quarter.`, 1) + '\n';
					currAssetResult.score = 0.25 * Math.abs(changePastHour) + 0.25 * Math.abs(change6h) + 0.25 * Math.abs(changeDay24h) + 0.20 * Math.abs(changeWeek) + 0.05 * Math.abs(changeQuarter);

				}else if (changePastHour >= 0 && changePastHour <= 0.02 && change6h < 0 && changeDay24h <= -0.07) {
					currAssetReport = this.l.i(`${asset} is up ${prcnt(changePastHour)}% in 1h, down ${prcnt(change6h)}% in 6h and down ${prcnt(changeDay24h)}% in 24h.`, 1) + '\n';
					currAssetResult.score = 0.5 * Math.abs(changePastHour) + 0.3 * Math.abs(change6h) + 0.2 * Math.abs(changeDay24h);

				}else if (changePastHour <= 0 && changeDay24h <= -0.05 && changeWeek > 0) {
					currAssetReport = this.l.i(`${asset} is down ${prcnt(changePastHour)}$ in 1h, ${prcnt(changeDay24h)}% in 24h and up ${prcnt(changeWeek)}% in week.`, 1) + '\n';
					currAssetResult.score = 0.5 * Math.abs(changePastHour) + 0.3 * Math.abs(changeDay24h) + 0.2 * Math.abs(changeWeek);

				}else if (changeDay24h <= 0 && changeWeek <= 0 && changeMonth > 0) {
					currAssetReport = this.l.i(`${asset} is down ${prcnt(changeDay24h)}% in 24h, ${prcnt(changeWeek)}% week and up ${prcnt(changeMonth)}% in month.`, 1) + '\n';
					currAssetResult.score = 0.5 * Math.abs(changeDay24h) + 0.3 * Math.abs(changeWeek) + 0.2 * Math.abs(changeMonth);

				}else if (changeDay24h <= 0 && changeWeek <= 0 && changeMonth <= 0 && changeQuarter >= 0.4) {
					currAssetReport = this.l.i(`${asset} is down ${prcnt(changeDay24h)}% in 24h, ${prcnt(changeWeek)}% week, ${prcnt(changeMonth)}% in month and up ${prcnt(changeQuarter)}% in quarter.`, 1) + '\n';
					currAssetResult.score = 0.5 * Math.abs(changeDay24h) + 0.25 * Math.abs(changeWeek) + 0.15 * Math.abs(changeMonth) + 0.1 * Math.abs(changeQuarter);
				}
				currAssetReport += this.l.i(`${asset} price is: \n${prcnt(priceOverLowestWeek)}% > week lowest,\n${prcnt(priceOverHighestWeek)}% < week highest,\n${prcnt(priceOverLowestMonth)}% > month lowest,\n${prcnt(priceOverHighestMonth)}% < month highest.`, 1) + '\n\n';

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