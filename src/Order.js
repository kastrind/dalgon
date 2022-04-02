import Ticker from './Ticker.js';
import Balance from './Balance.js';
import TradeableAssetPair from './TradeableAssetPair.js';
import { isEmpty, sleep } from './utils.js';

class Order {

	constructor(userRef, orderType, type, viberBot, loggerObj, simulationMode, forceAllowTrade=false) {
		this.userRef = userRef;
		this.orderType = orderType;
		this.type = type;
		this.viberBot = viberBot;
		this.l = loggerObj;
		this.simulationMode = simulationMode;
		this.tradeAbleAssetPairId = '';
		this.tradeableAssetPairDecimals = -1;
		this.autoTradeReport = "";
		this.balanceSimObj = {};
		this.tickerSimObj = {};
		this.tradeableAssetPairSimObj = {};
		this.orderSimObj = {};
		this.forceAllowTrade = forceAllowTrade;
	}

	setSims(balanceSimObj, tickerSimObj, tradeableAssetPairSimObj, orderSimObj) {
		this.balanceSimObj = balanceSimObj;
		this.tickerSimObj = tickerSimObj;
		this.tradeableAssetPairSimObj = tradeableAssetPairSimObj;
		this.orderSimObj = orderSimObj;
	}

	async autoTradePreConditions(getBalance, getTradeableAssetPairs, assetToInvestIn, buyExceptions, buyWhiteList, autoTradeCurrencies) {
		let l = this.l;
		this.autoTradeCurrencies = autoTradeCurrencies;
		this.autoTradeReport += l.i(`BUY ${assetToInvestIn} ORDER ATTEMPT WITH CONDITIONAL CLOSE: TAKE PROFIT - START`) + '\n';
		let autoTradeReportEnd = `BUY ${assetToInvestIn} ORDER ATTEMPT WITH CONDITIONAL CLOSE: TAKE PROFIT - END`;

		// Only if allowed to trade
		if (!this.viberBot.canStartTrading && !this.forceAllowTrade) {
			this.autoTradeReport += l.err(`Will not proceed to order ${assetToInvestIn}: auto-trading not permitted.`, 1, true) + '\n';
			this.autoTradeReport += l.i(`${autoTradeReportEnd}`) + '\n';
			return false;
		}
		// Do not buy excepted asset
		if (buyExceptions.includes(assetToInvestIn)) {
			this.autoTradeReport += l.err(`Will not proceed to order ${assetToInvestIn}: asset excepted.`, 1, true) + '\n';
			this.autoTradeReport += l.i(`${autoTradeReportEnd}`) + '\n';
			await this.viberBot.sendTextMessage(`I failed to buy ${assetToInvestIn}. Buy Order report:\n${this.autoTradeReport}`);
			return false;
		}
		// Buy only whitelisted currency, if defined
		if (buyWhiteList && !buyWhiteList.split(' ').includes(assetToInvestIn)) {
			this.autoTradeReport += l.err(`Will not proceed to order ${assetToInvestIn}: asset not in whitelist.`, 1, true) + '\n';
			this.autoTradeReport += l.i(`${autoTradeReportEnd}`) + '\n';
			await this.viberBot.sendTextMessage(`I failed to buy ${assetToInvestIn}. Buy Order report:\n${this.autoTradeReport}`);
			return false;
		}
		// Get balance of the currency to purchase with
		let AccBalance = await Balance.request(getBalance, l, this.simulationMode, this.balanceSimObj);
		if (isEmpty(AccBalance)) {
			this.autoTradeReport += l.err(`Will not proceed to order ${assetToInvestIn}: failed to get Balance.`, 1, true) + '\n';
			this.autoTradeReport += l.i(`${autoTradeReportEnd}`) + '\n';
			await this.viberBot.sendTextMessage(`I failed to buy ${assetToInvestIn}. Buy Order report:\n${this.autoTradeReport}`);
			return false;
		}

		for(let buyWith in autoTradeCurrencies) {
			let autoTradeCurrency = autoTradeCurrencies[buyWith];
			let queryAssetName = autoTradeCurrency.queryAssetName;
			let minBuyAmount = autoTradeCurrency.minBuyAmount;
			let minBalance = autoTradeCurrency.minBalance;
			// if min balance is percentage, calculate the amount
			this.minBalance = minBalance.slice(-1) === '%' ? parseFloat(minBalance.slice(0,-1)) * this.balance / 100 : minBalance;

			this.balance = parseFloat(AccBalance.balanceJsonResponse[buyWith]) || 0;
			this.autoTradeReport += l.i(`Attempt to order with ${buyWith}. Current ${buyWith} balance is ${this.balance}.`, 1) + '\n';

			// Must have enough balance
			if (this.balance < minBuyAmount) {
				this.autoTradeReport += l.w(`Will not proceed to order ${assetToInvestIn}: not enough balance.`, 1, true) + '\n';
				continue;
			}

			// Keep minimum balance
			if (this.balance - minBuyAmount < this.minBalance) {
				this.autoTradeReport += l.err(`Will not proceed to order ${assetToInvestIn}: reached minimum balance.`, 1, true) + '\n';
				continue;
			}

			// Find the asset pair id and decimals
			let assetPairQuery = assetToInvestIn + queryAssetName;
			let tradeableAssetPairs = await TradeableAssetPair.request(getTradeableAssetPairs, { searchParams: { pair: assetPairQuery } }, l, this.simulationMode, this.tradeableAssetPairSimObj);
			if (!isEmpty(tradeableAssetPairs)) {
				this.tradeAbleAssetPairId = tradeableAssetPairs[0].assetPair;
				this.tradeableAssetPairDecimals = tradeableAssetPairs[0].pairDecimals;
				this.autoTradeReport += l.i(`Asset pair id is ${this.tradeAbleAssetPairId} with ${this.tradeableAssetPairDecimals} decimals.`, 1) + '\n';
				this.autoTradeCurrency = autoTradeCurrency;
				return true;
			}else {
				this.autoTradeReport += l.err(`Will not proceed to order ${assetToInvestIn}: unsupported pair ${assetToInvestIn}${autoTradeCurrency.name}.`, 1, true) + '\n';
				await sleep(1000);
				continue;
			}
		}
		this.autoTradeReport += l.w(`Will not proceed to order ${assetToInvestIn}: no eligible currency found to trade with.`, 1, true) + '\n';
		this.autoTradeReport += l.i(`${autoTradeReportEnd}`) + '\n';
		await this.viberBot.sendTextMessage(`I failed to buy ${assetToInvestIn}. Buy Order report:\n${this.autoTradeReport}`);
		return false;
	}

	async autoTrade(assetToInvestIn, getTicker, addOrder) {
		let l = this.l;
		let autoTradeReportEnd = `BUY ${assetToInvestIn} ORDER ATTEMPT WITH CONDITIONAL CLOSE: TAKE PROFIT - END`;

		if (!this.autoTradeCurrency) {
			this.autoTradeReport += l.err(`Will not proceed to order ${assetToInvestIn}: no currency to trade with. Should call method autoTradePreConditions first, to meet preconditions. `, 1, true) + '\n';
			this.autoTradeReport += l.i(`${autoTradeReportEnd}`) + '\n';
			return false;
		}

		// Determine amount to buy
		let ticker = await (Ticker.request(getTicker, { searchParams: { pair: this.tradeAbleAssetPairId } }, l, this.simulationMode, this.tickerSimObj));
		await sleep(1000);
		if (isEmpty(ticker)) {
			this.autoTradeReport += l.err(`Will not proceed to order ${assetToInvestIn}: failed to get Ticker.`, 1, true) + '\n';
			this.autoTradeReport += l.i(`${autoTradeReportEnd}`) + '\n';
			await this.viberBot.sendTextMessage(`I failed to buy ${assetToInvestIn}. Buy Order report:\n${this.autoTradeReport}`);
			this.autoTradeCurrency = undefined;
			return false;
		}

		let buyWith = this.autoTradeCurrency.name;
		let minBuyAmount = this.autoTradeCurrency.minBuyAmount;
		let buyBalancePercent = this.autoTradeCurrency.buyPercent;

		let buyPriceTotal = Math.max( minBuyAmount, this.balance * buyBalancePercent / 100 );

		// Maintain minimum balance
		if ( this.balance - buyPriceTotal < this.minBalance ) {
			buyPriceTotal = this.balance - this.minBalance;
			this.autoTradeReport += l.w(`Reducing amount to buy to ${buyPriceTotal} ${buyWith} to maintain minimum balance.`, 1, true) + '\n';
		}

		// Determine price per unit and volume to buy from total buying price
		let buyPriceUnit = parseFloat(ticker.askPrice);
		let buyVolume = buyPriceTotal / buyPriceUnit;
		this.autoTradeReport += l.i(`Total amount to purchase is ${buyPriceTotal} ${buyWith}`, 1) + '\n';
		this.autoTradeReport += l.i(`Total amount to purchase breaks down to ${buyPriceUnit} ${buyWith} price per unit, times ${buyVolume} volume.`, 1) + '\n';

		let profitPercent = this.autoTradeCurrency.profitPercent;

		// Set the desired selling price for profit
		let profitPrice = buyPriceUnit + profitPercent * buyPriceUnit / 100;
		profitPrice = profitPrice.toFixed(this.tradeableAssetPairDecimals);
		this.autoTradeReport += l.i(`Conditional close to take ${profitPercent}% profit: ${profitPrice} ${buyWith} price per unit.`, 1) + '\n';

		let orderResponse = await addOrder(this.prepareOrderParamsObj(this.tradeAbleAssetPairId, { price: buyPriceUnit, volume: buyVolume, 'close[ordertype]': 'take-profit', 'close[price]': profitPrice } ), this.orderSimObj);
		await sleep(1000);
		let orderResponseBody = JSON.parse(orderResponse.body);

		// Order failed
		if (!isEmpty(orderResponseBody.error)) {
			this.autoTradeReport += l.err(`Order failed with error: ${orderResponseBody.error}`, 1, true) + '\n';
			this.autoTradeReport += l.i(`${autoTradeReportEnd}`) + '\n';
			await this.viberBot.sendTextMessage(`I failed to buy ${assetToInvestIn}. Buy Order report:\n${this.autoTradeReport}`);
			this.autoTradeCurrency = undefined;
			return false;
		}
		// Order succeeded
		else {
			this.autoTradeReport += l.suc(`${JSON.stringify(orderResponseBody.result, null, 2)}`, 1, true) + '\n'; 
			this.autoTradeReport += l.i(`${autoTradeReportEnd}`) + '\n';
			await this.viberBot.sendTextMessage(`I just bought ${assetToInvestIn}. Buy Order report:\n${this.autoTradeReport}`);
			this.autoTradeCurrency = undefined;
			return true;
		}

	}

	prepareOrderParamsObj(tradeableAssetPairId, optionalParamsObj={} ) {
		let paramsObj = {
			userref: this.userRef,
			ordertype: this.orderType,
			type: this.type,
			pair: tradeableAssetPairId
		};
		return Object.assign(paramsObj, optionalParamsObj);
	}

	static async request(orderRequest, orderParamsObj, simObj={}) {
		let responseBody = {};
		await orderRequest(orderParamsObj, simObj).then(s => responseBody = JSON.parse(s.body));
		if (!isEmpty(responseBody) && ((responseBody.result && Object.keys(responseBody.result).length > 0) || responseBody.error)) {
			return responseBody;
		}
		return null;
	}

	static reportOpenOrders(openOrdersResponseBody, timeZone) {
		let report = "";
		var options = { timeZone: timeZone, weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false };
		if (isEmpty(openOrdersResponseBody.result.open)) {
			report = "There are no open orders.\n"; }
		else {
			for(let txid in openOrdersResponseBody.result.open) {
				let date = new Date(Math.round(Math.floor(parseFloat(openOrdersResponseBody.result.open[txid].opentm)*1000))).toLocaleString("en-US", options);
				let description = openOrdersResponseBody.result.open[txid].descr.order;
				report += `${date}\ntxid: ${txid}\n${description} \n\n`;
			}
		}
		return report;
	}

}

export default Order;