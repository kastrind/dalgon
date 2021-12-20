import Ticker from './Ticker.js';
import Balance from './Balance.js';
import TradeableAssetPair from './TradeableAssetPair.js';
import { isEmpty } from './utils.js';

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
		this.autoTradeTotalBought = 0;
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

	async autoTradePreConditions(getBalance, getTradeableAssetPairs, assetToInvestIn, buyWith, buyWithQuery, buyExceptions, buyWhiteList, buyBudget, buyTotalMin) {
		let l = this.l;
		this.autoTradeReport += l.i(`BUY ${assetToInvestIn} ORDER ATTEMPT WITH CONDITIONAL CLOSE: TAKE PROFIT - START`) + '\n';
		let autoTradeReportEnd = `BUY ${assetToInvestIn} ORDER ATTEMPT WITH CONDITIONAL CLOSE: TAKE PROFIT - END`;

		// Only if allowed to trade
		if (!this.viberBot.canStartTrading && !this.forceAllowTrade) {
			this.autoTradeReport += l.w(`Will not proceed to order ${assetToInvestIn}: auto-trading not permitted.`, 1, true) + '\n';
			this.autoTradeReport += l.i(`${autoTradeReportEnd}`) + '\n';
			return false;
		}
		// Do not buy excepted asset
		if (buyExceptions.includes(assetToInvestIn)) {
			this.autoTradeReport += l.w(`Will not proceed to order ${assetToInvestIn}: asset excepted.`, 1, true) + '\n';
			this.autoTradeReport += l.i(`${autoTradeReportEnd}`) + '\n';
			await this.viberBot.sendTextMessage(`I failed to buy ${assetToInvestIn}. Buy Order report:\n${this.autoTradeReport}`);
			return false;
		}
		// Buy only whitelisted currency, if defined
		if (buyWhiteList && !buyWhiteList.split(' ').includes(assetToInvestIn)) {
			this.autoTradeReport += l.w(`Will not proceed to order ${assetToInvestIn}: asset not in whitelist.`, 1, true) + '\n';
			this.autoTradeReport += l.i(`${autoTradeReportEnd}`) + '\n';
			await this.viberBot.sendTextMessage(`I failed to buy ${assetToInvestIn}. Buy Order report:\n${this.autoTradeReport}`);
			return false;
		}
		// Stay within budget
		if (this.autoTradeTotalBought >= buyBudget) {
			this.autoTradeReport += l.w(`Will not proceed to order ${assetToInvestIn}: spent budget of ${buyBudget} ${buyWith}.`, 1, true) + '\n';
			this.autoTradeReport += l.i(`${autoTradeReportEnd}`) + '\n';
			await this.viberBot.sendTextMessage(`I failed to buy ${assetToInvestIn}. Buy Order report:\n${this.autoTradeReport}`);
			return false;
		}
		// Get balance of the currency to purchase with
		let AccBalance = await Balance.request(getBalance, l, this.simulationMode, this.balanceSimObj);
		if (isEmpty(AccBalance)) {
			this.autoTradeReport += l.w(`Will not proceed to order ${assetToInvestIn}: failed to get Balance.`, 1, true) + '\n';
			this.autoTradeReport += l.i(`${autoTradeReportEnd}`) + '\n';
			await this.viberBot.sendTextMessage(`I failed to buy ${assetToInvestIn}. Buy Order report:\n${this.autoTradeReport}`);
			return false;
		}
		this.balance = parseFloat(AccBalance.balanceJsonResponse[buyWith]);
		this.autoTradeReport += l.i(`Current ${buyWith} balance is ${this.balance}.`, 1) + '\n';

		if (this.balance < buyTotalMin) {
			this.autoTradeReport += l.w(`Will not proceed to order ${assetToInvestIn}: not enough balance.`, 1, true) + '\n';
			this.autoTradeReport += l.i(`${autoTradeReportEnd}`) + '\n';
			await this.viberBot.sendTextMessage(`I failed to buy ${assetToInvestIn}. Buy Order report:\n${this.autoTradeReport}`);
			return false;
		}
		// Find the asset pair id and decimals
		let assetPairQuery = assetToInvestIn + buyWithQuery;
		let tradeableAssetPairs = await TradeableAssetPair.request(getTradeableAssetPairs, { searchParams: { pair: assetPairQuery } }, l, this.simulationMode, this.tradeableAssetPairSimObj);
		if (!isEmpty(tradeableAssetPairs)) {
			this.tradeAbleAssetPairId = tradeableAssetPairs[0].assetPair;
			this.tradeableAssetPairDecimals = tradeableAssetPairs[0].pairDecimals;
			this.autoTradeReport += l.i(`Asset pair id is ${this.tradeAbleAssetPairId} with ${this.tradeableAssetPairDecimals} decimals.`, 1) + '\n';
			return true;
		}else {
			this.autoTradeReport += l.err(`Will not proceed to order ${assetToInvestIn}: unsupported pair ${assetPairQuery}.`, 1, true) + '\n';
			this.autoTradeReport += l.i(`${autoTradeReportEnd}`) + '\n';
			await this.viberBot.sendTextMessage(`I failed to buy ${assetToInvestIn}. Buy Order report:\n${this.autoTradeReport}`);
			return false;
		}
	}

	async autoTrade(assetToInvestIn, getTicker, addOrder, buyWith, buyBudget, buyTotalBalPercent, buyTotalMin, profitPercent) {
		let l = this.l;
		let autoTradeReportEnd = `BUY ${assetToInvestIn} ORDER ATTEMPT WITH CONDITIONAL CLOSE: TAKE PROFIT - END`;

		// Determine amount to buy
		let ticker = await (Ticker.request(getTicker, { searchParams: { pair: this.tradeAbleAssetPairId } }, l, this.simulationMode, this.tickerSimObj));
		if (isEmpty(ticker)) {
			this.autoTradeReport += l.w(`Will not proceed to order ${assetToInvestIn}: failed to get Ticker.`, 1, true) + '\n';
			this.autoTradeReport += l.i(`${autoTradeReportEnd}`) + '\n';
			await this.viberBot.sendTextMessage(`I failed to buy ${assetToInvestIn}. Buy Order report:\n${this.autoTradeReport}`);
			return false;
		}
		let buyPriceTotal = Math.max( buyTotalMin, this.balance * buyTotalBalPercent / 100 );

		// Stay within budget
		if (this.autoTradeTotalBought + buyPriceTotal >= buyBudget) {
			buyPriceTotal = buyBudget - this.autoTradeTotalBought;
			this.autoTradeReport += l.w(`Reducing amount to buy to ${buyPriceTotal} ${buyWith} to prevent overspending the budget.`, 1, true) + '\n';
		}

		// Determine price per unit and volume to buy from total buying price
		let buyPriceUnit = parseFloat(ticker.askPrice);
		let buyVolume = buyPriceTotal / buyPriceUnit;
		this.autoTradeReport += l.i(`Total amount to purchase is ${buyPriceTotal} ${buyWith}`, 1) + '\n';
		this.autoTradeReport += l.i(`Total amount to purchase breaks down to ${buyPriceUnit} ${buyWith} price per unit, times ${buyVolume} volume.`, 1) + '\n';

		// Set the desired selling price for profit
		let profitPrice = buyPriceUnit + profitPercent * buyPriceUnit / 100;
		profitPrice = profitPrice.toFixed(this.tradeableAssetPairDecimals);
		this.autoTradeReport += l.i(`Conditional close to take ${profitPercent}% profit: ${profitPrice} ${buyWith} price per unit.`, 1) + '\n';

		let orderResponse = await addOrder(this.prepareOrderParamsObj(this.tradeAbleAssetPairId, { price: buyPriceUnit, volume: buyVolume, 'close[ordertype]': 'take-profit', 'close[price]': profitPrice } ), this.orderSimObj);
		let orderResponseBody = JSON.parse(orderResponse.body);

		// Order failed
		if (!isEmpty(orderResponseBody.error)) {
			this.autoTradeReport += l.err(`Order failed with error: ${orderResponseBody.error}`, 1, true) + '\n';
			this.autoTradeReport += l.i(`${autoTradeReportEnd}`) + '\n';
			await this.viberBot.sendTextMessage(`I failed to buy ${assetToInvestIn}. Buy Order report:\n${this.autoTradeReport}`);
			return false;
		}
		// Order succeeded
		else {
			this.autoTradeTotalBought += buyPriceTotal;
			this.autoTradeReport += l.suc(`${JSON.stringify(orderResponseBody.result, null, 2)}`, 1, true) + '\n'; 
			this.autoTradeReport += l.i(`${autoTradeReportEnd}`) + '\n';
			await this.viberBot.sendTextMessage(`I just bought ${assetToInvestIn}. Buy Order report:\n${this.autoTradeReport}`);
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

	setAutoTradeTotalBought(autoTradeTotalBought) {
		this.autoTradeTotalBought = autoTradeTotalBought;
	}

	getAutoTradeTotalBought() {
		return this.autoTradeTotalBought;
	}

	static async request(orderRequest, orderParamsObj, simObj={}) {
		let responseBody = {};
		await orderRequest(orderParamsObj, simObj).then(s => responseBody = JSON.parse(s.body));
		if (!isEmpty(responseBody) && (responseBody.result && Object.keys(responseBody.result).length > 0 || responseBody.error)) {
			return responseBody;
		}
		return null;
	}

	static reportOpenOrders(openOrdersResponseBody) {
		let report = "";
		for(let key in openOrdersResponseBody.result.open) {
			report += (new Date(Math.round(Math.floor(parseFloat(openOrdersResponseBody.result.open[key].opentm)*1000))).toISOString()) +': '+ openOrdersResponseBody.result.open[key].descr.order + '\n';
		}
		return report;
	}

}

export default Order;