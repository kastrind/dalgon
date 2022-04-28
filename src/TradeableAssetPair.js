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

		this.response = response;
	}

	static async request(tradeableAssetPairRequest, requestParamsObj, loggerObj, simulationMode=false, simObj={}) {
		let responseBody = {};
		await tradeableAssetPairRequest(requestParamsObj, simObj).then(s => responseBody = JSON.parse(s.body));
		if (!isEmpty(responseBody) && responseBody.result && Object.keys(responseBody.result).length > 0) {
			let pairs = [];
			for (let assetPair in responseBody.result) {
				pairs.push(new TradeableAssetPair(assetPair, loggerObj, simulationMode, responseBody.result[assetPair]));
			}
			return pairs;
		}
		return [];
	}

	static async findTradeableAssets(assetsToAnalyse, getTradeableAssetPairs, autoTradeCurrencies, loggerObj, simulationMode=false, simObj={}) {
		let tradeableAssetPairs = await TradeableAssetPair.request(getTradeableAssetPairs, { searchParams: { } }, loggerObj, simulationMode, simObj);
		let tradeableAssetPairsStr = tradeableAssetPairs.reduce( (prev, curr, i) => {if (i===0) return curr.assetPair + ' '; else return prev + curr.assetPair + ' ';}, '');
		let autoTradeCurrencyNames = Object.keys(autoTradeCurrencies);
		let tradeableAssetsToAnalyse = [];
		assetsToAnalyse.forEach(asset => {
			let positions = [];
			autoTradeCurrencyNames.forEach(atcn => {
				let pos = tradeableAssetPairsStr.search(new RegExp(asset+'.?'+atcn.slice(-3)));
				positions.push(pos);
			});
			if (Math.min(...positions) > -1) tradeableAssetsToAnalyse.push(asset);
		});
		return tradeableAssetsToAnalyse;
	}

}

export default TradeableAssetPair;