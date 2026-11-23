import fs from 'fs';
import Ticker from './Ticker.js';
import Balance from './Balance.js';
import TradeableAssetPair from './TradeableAssetPair.js';
import { DEFAULTS, netEconomics } from './Strategy.js';
import { isEmpty, sleep } from './utils.js';

// userref tags orders: 1 = entry and its protective stop, 2 = bot-initiated exit.
const ENTRY_USERREF = 1;
const EXIT_USERREF = 2;
// A remainder below this share of the position is treated as filled.
const DUST_RATIO = 0.001;

class Order {

	constructor(userRef, orderType, type, viberBot, loggerObj, simulationMode, forceAllowTrade=false, strategy={}) {
		this.userRef = userRef;
		this.orderType = orderType;
		this.type = type;
		this.viberBot = viberBot;
		this.l = loggerObj;
		this.simulationMode = simulationMode;
		this.strategy = { ...DEFAULTS, ...strategy };
		this.tradeAbleAssetPairId = '';
		this.tradeableAssetPair = null;
		this.tradeableAssetPairDecimals = -1;
		this.autoTradeReport = "";
		this.balanceSimObj = {};
		this.tickerSimObj = {};
		this.tradeableAssetPairSimObj = {};
		this.orderSimObj = {};
		this.forceAllowTrade = forceAllowTrade;
		this.pauseMs = 1000;
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
		this.autoTradeReport += l.i(`BUY ${assetToInvestIn} ORDER ATTEMPT WITH PROTECTIVE STOP-LOSS - START`) + '\n';
		let autoTradeReportEnd = `BUY ${assetToInvestIn} ORDER ATTEMPT WITH PROTECTIVE STOP-LOSS - END`;

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

			if (this.balance == 0) {
				buyWith = `${buyWith}.F`;
				this.balance = parseFloat(AccBalance.balanceJsonResponse[buyWith]) || 0;
			}

			let buyPriceTotal = Math.max( minBuyAmount, this.balance * buyBalancePercent / 100 );

			this.autoTradeReport += l.i(`Attempt to order with up to ${buyPriceTotal}${buyWith}. Current balance is ${this.balance}${buyWith}.`, 1) + '\n';

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
				this.tradeableAssetPair = tradeableAssetPairs[0];
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

	static roundDown(value, decimals) {
		let factor = Math.pow(10, decimals);
		return (Math.floor(value * factor + 1e-9) / factor).toFixed(decimals);
	}

	// The pair's first fee tier is the highest rate, so it is the conservative estimate.
	pairFeePercents() {
		let pair = this.tradeableAssetPair;
		let taker = pair && Array.isArray(pair.fees) && pair.fees.length ? parseFloat(pair.fees[0][1]) : NaN;
		let maker = pair && Array.isArray(pair.makerFees) && pair.makerFees.length ? parseFloat(pair.makerFees[0][1]) : NaN;
		return {
			taker: Number.isFinite(taker) ? taker : this.strategy.takerFeePercent,
			maker: Number.isFinite(maker) ? maker : this.strategy.makerFeePercent
		};
	}

	// Returns true when the entry was placed, false on a failure that should stop auto-trading, null when the setup is skipped.
	async autoTrade(assetToInvestIn, getTicker, addOrder) {
		let l = this.l;
		let s = this.strategy;
		let autoTradeReportEnd = `BUY ${assetToInvestIn} ORDER ATTEMPT WITH PROTECTIVE STOP-LOSS - END`;
		let skip = async (reason) => {
			this.autoTradeReport += l.w(`Will not proceed to order ${assetToInvestIn}: ${reason}`, 1, true) + '\n';
			this.autoTradeReport += l.i(`${autoTradeReportEnd}`) + '\n';
			this.autoTradeCurrency = undefined;
			return null;
		};

		if (!this.autoTradeCurrency) {
			this.autoTradeReport += l.err(`Will not proceed to order ${assetToInvestIn}: no currency to trade with. Should call method autoTradePreConditions first, to meet preconditions. `, 1, true) + '\n';
			this.autoTradeReport += l.i(`${autoTradeReportEnd}`) + '\n';
			return false;
		}
		// A post-only limit fills exactly at its price, which is what keeps the stop exactly stopLossPercent below the real entry.
		if (this.orderType != 'limit') return await skip(`only post-only limit entries are supported, not ${this.orderType}.`);

		let ticker = await (Ticker.request(getTicker, { searchParams: { pair: this.tradeAbleAssetPairId } }, l, this.simulationMode, this.tickerSimObj));
		await sleep(this.pauseMs);
		if (isEmpty(ticker)) {
			this.autoTradeReport += l.err(`Will not proceed to order ${assetToInvestIn}: failed to get Ticker.`, 1, true) + '\n';
			this.autoTradeReport += l.i(`${autoTradeReportEnd}`) + '\n';
			await this.viberBot.sendTextMessage(`I failed to buy ${assetToInvestIn}. Buy Order report:\n${this.autoTradeReport}`);
			this.autoTradeCurrency = undefined;
			return false;
		}

		let spreadPercent = (ticker.askPrice - ticker.bidPrice) / ticker.askPrice * 100;
		if (spreadPercent > s.maxSpreadPercent) return await skip(`spread ${spreadPercent.toFixed(2)}% exceeds ${s.maxSpreadPercent}%.`);

		let fees = this.pairFeePercents();
		let economics = netEconomics(s, fees.maker, fees.taker);
		this.autoTradeReport += l.i(`Fees maker ${fees.maker}% taker ${fees.taker}%: net reward/risk ${economics.rewardRisk.toFixed(2)}, break-even win rate ${(economics.breakEvenWinRate * 100).toFixed(1)}%.`, 1) + '\n';
		if (economics.rewardRisk < s.minNetRewardRisk) return await skip(`net reward/risk ${economics.rewardRisk.toFixed(2)} is below ${s.minNetRewardRisk}.`);

		let buyWith = this.autoTradeCurrency.name;
		let minBuyAmount = parseFloat(this.autoTradeCurrency.minBuyAmount);
		let buyBalancePercent = parseFloat(this.autoTradeCurrency.buyPercent);
		let requestedTotal = Math.max( minBuyAmount, this.balance * buyBalancePercent / 100 );
		// The position is sized so a stop-out, including fees, costs at most maxRiskAmount.
		let riskCappedTotal = s.maxRiskAmount / (economics.netRiskPercent / 100);
		let buyPriceTotal = Math.min(requestedTotal, riskCappedTotal, this.balance - this.minBalance);

		let pricePrecision = parseInt(this.tradeableAssetPairDecimals);
		let lotPrecision = parseInt(this.tradeableAssetPair.lotDecimals);
		let buyPriceUnit = (ticker.bidPrice * (1 - s.entryOffsetPercent / 100)).toFixed(pricePrecision);
		let buyVolume = Order.roundDown(buyPriceTotal / buyPriceUnit, lotPrecision);
		let stopPrice = (parseFloat(buyPriceUnit) * (1 - s.stopLossPercent / 100)).toFixed(pricePrecision);
		let targetPrice = (parseFloat(buyPriceUnit) * (1 + s.takeProfitPercent / 100)).toFixed(pricePrecision);

		if (parseFloat(buyVolume) < parseFloat(this.tradeableAssetPair.orderMin || 0)) return await skip(`volume ${buyVolume} is below the pair minimum ${this.tradeableAssetPair.orderMin}.`);
		if (parseFloat(buyVolume) * parseFloat(buyPriceUnit) < parseFloat(this.tradeableAssetPair.costMin || 0)) return await skip(`cost is below the pair minimum ${this.tradeableAssetPair.costMin}.`);

		let cost = parseFloat(buyVolume) * parseFloat(buyPriceUnit);
		let maxLoss = cost * economics.netRiskPercent / 100;
		this.autoTradeReport += l.i(`Spread ${spreadPercent.toFixed(2)}%. Buying ${buyVolume} at ${buyPriceUnit}, cost ${cost.toFixed(2)} ${buyWith} (requested ${requestedTotal.toFixed(2)}, risk cap ${riskCappedTotal.toFixed(2)}).`, 1) + '\n';
		this.autoTradeReport += l.i(`Protective stop-loss ${stopPrice} (-${s.stopLossPercent}%), worst-case loss incl. fees ${maxLoss.toFixed(2)} ${buyWith}. Target ${targetPrice} (+${s.takeProfitPercent}%), managed by the bot.`, 1) + '\n';

		// Spot allows one conditional close, so the stop is the exchange-side order and the bot handles the target.
		let optionalParamsObj = { price: buyPriceUnit, volume: buyVolume, expiretm: `+${s.entryTimeoutSeconds}`, oflags: 'post', 'close[ordertype]': 'stop-loss', 'close[price]': stopPrice };

		let orderResponse = await addOrder(this.prepareOrderParamsObj(this.tradeAbleAssetPairId, optionalParamsObj), this.orderSimObj);
		await sleep(this.pauseMs);
		let orderResponseBody = JSON.parse(orderResponse.body);

		if (!isEmpty(orderResponseBody.error)) {
			this.autoTradeReport += l.err(`Order failed with error: ${orderResponseBody.error}`, 1, true) + '\n';
			this.autoTradeReport += l.i(`${autoTradeReportEnd}`) + '\n';
			await this.viberBot.sendTextMessage(`I failed to buy ${assetToInvestIn}. Buy Order report:\n${this.autoTradeReport}`);
			this.autoTradeCurrency = undefined;
			return false;
		}
		this.autoTradeReport += l.suc(`${JSON.stringify(orderResponseBody.result, null, 2)}`, 1, true) + '\n';
		this.autoTradeReport += l.i(`${autoTradeReportEnd}`) + '\n';
		await this.viberBot.sendTextMessage(`Entry order placed for ${assetToInvestIn}. It is cancelled automatically if unfilled after ${s.entryTimeoutSeconds}s. Buy Order report:\n${this.autoTradeReport}`);
		this.autoTradeCurrency = undefined;
		return true;
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

	// Pending entries count too: they become positions as soon as they fill.
	static countOpenPositions(openOrdersResponseBody) {
		let open = openOrdersResponseBody?.result?.open;
		if (isEmpty(open)) return 0;
		return Object.values(open).filter(order => parseInt(order.userref) === ENTRY_USERREF).length;
	}

	static async queryOrder(requests, txid) {
		let body = await Order.request(requests.queryOrders, { txid: txid });
		if (!body || !isEmpty(body.error) || !body.result || !body.result[txid]) return null;
		return body.result[txid];
	}

	// Executed volume, average price and fee (quote currency) as reported by the exchange.
	static fillOf(info) {
		return { volume: parseFloat(info.vol_exec) || 0, price: parseFloat(info.price) || 0, fee: parseFloat(info.fee) || 0 };
	}

	static journalEntry(ctx, position, volume, price, fee, reason) {
		let exitFee = fee > 0 ? fee : volume * price * ctx.strategy.takerFeePercent / 100;
		let entryFee = position.entryFee * volume / position.volume;
		return {
			closedAt: new Date(ctx.nowMs).toISOString(),
			pair: position.pair,
			reason,
			entryPrice: position.entryPrice,
			exitPrice: price,
			volume,
			netPnl: volume * (price - position.entryPrice) - entryFee - exitFee,
			estimated: !(position.entryFeeActual && fee > 0)
		};
	}

	// Position state comes from the exchange: the stop's refid points at the entry order, whose fill is the true cost basis.
	static async describePosition(ctx, order, previous) {
		let stopPrice = parseFloat(order.descr.price);
		let volume = parseFloat(order.vol);
		let current = { pair: order.descr.pair, volumeText: order.vol, volume, stopPriceText: order.descr.price, stopPrice };
		if (previous) {
			let position = { ...previous, ...current };
			delete position.exitTxid;
			delete position.exitReason;
			return position;
		}
		let position = {
			...current,
			entryTxid: order.refid || null,
			entryPrice: stopPrice / (1 - ctx.strategy.stopLossPercent / 100),
			entryFee: 0,
			entryActual: false,
			entryFeeActual: false,
			openedAtMs: Math.round(parseFloat(order.opentm) * 1000)
		};
		position.entryFee = volume * position.entryPrice * ctx.strategy.makerFeePercent / 100;
		if (order.refid) {
			let entry = await Order.queryOrder(ctx.requests, order.refid);
			await sleep(ctx.pause);
			let fill = entry ? Order.fillOf(entry) : null;
			if (fill && fill.volume > 0 && fill.price > 0) {
				position.entryPrice = fill.price;
				position.entryActual = true;
				position.entryFeeActual = fill.fee > 0;
				position.entryFee = fill.fee > 0 ? fill.fee * Math.min(1, volume / fill.volume) : volume * fill.price * ctx.strategy.makerFeePercent / 100;
			}
		}
		return position;
	}

	static async placeStop(ctx, position, volumeText) {
		let stop = new Order(ENTRY_USERREF, 'stop-loss', 'sell', null, ctx.l, false);
		let body = await Order.request(ctx.requests.addOrder, stop.prepareOrderParamsObj(position.pair, { volume: volumeText, price: position.stopPriceText }));
		await sleep(ctx.pause);
		return body && isEmpty(body.error) && body.result && body.result.txid ? body.result.txid[0] : null;
	}

	// Puts the stop back on volume that is still held; keeps the position tracked as unprotected when that fails.
	static async protectRemainder(ctx, txid, position, remaining) {
		let decimals = (position.volumeText.split('.')[1] || '').length;
		let volumeText = remaining.toFixed(decimals);
		let next = { ...position, volume: remaining, volumeText, entryFee: position.entryFee * remaining / position.volume };
		delete next.exitTxid;
		delete next.exitReason;
		delete next.unprotected;
		delete ctx.updated[txid];
		let newTxid = await Order.placeStop(ctx, position, volumeText);
		ctx.tookAction = true;
		if (newTxid) {
			ctx.updated[newTxid] = next;
			ctx.report += ctx.l.i(`Stop restored for ${volumeText} ${position.pair} as ${newTxid}.`, 2) + '\n';
		} else {
			ctx.updated[txid] = { ...next, unprotected: true };
			ctx.report += ctx.l.err(`UNPROTECTED POSITION: could not restore the stop for ${volumeText} ${position.pair}. Protect it manually.`, 2, true) + '\n';
		}
	}

	// Journals the executed part of an exit and re-protects whatever was not sold.
	static async bookFill(ctx, txid, position, fill, reason) {
		let sold = Math.min(fill.volume, position.volume);
		if (sold > 0) {
			let entry = Order.journalEntry(ctx, position, sold, fill.price, fill.fee, reason);
			ctx.journal.push(entry);
			ctx.tookAction = true;
			ctx.report += ctx.l.i(`${position.pair} ${reason}: sold ${sold} at ${fill.price}, net ${entry.netPnl.toFixed(2)}${entry.estimated ? ' (estimated)' : ''}.`, 2) + '\n';
		}
		let remaining = position.volume - sold;
		if (remaining > position.volume * DUST_RATIO) await Order.protectRemainder(ctx, txid, position, remaining);
	}

	// An accepted exit order is not an executed one: the position is only closed once the exchange reports the fill.
	static async settleExit(ctx, txid, position, info) {
		if (!info) {
			ctx.updated[txid] = position;
			ctx.tookAction = true;
			ctx.report += ctx.l.err(`Cannot verify exit order ${position.exitTxid} for ${position.pair}; will retry.`, 2, true) + '\n';
			return;
		}
		if (info.status === 'open' || info.status === 'pending') {
			ctx.updated[txid] = position;
			ctx.report += ctx.l.i(`Exit order ${position.exitTxid} for ${position.pair} is still ${info.status}.`, 2) + '\n';
			return;
		}
		delete ctx.updated[txid];
		await Order.bookFill(ctx, txid, position, Order.fillOf(info), position.exitReason || 'exit');
	}

	// null when the balance cannot be verified.
	static async holdsBalance(ctx, position) {
		let pairs = await TradeableAssetPair.request(ctx.requests.getTradeableAssetPairs, { searchParams: { pair: position.pair } }, ctx.l);
		let base = pairs && pairs.length ? pairs[0].base : null;
		let body = base ? await Order.request(ctx.requests.getBalance, {}) : null;
		await sleep(ctx.pause);
		if (!body || !isEmpty(body.error) || !body.result) return null;
		let held = parseFloat(body.result[base]) || parseFloat(body.result[`${base}.F`]) || 0;
		return held >= position.volume * 0.99;
	}

	// The stop disappeared without the bot cancelling it: the coins may be sitting unprotected.
	static async handleOrphan(ctx, txid, position, status) {
		ctx.tookAction = true;
		let holds = await Order.holdsBalance(ctx, position);
		if (holds === null) {
			ctx.updated[txid] = position;
			ctx.report += ctx.l.err(`Stop ${txid} for ${position.pair} was ${status} outside the bot and the balance could not be verified; will retry.`, 2, true) + '\n';
			return;
		}
		if (!holds) {
			ctx.journal.push({ closedAt: new Date(ctx.nowMs).toISOString(), pair: position.pair, reason: `stop ${status} outside the bot, no balance found: assumed closed manually`, entryPrice: position.entryPrice, exitPrice: null, volume: position.volume, netPnl: 0, estimated: true });
			ctx.report += ctx.l.i(`Stop ${txid} for ${position.pair} was ${status} and no balance remains; assumed closed manually.`, 2) + '\n';
			return;
		}
		ctx.report += ctx.l.err(`URGENT: stop ${txid} for ${position.pair} was ${status} outside the bot while the coins are still held. Restoring protection.`, 2, true) + '\n';
		await Order.protectRemainder(ctx, txid, position, position.volume);
	}

	static async exitPosition(ctx, txid, position, reason) {
		let requests = ctx.requests;
		let cancelBody = await Order.request(requests.cancelOrder, { txid: txid });
		await sleep(ctx.pause);
		if (!cancelBody || !isEmpty(cancelBody.error) || !(cancelBody.result && cancelBody.result.count > 0)) {
			ctx.report += ctx.l.err(`Could not cancel stop ${txid}; it may have triggered. Re-checking next cycle.`, 2, true) + '\n';
			return;
		}
		let sell = new Order(EXIT_USERREF, 'market', 'sell', null, ctx.l, false);
		let sellBody = await Order.request(requests.addOrder, sell.prepareOrderParamsObj(position.pair, { volume: position.volumeText }));
		await sleep(ctx.pause);
		let sellTxid = sellBody && isEmpty(sellBody.error) && sellBody.result && sellBody.result.txid ? sellBody.result.txid[0] : null;
		if (!sellTxid) {
			ctx.report += ctx.l.err(`Market sell failed: ${sellBody ? sellBody.error : 'no response'}. Restoring the stop.`, 2, true) + '\n';
			await Order.protectRemainder(ctx, txid, position, position.volume);
			return;
		}
		let exiting = { ...position, exitTxid: sellTxid, exitReason: reason };
		ctx.updated[txid] = exiting;
		let info = null;
		for (let attempt = 0; attempt < 3; attempt++) {
			info = await Order.queryOrder(requests, sellTxid);
			await sleep(ctx.pause);
			if (info && info.status !== 'open' && info.status !== 'pending') break;
		}
		await Order.settleExit(ctx, txid, exiting, info);
	}

	// known: stop txid -> position remembered from the previous cycle; returns the updated map, a report and closed-trade journal entries.
	static async managePositions(known, strategy, requests, l, nowMs=Date.now()) {
		let ctx = { strategy, requests, l, nowMs, pause: requests.pauseMs ?? 1000, updated: {}, journal: [], report: l.i('MANAGE POSITIONS - START') + '\n', tookAction: false };

		let openOrdersBody = await Order.request(requests.getOpenOrders, {});
		if (!openOrdersBody || !isEmpty(openOrdersBody.error) || !openOrdersBody.result || !openOrdersBody.result.open) {
			ctx.report += l.err(`Failed to get open orders${openOrdersBody && openOrdersBody.error ? ': ' + openOrdersBody.error : ''}. Positions left untouched.`, 1, true) + '\n';
			return { known, report: ctx.report, tookAction: false, journal: [] };
		}

		let stops = {};
		for (let txid in openOrdersBody.result.open) {
			let order = openOrdersBody.result.open[txid];
			if (parseInt(order.userref) === ENTRY_USERREF && order.descr.type === 'sell' && order.descr.ordertype === 'stop-loss') stops[txid] = order;
		}

		for (let txid of Object.keys(known)) {
			let position = known[txid];
			if (position.exitTxid) {
				let info = await Order.queryOrder(requests, position.exitTxid);
				await sleep(ctx.pause);
				await Order.settleExit(ctx, txid, position, info);
			} else if (!stops[txid]) {
				let info = await Order.queryOrder(requests, txid);
				await sleep(ctx.pause);
				if (!info || info.status === 'open' || info.status === 'pending') {
					ctx.updated[txid] = position;
					ctx.tookAction = true;
					ctx.report += l.err(`Cannot confirm what happened to stop ${txid} for ${position.pair}; will retry.`, 2, true) + '\n';
				} else if (info.status === 'closed') {
					let fill = Order.fillOf(info);
					if (!(fill.price > 0)) fill.price = position.stopPrice;
					if (!(fill.volume > 0)) fill.volume = position.volume;
					await Order.bookFill(ctx, txid, position, fill, 'stop-loss');
				} else {
					await Order.handleOrphan(ctx, txid, position, info.status);
				}
			}
		}

		for (let txid in stops) {
			let position = await Order.describePosition(ctx, stops[txid], known[txid]);
			ctx.updated[txid] = position;

			let ticker = await Ticker.request(requests.getTicker, { searchParams: { pair: position.pair } }, l);
			await sleep(ctx.pause);
			if (!ticker) {
				ctx.report += l.err(`No ticker for ${position.pair}; skipping ${txid}.`, 1, true) + '\n';
				continue;
			}
			let bid = ticker.bidPrice;
			let target = position.entryPrice * (1 + strategy.takeProfitPercent / 100);
			let ageHours = (nowMs - position.openedAtMs) / 3600000;
			ctx.report += l.i(`${position.pair} ${txid}: entry ${position.entryPrice.toPrecision(6)}${position.entryActual ? '' : ' (derived)'}, bid ${bid}, ${((bid / position.entryPrice - 1) * 100).toFixed(2)}%, stop ${position.stopPriceText}, target ${target.toPrecision(6)}, held ${ageHours.toFixed(1)}h.`, 1) + '\n';

			let reason = bid >= target ? 'target' : (ageHours >= strategy.maxHoldHours ? 'time' : null);
			if (!reason) continue;

			ctx.report += l.i(`Exit (${reason}) for ${position.pair}.`, 2) + '\n';
			ctx.tookAction = true;
			await Order.exitPosition(ctx, txid, position, reason);
		}

		ctx.report += l.i('MANAGE POSITIONS - END') + '\n';
		return { known: ctx.updated, report: ctx.report, tookAction: ctx.tookAction, journal: ctx.journal };
	}

	static realizedPnl(historyFilePath, sinceMs) {
		let lines;
		try {
			lines = fs.readFileSync(historyFilePath, { encoding: 'utf8', flag: 'r' }).split('\n');
		} catch (error) {
			return 0;
		}
		let total = 0;
		for (let line of lines) {
			if (!line.trim()) continue;
			try {
				let entry = JSON.parse(line);
				if (typeof entry.netPnl === 'number' && Date.parse(entry.closedAt) >= sinceMs) total += entry.netPnl;
			} catch (error) {
				continue;
			}
		}
		return total;
	}

	// Day starts at local midnight and the week on Monday.
	static lossLimitStatus(historyFilePath, strategy, now=new Date()) {
		let dayStart = new Date(now);
		dayStart.setHours(0, 0, 0, 0);
		let weekStart = new Date(dayStart);
		weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() + 6) % 7));
		let dayPnl = Order.realizedPnl(historyFilePath, dayStart.getTime());
		let weekPnl = Order.realizedPnl(historyFilePath, weekStart.getTime());
		let reasons = [];
		if (dayPnl <= -strategy.dailyMaxLoss) reasons.push(`daily loss ${dayPnl.toFixed(2)} reached the ${strategy.dailyMaxLoss} limit`);
		if (weekPnl <= -strategy.weeklyMaxLoss) reasons.push(`weekly loss ${weekPnl.toFixed(2)} reached the ${strategy.weeklyMaxLoss} limit`);
		return { blocked: reasons.length > 0, reason: reasons.join('; '), dayPnl, weekPnl };
	}

	static readPositions(positionsFilePath, logger) {
		try {
			return JSON.parse(fs.readFileSync(positionsFilePath, {encoding:'utf8', flag:'r'}));
		}catch(error) {
			if (error.code !== 'ENOENT') logger.err(error, 0, true);
			return {};
		}
	}

	// Written to a temp file and renamed so a crash never leaves a truncated state file.
	static writePositions(positionsFilePath, positions) {
		let temp = `${positionsFilePath}.tmp`;
		fs.writeFileSync(temp, JSON.stringify(positions, null, 2));
		fs.renameSync(temp, positionsFilePath);
	}

}

export default Order;
