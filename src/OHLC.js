import OHLCRange from './OHLCRange.js';
import Tick from './Tick.js';
import { isEmpty } from './utils.js';

class OHLC {

	constructor(assetPair, loggerObj, simulationMode, response) {
		this.assetPair = assetPair;
		this.l = loggerObj;
		this.simulationMode = simulationMode;
		this.OHLCJsonResponse = response;
		this.ticks = [];
		this.assetPairResponse = Object.keys(this.OHLCJsonResponse)[0];
		var that = this;
		this.OHLCJsonResponse[this.assetPairResponse].forEach( (el, i, arr)  => that.ticks.push(new Tick(
			el[0], parseFloat(el[1]), parseFloat(el[2]), parseFloat(el[3]), parseFloat(el[4]), parseFloat(el[5]), parseFloat(el[6]), parseInt(el[7])
		)));
	}

	getHighest() {
		return this.ticks.reduce((prev, curr) => { if ( curr.high > prev.high ) return curr; else return prev;});
	}

	getHighestClose() {
		return this.ticks.reduce((prev, curr) => { if ( curr.close > prev.close ) return curr; else return prev;});
	}

	getLowest() {
		return this.ticks.reduce((prev, curr) => { if ( curr.low < prev.low ) return curr; else return prev;});
	}

	getLowestClose() {
		return this.ticks.reduce((prev, curr) => { if ( curr.close < prev.close ) return curr; else return prev;});
	}

	getMinVol() {
		return this.ticks.reduce((prev, curr) => { if ( curr.vol < prev.vol ) return curr; else return prev;});
	}

	getMaxVol() {
		return this.ticks.reduce((prev, curr) => { if ( curr.vol > prev.vol ) return curr; else return prev;});
	}

	getChange() {
		return ( ( this.ticks[this.ticks.length - 1].open - this.ticks[0].open ) / this.ticks[0].open );
	}

	static async request(OHLCRequest, paramAsset, paramSince, maxNumResults, loggerObj, simulationMode=false, simObj={}) {
		let responseBody = {};
		let ohlcRange = OHLCRange.create(paramSince, maxNumResults);
		let since = ohlcRange.dateSinceSeconds;
		let interval = ohlcRange.interval;
		let OHLCRequestParamsObj = { searchParams: { pair: paramAsset, since: since, interval: interval } };
		await OHLCRequest(OHLCRequestParamsObj, simObj).then(s => responseBody = JSON.parse(s.body));
		if (!isEmpty(responseBody) && responseBody.result && Object.keys(responseBody.result).length > 0) {
			return new OHLC(OHLCRequestParamsObj.searchParams.pair, loggerObj, simulationMode, responseBody.result);
		}
		return null;
	}

}

export default OHLC;