import { isEmpty } from './utils.js';

class TradeableAssetPair {

	constructor(assetPair, loggerObj, simulationMode, response) {
		this.assetPair = assetPair;
		this.l = loggerObj;
		this.simulationMode = simulationMode;

		this.altName = response.altname;
		this.wsName = response.wsname;
		this.aClassBase = response.aclass_base;
		this.base = response.base;
		this.aClassQuote = response.aclass_quote;
		this.quote = response.quote;
		this.lot = response.lot;
		this.pairDecimals = response.pair_decimals;
		this.lotDecimals = response.lot_decimals;
		this.lotMultiplier = response.lot_multiplier;
		this.leverageBuy = response.leverage_buy;
		this.leverageSell = response.leverage_sell;
		this.fees = response.fees;
		this.makerFees = response.fees_maker;
		this.feeVolCurrency = response.fee_volume_currency;
		this.marginCall = response.margin_call;
		this.marginStop = response.margin_stop;
		this.orderMin = response.ordermin;
	}

	static async request(tradeableAssetPairRequest, requestParamsObj, loggerObj, simulationMode=false, simObj={}) {
		let responseBody = {};
		await tradeableAssetPairRequest(requestParamsObj, simObj).then(s => responseBody = JSON.parse(s.body));
		if (!isEmpty(responseBody) && responseBody.result && Object.keys(responseBody.result).length > 0) {
			let pairs = [];
			for (let assetPair in response.result) {
				pairs.push(new TradeableAssetPair(assetPair, loggerObj, simulationMode, responseBody.result[assetPair]));
			}
			return pairs;
		}
		return [];
	}

}

export default TradeableAssetPair;