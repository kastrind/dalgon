import { isEmpty } from './utils.js';

class Ticker {

	constructor(assetPair, loggerObj, simulationMode, response) {
		this.assetPair = assetPair;
		this.l = loggerObj;
		this.simulationMode = simulationMode;
		this.tickerJsonResponse = response;
		this.assetPairResponse = Object.keys(this.tickerJsonResponse)[0];
		
		this.askPrice = this.tickerJsonResponse[this.assetPairResponse].a[0];
		this.askWLotVol = this.tickerJsonResponse[this.assetPairResponse].a[1];
		this.askLotVol = this.tickerJsonResponse[this.assetPairResponse].a[2];

		this.bidPrice = this.tickerJsonResponse[this.assetPairResponse].b[0];
		this.bidWLotVol = this.tickerJsonResponse[this.assetPairResponse].b[1];
		this.bidLotVol = this.tickerJsonResponse[this.assetPairResponse].b[2];

		this.lastTradeClosedPrice = this.tickerJsonResponse[this.assetPairResponse].c[0];
		this.lastTradeClosedLotVol = this.tickerJsonResponse[this.assetPairResponse].c[1];

		this.volToday = this.tickerJsonResponse[this.assetPairResponse].v[0];
		this.volLast24h = this.tickerJsonResponse[this.assetPairResponse].v[1];

		this.volWAvgPriceToday = this.tickerJsonResponse[this.assetPairResponse].p[0];
		this.volWAvgPriceLast24h = this.tickerJsonResponse[this.assetPairResponse].p[1];

		this.numTradesToday = this.tickerJsonResponse[this.assetPairResponse].t[0];
		this.numTradesLast24h = this.tickerJsonResponse[this.assetPairResponse].t[1];

		this.lowToday = this.tickerJsonResponse[this.assetPairResponse].l[0];
		this.lowLast24h = this.tickerJsonResponse[this.assetPairResponse].l[1];

		this.highToday = this.tickerJsonResponse[this.assetPairResponse].h[0];
		this.highLast24h = this.tickerJsonResponse[this.assetPairResponse].h[1];

		this.openingPriceToday = this.tickerJsonResponse[this.assetPairResponse].o;
	}

	static async request(tickerRequest, tickerRequestParamsObj, loggerObj, simulationMode=false, simObj={}) {
		let response = {};
		await tickerRequest(tickerRequestParamsObj, simObj).then(s => response = JSON.parse(s.body));
		if (!isEmpty(response) && response.result && Object.keys(response.result).length > 0) {
			return new Ticker(tickerRequestParamsObj.searchParams.pair, loggerObj, simulationMode, response.result);
		}
		return null;
	}

	toString() {
		return `\t\t${this.assetPair} ticker info:
		askPrice: ${this.askPrice}
		askVol: ${this.askWLotVol}
		askLotVol: ${this.askLotVol}
		bidPrice: ${this.bidPrice}
		bidWLotVol: ${this.bidWLotVol}
		bidLotVol: ${this.bidLotVol}
		lastTradeClosedPrice: ${this.lastTradeClosedPrice}
		lastTradeClosedLotVol: ${this.lastTradeClosedLotVol}
		volToday: ${this.volToday}
		volLast24h: ${this.volLast24h}
		volWAvgPriceToday: ${this.volWAvgPriceToday}
		volWAvgPriceLast24h: ${this.volWAvgPriceLast24h}
		numTradesToday: ${this.numTradesToday}
		numTradesLast24h: ${this.numTradesLast24h}
		lowToday: ${this.lowToday}
		lowLast24h: ${this.lowLast24h}
		highToday: ${this.highToday}
		highLast24h: ${this.highLast24h}
		openingPriceToday: ${this.openingPriceToday}`;
	}

}

export default Ticker;