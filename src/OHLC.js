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
			el[0], el[1], el[2], el[3], el[4], el[5], el[6], el[7]
		)));
	}

	getHighest() {
		return this.ticks.reduce((prev, curr) => { if ( parseFloat(curr.high) > parseFloat(prev.high) ) return curr; else return prev;});
	}

	getHighestClose() {
		return this.ticks.reduce((prev, curr) => { if ( parseFloat(curr.close) > parseFloat(prev.close) ) return curr; else return prev;});
	}

	getLowest() {
		return this.ticks.reduce((prev, curr) => { if ( parseFloat(curr.low) < parseFloat(prev.low) ) return curr; else return prev;});
	}

	
	getLowestClose() {
		return this.ticks.reduce((prev, curr) => { if ( parseFloat(curr.close) < parseFloat(prev.close) ) return curr; else return prev;});
	}

	static async request(OHLCRequest, paramAsset, paramSince, maxNumResults, loggerObj, simulationMode=false, simObj={}) {
		let response = {};
		let ohlcRange = OHLCRange.create(paramSince, maxNumResults);
		let since = ohlcRange.dateSinceSeconds;
		let interval = ohlcRange.interval;
		let OHLCRequestParamsObj = { searchParams: { pair: paramAsset, since: since, interval: interval } };
		await OHLCRequest(OHLCRequestParamsObj, simObj).then(s => response = JSON.parse(s.body));
		if (!isEmpty(response) && response.result && Object.keys(response.result).length > 0) {
			return new OHLC(OHLCRequestParamsObj.searchParams.pair, loggerObj, simulationMode, response.result);
		}
		return null;
	}

}

export default OHLC;