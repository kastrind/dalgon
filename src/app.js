import fs from 'fs';
import { options } from './command.js';
import PropertiesReader from 'properties-reader';
import Logger from './Logger.js';
import Dalgon from './Dalgon.js';
import CoinGecko from './CoinGecko.js';
import Ledger from './Ledger.js';
import Ticker from './Ticker.js';
import OHLC from './OHLC.js';
import OHLCRange from './OHLCRange.js';
import DalgonViberBot from './DalgonViberBot.js';

import { isEmpty, sleep, prcnt } from './utils.js';

import { createRequire } from 'module';
const require = createRequire(import.meta.url);

import { promisify } from 'util';
import { timeStamp } from 'console';
const got = require('got');
const { CookieJar } = require('tough-cookie');

// command line params
var cmdOpts = options;

// constants
var ENV = 'default';
var PRIVATEAPIKEY = null;
var VERBOSE = cmdOpts.verbose || false;
var DEBUG = cmdOpts.debug || false;
var SIMULATION = cmdOpts.simulation || false;

// validate command line params
if (!cmdOpts.privAPIKey) { console.error('Private API Key is mandatory.'); process.exit(-1); }
else { PRIVATEAPIKEY = cmdOpts.privAPIKey; }

if (!cmdOpts.setEnv) { console.warn('Environment not provided; setting env to \'default\'.'); }
else { ENV = cmdOpts.setenv; }

// load config file
var properties = new PropertiesReader(`env/${ENV}.properties`);
// load config properties
var APIKEY = properties.get("main.APIKEY");
var BASE_CURRENCY = properties.get("main.BASE_CURRENCY");

// logger
var l = new Logger(VERBOSE, DEBUG);

// coingecko instance
var coingecko = new CoinGecko(l, SIMULATION);
var getCoinGeckoOHLC = coingecko.createPublicFunction('/coins/{id}/ohlc', 'Request for CoinGecko OHLC');
var getCoinGeckoCoinList = coingecko.createPublicFunction('/coins/list', 'Request for CoinGecko Coins List');
// (async function () {
// 	//let coinGeckoOHLC = await getCoinGeckoOHLC({'{id}': 'bitcoin', searchParams: { vs_currency: 'eur', days: '1'}, headers: {accept: 'application/json'}}, {});
// 	//l.i(""+coinGeckoOHLC.body);
// 	let cgCoinListResponse = await getCoinGeckoCoinList({}, {searchParams: {}, headers: {accept: 'application/json'}});
// 	let cgCoins = JSON.parse(cgCoinListResponse.body);
// 	if (!isEmpty(cgCoins)) {
// 		for (let i=0; i<cgCoins.length; i++) {
// 			let coinId = cgCoins[i].id;
// 			let coinSymbol = cgCoins[i].symbol;
// 			let coinName = cgCoins[i].name;
// 			let cgOHLCResponse = await getCoinGeckoOHLC({'{id}': coinId, searchParams: { vs_currency: 'eur', days: '1'}, headers: {accept: 'application/json'}}, {});
// 			let cgOHLC = JSON.parse(cgOHLCResponse.body);
// 			l.i(JSON.stringify(cgOHLC));
// 			await sleep(1000);
// 		}
// 	}
// })();

// dalgon instance
var dalgon = new Dalgon(APIKEY, PRIVATEAPIKEY, l, SIMULATION);
var getTradeableAssetPairs = dalgon.createPublicFunction('/0/public/AssetPairs', 'Request for Get Tradeable Asset Pairs');
var getTicker = dalgon.createPublicFunction('/0/public/Ticker', 'Request for Get Ticker');
var getOHLC = dalgon.createPublicFunction('/0/public/OHLC', 'Request for Get OHLC Data');
var privateHeaderObj = {'Content-Type': 'application/x-www-form-urlencoded; charset=utf-8'};
var getLedgerInfo     = dalgon.createPrivateFunction('/0/private/Ledgers',        privateHeaderObj, 'Request for Get Ledger Info');
var getBalance        = dalgon.createPrivateFunction('/0/private/Balance',        privateHeaderObj, 'Request for Get Balance');
var getTradeBalance   = dalgon.createPrivateFunction('/0/private/TradeBalance',   privateHeaderObj, 'Request for Trade Balance');
var getOpenOrders     = dalgon.createPrivateFunction('/0/private/OpenOrders',     privateHeaderObj, 'Request for Open Orders');
var getDepositMethods = dalgon.createPrivateFunction('/0/private/DepositMethods', privateHeaderObj, 'Request for Deposit Methods');
var addOrder          = dalgon.createPrivateFunction('/0/private/AddOrder',       privateHeaderObj, 'Request for Adding an Order');
var cancelAllOrders   = dalgon.createPrivateFunction('/0/private/CancelAll',      privateHeaderObj, 'Request for Cancel All Orders');

(async function () {

	// clean asset report file
	let reportFilePath = properties.get('main.ASSETREPORTFILE');
	fs.writeFile(reportFilePath, '', function (err) { if (err) throw err; });

	let viberBot;
	// prepare viber bot
	if (cmdOpts.botAuthToken) {
		let viberBotExposeUrl = properties.get("viberBot.EXPOSE_URL");
		let viberBotPort = properties.get("viberBot.PORT");
		let viberBotName = properties.get("viberBot.BOT_NAME");
		let viberBotAvatarUrl = properties.get("viberBot.AVATAR_URL");
		let viberBotAuthToken = cmdOpts.botAuthToken;
		let recipientProfiles = [], profs;
		if (profs = properties.get("viberBot.RECIPIENT_PROFILES")) {
			recipientProfiles = JSON.parse(profs);
		}
		viberBot = await new DalgonViberBot(l, reportFilePath, viberBotExposeUrl, viberBotPort, viberBotName, viberBotAvatarUrl, viberBotAuthToken, recipientProfiles);

		viberBot.getBot().onTextMessage(/^ticker\s+([A-Za-z]+?)$/i, async (message, response) => {
			let asset = message.text.match(/^ticker\s+([A-Za-z]+?)$/i)[1].toUpperCase();
			// get ticker
			let ticker = await (Ticker.request(getTicker, { searchParams: { pair: asset+BASE_CURRENCY } }, l, SIMULATION));
			viberBot.sendTextMessage(response, ticker.toString());
		});

		viberBot.getBot().onTextMessage(/^(my )?(portfolio|holdings)$/i, async (message, response) => {
			let portfolio = await coingecko.getPortfolio(properties.get('coingecko.REMEMBER_USER_TOKEN'), properties.get('coingecko.PORTFOLIO_ID'), BASE_CURRENCY);
			viberBot.sendTextMessage(response, JSON.stringify(portfolio, null, 2));
		});
	}

	let timestampSecondsI=0, timestampSecondsF;

	while(true) {

		try {

			// Send message to the subscribers every 3 hours that the script is running
			timestampSecondsF = Math.floor(Date.now() / 1000);
			if (viberBot && timestampSecondsF - timestampSecondsI >= 3 * 60 * 60) {
				let canStartTradingMsg = viberBot.canStartTrading ? " I am permitted to trade." : " I am not permitted to trade.";
				await viberBot.sendTextMessage(`Running evaluation on assets to recommend.${canStartTradingMsg}`);
				timestampSecondsI = Math.floor(Date.now() / 1000);
			}

			let maxNumResults = properties.get("ohlc.MAXNUMRESULTS");
			let assets = properties.get("ohlc.ASSETS").split(' ');
			let pastHour = new Date();
			pastHour.setHours(pastHour.getHours() - 1);
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
			for (let i=0; i < assets.length; i++) {
				let asset = assets[i];
				let assetPair = `${asset}${BASE_CURRENCY}`;
				l.i(`EVALUATING ASSET: ${asset} - START`);
				let ohlcPastHour = await (OHLC.request(getOHLC, assetPair, pastHour.toISOString(), maxNumResults, l, SIMULATION));
				let changePastHour = ohlcPastHour.getChange();
				await sleep(1000);
				let ohlcDay24h = await (OHLC.request(getOHLC, assetPair, day24h.toISOString(), maxNumResults, l, SIMULATION));
				let changeDay24h = ohlcDay24h.getChange();
				await sleep(1000);
				let ohlcWeek = await (OHLC.request(getOHLC, assetPair, week.toISOString(), maxNumResults, l, SIMULATION));
				let changeWeek = ohlcWeek.getChange();
				await sleep(1000);
				let ohlcMonth = await (OHLC.request(getOHLC, assetPair, month.toISOString(), maxNumResults, l, SIMULATION));
				let changeMonth = ohlcMonth.getChange();
				await sleep(1000);
				let ohlcQuarter = await (OHLC.request(getOHLC, assetPair, quarter.toISOString(), maxNumResults, l, SIMULATION));
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
					((changePastHour <= 0 && changeDay24h <= -5 && changeWeek > 0 ) ||
					(changeDay24h <= 0 && changeWeek <= 0 && changeMonth > 0) ||
					(changeDay24h <= 0 && changeWeek <= 0 && changeMonth <= 0 && changeQuarter > 0)) &&
					(priceOverHighestWeek > 0.2 || priceOverHighestMonth > 0.3)
					) {
					isCandidate = true;
					currAssetResult = {name: asset, score: 0, report: "", changePastHour: changePastHour, changeDay24h: changeDay24h, changeWeek: changeWeek, changeMonth: changeMonth, changeQuarter: changeQuarter, priceOverHighestWeek: priceOverHighestWeek, priceOverHighestMonth: priceOverHighestMonth};

					if (changePastHour <= 0 && changeDay24h <= -5 && changeWeek > 0) {
						currAssetReport = l.i(`${asset} is down ${prcnt(changePastHour)}$ in 1h, ${prcnt(changeDay24h)}% in 24h and up ${prcnt(changeWeek)}% in week.`, 1) + '\n';
						currAssetResult.score = 0.5 * Math.abs(changePastHour) + 0.3 * Math.abs(changeDay24h) + 0.2 * Math.abs(changeWeek);

					}else if (changeDay24h <= 0 && changeWeek <= 0 && changeMonth > 0) {
						currAssetReport = l.i(`${asset} is down ${prcnt(changeDay24h)}% in 24h, ${prcnt(changeWeek)}% week and up ${prcnt(changeMonth)}% in month.`, 1) + '\n';
						currAssetResult.score = 0.5 * Math.abs(changeDay24h) + 0.3 * Math.abs(changeWeek) + 0.2 * Math.abs(changeMonth);

					}else if (changeDay24h <= 0 && changeWeek <= 0 && changeMonth <= 0 && changeQuarter > 0) {
						currAssetReport = l.i(`${asset} is down ${prcnt(changeDay24h)}% in 24h, ${prcnt(changeWeek)}% week, ${prcnt(changeMonth)}% in month and ${prcnt(changeQuarter)}% up in quarter.`, 1) + '\n';
						currAssetResult.score = 0.5 * Math.abs(changeDay24h) + 0.25 * Math.abs(changeWeek) + 0.15 * Math.abs(changeMonth) + 0.1 * Math.abs(changeQuarter);
					}
					currAssetReport += '  ' + l.i(`${asset} price is ${prcnt(priceOverLowestWeek)}% up over the lowest in week.`, 1) + '\n';
					currAssetReport += '  ' + l.i(`${asset} price is ${prcnt(priceOverHighestWeek)}% down over the highest in week.`, 1) + '\n';
					currAssetReport += '  ' + l.i(`${asset} price is ${prcnt(priceOverLowestMonth)}% up over the lowest in month.`, 1) + '\n';
					currAssetReport += '  ' + l.i(`${asset} price is ${prcnt(priceOverHighestMonth)}% down over the highest in month.`, 1) + '\n\n';

					currAssetResult.report = currAssetReport;
					report += currAssetReport;
					currAssetReport = "";
					assetResults.push(currAssetResult);
					//fs.appendFile(reportFilePath, report, function (err) { if (err) throw err; });

					assetResults.sort(function (a, b) {
						return a.score - b.score;
					});
					report = "";
					assetResults.forEach(element => {
						report += element.report;
					});
					fs.writeFile(reportFilePath, report, function (err) { if (err) throw err; });

				}
				l.i(`EVALUATING ASSET: ${asset} - END`);
			}

			if (viberBot && viberBot.canStartTrading) {

				let assetResultsReversed = assetResults.reverse();
				let buyReport;
				let buyOrderSent;
				let assetToInvestIn;
				let buyExceptions = properties.get("main.BUY_EXCEPTIONS").split(' ');
				for (let i=0; i<assetResultsReversed.length; i++) {

					buyReport = "";
					buyOrderSent = false;
					assetToInvestIn = assetResultsReversed[i].name;

					// Do not buy excepted currency
					if (buyExceptions.includes(assetToInvestIn)) continue;

					if (!viberBot.canStartTrading) break;

					// Get balance of the currency to purchase with
					buyReport += l.i(`BUY ORDER ATTEMPT WITH CONDITIONAL CLOSE: TAKE PROFIT - START`) + '\n';
					let balanceResponse = await getBalance({}, {});
					let balanceResult = JSON.parse(balanceResponse.body).result;
					let buyWith = properties.get("main.BUY_WITH");
					let balance = parseFloat(balanceResult[buyWith]);
					buyReport += l.i(`Current ${buyWith} balance is ${balance}.`, 1) + '\n';

					let buyTotalMin = parseFloat(properties.get("main.BUY_TOTAL_MIN"));
					if (balance < buyTotalMin) {
						l.verbose = true; buyReport += l.err(`Not enough balance. Order cancelled.`, 1) + '\n'; l.verbose = VERBOSE;
						continue;
					}

					// Find the asset pair id and decimals
					let buyWithQuery = properties.get("main.BUY_WITH_QUERY");
					let assetPairQuery = assetToInvestIn + buyWithQuery;
					let tradeableAssetPairInfoResponse = await getTradeableAssetPairs({ searchParams: { pair: assetPairQuery } }, {});
					let tradeableAssetPairInfoResponseBody = JSON.parse(tradeableAssetPairInfoResponse.body);
					if (!isEmpty(tradeableAssetPairInfoResponseBody.result)) {
						let tradeableAssetPairInfoResult = tradeableAssetPairInfoResponseBody.result;
						let assetPairId = Object.keys(tradeableAssetPairInfoResult)[0];
						let assetPairDecimals = tradeableAssetPairInfoResult[assetPairId].pair_decimals;
						buyReport += l.i(`Asset pair id is ${assetPairId} with ${assetPairDecimals} decimals.`, 1) + '\n';

						// Determine amount to buy
						let ticker = await (Ticker.request(getTicker, { searchParams: { pair: assetPairId } }, l, SIMULATION));
						let buyTotalBalPercent = parseFloat(properties.get("main.BUY_TOTAL_BALANCE_PERCENT"));
						let buyPriceTotal = Math.max( buyTotalMin, balance * buyTotalBalPercent / 100 );
						let buyPriceUnit = parseFloat(ticker.askPrice);
						let buyVolume = buyPriceTotal / buyPriceUnit;
						buyReport += l.i(`Total amount to purchase is ${buyPriceTotal} ${buyWith}`, 1) + '\n';
						buyReport += l.i(`Total amount to purchase breaks down to ${buyPriceUnit} ${buyWith} price per unit, times ${buyVolume} volume.`, 1) + '\n';

						// Set the desired selling price for profit
						let profitPercent = parseFloat(properties.get("main.PROFIT_PERCENT"));
						let profitPrice = buyPriceUnit + profitPercent * buyPriceUnit / 100;
						profitPrice = profitPrice.toFixed(assetPairDecimals);
						buyReport += l.i(`Conditional close to take ${profitPercent}% profit: ${profitPrice} ${buyWith} price per unit.`, 1) + '\n';

						// Post Order
						buyReport += l.i(`Adding order...`, 1) + '\n';
						let orderResponse = await addOrder({ userref: 1, ordertype: 'limit', type: 'buy', pair: assetPairId, price: buyPriceUnit, volume: buyVolume, 'close[ordertype]': 'take-profit', 'close[price]': profitPrice }, {});
						let orderResponseBody = JSON.parse(orderResponse.body);
						// Order failed
						if (orderResponse.statusCode != 200 && isEmpty(orderResponseBody.result)) { l.verbose = true; buyReport += l.err(`Order failed with error: ${orderResponseBody.error}`, 1) + '\n'; l.verbose = VERBOSE; }
						// Order succeeded
						else { buyOrderSent = true; l.verbose = true; buyReport += l.suc(`${JSON.stringify(orderResponseBody.result, null, 2)}`, 1) + '\n'; l.verbose = VERBOSE; }
						await sleep(1000);
					} else {
						l.verbose = true;
						buyReport += l.err(`Unsupported pair: ${assetPairQuery}.`, 1) + '\n';
						l.verbose = VERBOSE;
					}
					buyReport += l.i(`BUY ORDER ATTEMPT WITH CONDITIONAL CLOSE: TAKE PROFIT - END`);
					if (buyOrderSent)	await viberBot.sendTextMessage(`I just bought ${assetToInvestIn}. Buy Order report:\n${buyReport}`);
					else 				await viberBot.sendTextMessage(`I failed to buy ${assetToInvestIn}. Buy Order report:\n${buyReport}`);
				}
			}

			l.i("Sleeping...");
			await sleep(5 * 60000);

		}catch(e) {
			l.verbose = true;
			let exceptionMsg = l.err(`Exception caught: ${e}`);
			if (viberBot) await viberBot.sendTextMessage(`${exceptionMsg}`);
			l.verbose = VERBOSE;
			await sleep(3000);
		}

	}

})();
