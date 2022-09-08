import fs from 'fs';
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

			let minBuyAmount = parseFloat(autoTradeCurrency.minBuyAmount);
			let buyBalancePercent = parseFloat(autoTradeCurrency.buyPercent);

			let minBalance = parseFloat(autoTradeCurrency.minBalance);
			this.minBalance = minBalance;
			this.balance = parseFloat(AccBalance.balanceJsonResponse[buyWith]) || 0;

			let buyPriceTotal = Math.max( minBuyAmount, this.balance * buyBalancePercent / 100 );

			this.autoTradeReport += l.i(`Attempt to order with ${buyPriceTotal}${buyWith}. Current balance is ${this.balance}${buyWith}.`, 1) + '\n';

			// Must have enough balance
			if (this.balance < buyPriceTotal) {
				this.autoTradeReport += l.w(`Will not proceed to order ${assetToInvestIn}: not enough balance of ${this.balance}${buyWith}.`, 1, true) + '\n';
				continue;
			}

			// Keep minimum balance
			if (this.balance - buyPriceTotal < this.minBalance) {
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

	async autoTrade(profitPercent, assetToInvestIn, getTicker, addOrder) {
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
		let minBuyAmount = parseFloat(this.autoTradeCurrency.minBuyAmount);
		let buyBalancePercent = parseFloat(this.autoTradeCurrency.buyPercent);

		let buyPriceTotal = Math.max( minBuyAmount, this.balance * buyBalancePercent / 100 );

		// Determine price per unit and volume to buy from total buying price
		let buyPriceUnit = parseFloat(ticker.askPrice);
		let buyVolume = (buyPriceTotal / buyPriceUnit).toFixed(this.tradeableAssetPairDecimals);
		this.autoTradeReport += l.i(`Total amount to purchase is ${buyPriceTotal} ${buyWith}`, 1) + '\n';
		this.autoTradeReport += l.i(`Total amount to purchase breaks down to ${buyPriceUnit} ${buyWith} price per unit, times ${buyVolume} volume.`, 1) + '\n';

		// Set the desired selling price for profit
		let profitPrice = buyPriceUnit + profitPercent * buyPriceUnit / 100;
		profitPrice = profitPrice.toFixed(this.tradeableAssetPairDecimals);
		this.autoTradeReport += l.i(`Conditional close to take ${profitPercent}% profit: ${profitPrice} ${buyWith} price per unit.`, 1) + '\n';

		let optionalParamsObj = { price: buyPriceUnit, volume: buyVolume, 'close[ordertype]': 'take-profit', 'close[price]': profitPrice };
		// market orders get the market price
		if (this.orderType == 'market') {
			delete optionalParamsObj.price;
		}

		let orderResponse = await addOrder(this.prepareOrderParamsObj(this.tradeAbleAssetPairId, optionalParamsObj), this.orderSimObj);
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

	static async reportOpenOrders(openOrdersResponseBody, timeZone, getTicker=null) {
		let report = "";
		let options = { timeZone: timeZone, weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false };
		if (isEmpty(openOrdersResponseBody.result.open)) {
			report = "There are no open orders.\n"; }
		else {
			for(let txid in openOrdersResponseBody.result.open) {
				let userref = parseInt(openOrdersResponseBody.result.open[txid].userref);
				let userrefPart = !isEmpty(userref) ? `userref: ${userref}\n`: '';
				let date = new Date(Math.round(Math.floor(parseFloat(openOrdersResponseBody.result.open[txid].opentm)*1000))).toLocaleString("en-US", options);
				let description = openOrdersResponseBody.result.open[txid].descr.order;

				let currPriceReportPart = "";
				if (getTicker) {
					let pair = openOrdersResponseBody.result.open[txid].descr.pair;
					let price = parseFloat(openOrdersResponseBody.result.open[txid].descr.price);
					let ticker = await Ticker.request(getTicker, { searchParams: { pair: pair } });
					await sleep(1000);
					if (ticker) {
						let currPrice = parseFloat(ticker.lastTradeClosedPrice);
						let differencePercent = ((price - currPrice)*100/currPrice).toFixed(2);
						currPriceReportPart = `\ncurr price: ${currPrice} (${differencePercent}%)`;
					}
				}

				report += `${date}\ntxid: ${txid}\n${userrefPart}${description}${currPriceReportPart}\n\n`;
			}
		}
		return report;
	}

	static async sellStaleProfitOrders(priceToMarketSeries, profitPercent, staleOrderExceptions, staleOrderDays, staleOrderPriceDifferencePercent, recommendedAssetsLength, getOpenOrders, timeZone, getTicker, cancelOrder, addOrder, l, simOpenOrdersObj={}, simCancelOrderObj={}, simAddOrderObj={}) {
		let result = false;
		let report = l.i('SELL STALE PROFIT ORDERS - START') + '\n';
		report += l.i(`Desired profit percentage: ${profitPercent}%.`) + '\n';
		report += l.i(`Orders considered stale are >= ${staleOrderDays} days old.`) + '\n';
		report += l.i(`Orders considered stale are > ${staleOrderPriceDifferencePercent}% to market price.`) + '\n';
		let options = { timeZone: timeZone, weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false };
		
		let openOrdersResponseBody = await Order.request(getOpenOrders, {}, simOpenOrdersObj);
		let openOrderTxids = [];

		if (!isEmpty(openOrdersResponseBody.result.open)) {
			let dateNow = new Date().getTime();
			for(let txid in openOrdersResponseBody.result.open) {
				openOrderTxids.push(txid);

				if (staleOrderExceptions.includes(txid)) {
					report += l.i(`Skipping order ${txid} because it is excepted.`, 1) + '\n';
					continue;
				}

				let currOpenOrder = openOrdersResponseBody.result.open[txid];
				let userref = parseInt(openOrdersResponseBody.result.open[txid].userref);
				let type = currOpenOrder.descr.type;
				let orderType = currOpenOrder.descr.ordertype;
				let description = currOpenOrder.descr.order;
				if (userref == 1 && type == 'sell' && orderType == 'take-profit') {
					let dateFull = new Date(Math.round(Math.floor(parseFloat(currOpenOrder.opentm)*1000))).toLocaleString("en-US", options);
					let date = new Date(Math.round(Math.floor(parseFloat(currOpenOrder.opentm)*1000))).getTime();
					let daysDiff = (dateNow - date)/(1000*60*60*24);
					report += '\n' + l.i(`\nOrder ${txid}: ${description}`, 1) + '\n';
					report += l.i(`Took place on ${dateFull}, ${daysDiff.toFixed(2)} days ago.`, 2) + '\n';

					let pair = currOpenOrder.descr.pair;
					let ticker = await Ticker.request(getTicker, { searchParams: { pair: pair } });
					let differencePercent = 0;
					let currPrice;
					let canSellForProfit = false;

					// not for testing
					if (isEmpty(simOpenOrdersObj)) await sleep(1000);

					if (ticker) {
						let price = parseFloat(currOpenOrder.descr.price);
						currPrice = parseFloat(ticker.bidPrice);
						differencePercent = (price - currPrice)*100/currPrice;

						// only for testing
						if (!isEmpty(simOpenOrdersObj)){
							if (txid =="11O6Z4CS-S5LIA-IOU4TR") { differencePercent = 61; }
							if (txid =="1O6Z4CS-S5LIA-IOU4TR") { differencePercent = 48.5; }
							if (txid =="1OW27RX-YWQBE-2ZZYP7") { differencePercent = 48.5; }
							if (txid =="1OOV7GI-OVXI2-KKPO2V") { differencePercent = 48.5; }
							if (txid =="1O7TBWY-TZ2FA-2JS27W") { differencePercent = 48.5; }
							if (txid =="11O7TBWY-TZ2FA-2JS27W") { differencePercent = 41; }
							if (txid =="21O7TBWY-TZ2FA-2JS27W") { differencePercent = 49.2; }
						}
						report += l.d(`differencePercent ${differencePercent} profitPercent ${profitPercent} `, 0);

						report += l.i(`Curr price is ${currPrice}, ${differencePercent.toFixed(2)}% to market price.`, 2) + '\n';

						// if selling is profitable
						if (differencePercent <= profitPercent -0.6) {
							if (!isEmpty(priceToMarketSeries[txid]) && priceToMarketSeries[txid].length >= 1) {
								let lastOne = priceToMarketSeries[txid][priceToMarketSeries[txid].length -1];
								report += l.d("selling is profitable and series exists and has >=1 length");

								//gained considerable ground
								if (differencePercent < lastOne - 1.5) {
									report += l.d(`canSellForProfit 3A`);
									canSellForProfit = true;
								
								//if only one past price to market in the series,
								}else if (priceToMarketSeries[txid].length == 1) {
									report += l.d("series has one");
									report += l.d(`lastOne ${lastOne}`);
									// if current price to market > last one + 0.3 (price lost considerable ground)
									if (differencePercent > lastOne + 0.3) {
										report += l.d(`canSellForProfit 1A`);
										canSellForProfit = true;
									}
								//if more than one past price to market in the series,
								}else if (priceToMarketSeries[txid].length > 1) {
									let beforeLastOne = priceToMarketSeries[txid][priceToMarketSeries[txid].length -2];
									report += l.d("series has more than one");
									report += l.d(`lastOne ${lastOne} beforeLastOne ${beforeLastOne}`);
									// if current price to market > last one + 0.3 OR (price lost considerable ground)
									//    current price to market > last one and second-to-last one OR (price lost ground two consecutive times)
									//    current price to market < last one and last one > second-to-last one (price gained less ground it lost)
									if (differencePercent > lastOne + 0.3) {
										report += l.d(`canSellForProfit 2A`);
										canSellForProfit = true;
									}
									if (differencePercent > lastOne && lastOne > beforeLastOne) {
										report += l.d(`canSellForProfit 2B`);
										canSellForProfit = true;
									}
									if (Math.abs(differencePercent - lastOne) < (lastOne - beforeLastOne) &&
										(differencePercent - lastOne) < 0 &&
										(lastOne - beforeLastOne) > 0) {
										report += l.d(`canSellForProfit 2C`);
										canSellForProfit = true;
									}
								}
								//else keep waiting, in attempt to maximize profit
							}
						//else if current price to market lost ground such that selling is less than 1% profitable (but still profitable)
						}
						// else if (differencePercent > profitPercent -1 && differencePercent < profitPercent - 0.6 &&
						// 		  !isEmpty(priceToMarketSeries[txid]) && priceToMarketSeries[txid].length > 1) {
						// 			let lastOne = priceToMarketSeries[txid][priceToMarketSeries[txid].length -1];
						// 			if (lastOne <= profitPercent -1) {
						// 				report += l.d(`canSellForProfit 3B`);
						// 				canSellForProfit = true;
						// 			}
						// }
					}

					// if not testing, update the price to market series
					if (isEmpty(simOpenOrdersObj)) {
						if (!Object.keys(priceToMarketSeries).includes(txid)) priceToMarketSeries[txid] = [differencePercent];
						else priceToMarketSeries[txid].push(differencePercent);
						if (priceToMarketSeries[txid].length>2) priceToMarketSeries[txid].shift();
					}

					// if order eligible for cancellation, that is:
					// if order too old and either the desired market price diverged too much or
					// order is twice the age of stale orders and the desired market price seems about to diverge
					// order is profitabe enough
					if ((daysDiff >= staleOrderDays && differencePercent >= staleOrderPriceDifferencePercent) ||
						canSellForProfit) {
						result = true;
						if (!canSellForProfit) {
							report += l.i(`Order is stale: ${daysDiff} days old, ${differencePercent.toFixed(2)}% to market price.`, 2) + '\n';
						}else {
							report += l.i(`Can sell for profit: ${differencePercent.toFixed(2)}% to market price.`, 2) + '\n';
						}
						report += l.i(`Cancelling order ${txid}...`, 2) + '\n';

						// if testing, return here
						if (!isEmpty(simOpenOrdersObj)) return {result: result, report: report, priceToMarketSeries: priceToMarketSeries};

						let cancelOrderResponseBody = await Order.request(cancelOrder, {txid: txid}, simCancelOrderObj);
						await sleep(1000);
						// Cancel order succeeded
						if (cancelOrderResponseBody && !cancelOrderResponseBody.result.pending) {
							report += l.suc(`Order ${txid} cancelled.`, 2, true) + '\n';
							report += l.i(`Placing market sell order...`, 2) + '\n';
							let vol = currOpenOrder.vol;
							let sellOrderType = 'market';
							let sellOrderParamsObj = { volume: vol };
							let sellOrderPrice;

							// Order is not profitable, setup a limit sell Order to a profitable price
							if (!canSellForProfit && ticker) {
								sellOrderType = 'limit';
								sellOrderPrice = ticker.bidPrice + (differencePercent + 1 - profitPercent) * 0.01 * ticker.bidPrice;
								sellOrderParamsObj = { volume: vol, price: sellOrderPrice};
							}

							let order = new Order(2, sellOrderType, 'sell', null, null, simAddOrderObj==true, false);
							let orderResponse = await addOrder(order.prepareOrderParamsObj(pair, sellOrderParamsObj ), simAddOrderObj);
							await sleep(1000);
							let orderResponseBody = JSON.parse(orderResponse.body);
							// Market order failed
							if (!isEmpty(orderResponseBody.error)) {
								report += l.err(`Market sell order failed with error: ${orderResponseBody.error}`, 2, true) + '\n';
								report += l.err(`Proceed manually.`, 2, true) + '\n';
							}
							// Market order succeeded
							else {
								report += l.suc(`Market sell order placed.`, 2, true) + '\n'; 
								report += l.suc(`${JSON.stringify(orderResponseBody.result, null, 2)}`, 2, true) + '\n';
								if (canSellForProfit) {
									delete priceToMarketSeries[txid];
								}
							}
						// Cancel order failed
						}else {
							report += l.err(`Order was not cancelled.`, 2, true) + '\n';
							if (cancelOrderResponseBody) {
								report += l.err(`Response: ${JSON.stringify(cancelOrderResponseBody, null, 2)}`, 2, true) + '\n';
							}
							report += l.err(`Proceed manually.`, 2, true) + '\n';
						}
					}
				}
			}
		}

		Object.keys(priceToMarketSeries).forEach(txid => {
			if (!openOrderTxids.includes(txid)) {
				delete priceToMarketSeries[txid];
			}
		});

		report += l.i('SELL STALE PROFIT ORDERS - END') + '\n';
		return {result: result, report: report, priceToMarketSeries: priceToMarketSeries};
	}

	static readPriceToMarketSeries(priceToMarketSeriesFilePath, logger) {
		let priceToMarketSeries = {};
		try {
			priceToMarketSeries = JSON.parse(fs.readFileSync(priceToMarketSeriesFilePath, {encoding:'utf8', flag:'r'}));
		}catch(error) {
			logger.err(error, 0, true);
		}
		return priceToMarketSeries;
	}

	static writePriceToMarketSeries(priceToMarketSeriesFilePath, priceToMarketSeries, logger) {
		fs.writeFileSync(priceToMarketSeriesFilePath, JSON.stringify(priceToMarketSeries, null, 2), function(err) { if (err) logger.err(err, 0, true); } );
	}

}

export default Order;