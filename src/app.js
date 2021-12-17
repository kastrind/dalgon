import fs from 'fs';
import { options } from './command.js';
import PropertiesReader from 'properties-reader';
import Logger from './Logger.js';
import Dalgon from './Dalgon.js';
import CoinGecko from './CoinGecko.js';
import Ledger from './Ledger.js';
import Ticker from './Ticker.js';
import Balance from './Balance.js';
import TradeableAssetPair from './TradeableAssetPair.js';
import OHLC from './OHLC.js';
import OHLCRange from './OHLCRange.js';
import DalgonViberBot from './DalgonViberBot.js';
import Analysis from './Analysis.js';
import Order from './Order.js';

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

// logger
var l = new Logger(VERBOSE, DEBUG);

// validate command line params
if (!cmdOpts.privAPIKey) { l.err('Private API Key is mandatory.', 0, true); process.exit(-1); }
else { PRIVATEAPIKEY = cmdOpts.privAPIKey; }

if (!cmdOpts.setEnv) { l.w('Environment not provided; setting env to \'default\'.', 0, true); }
else { ENV = cmdOpts.setenv; }

// load config file
var properties = new PropertiesReader(`env/${ENV}.properties`);
// load config properties
var APIKEY = properties.get("main.APIKEY");
var BASE_CURRENCY = properties.get("main.BASE_CURRENCY");

// coingecko instance
var coingecko = new CoinGecko(l, SIMULATION);
var getCoinGeckoOHLC = coingecko.createPublicFunction('/coins/{id}/ohlc', 'Request for CoinGecko OHLC');
var getCoinGeckoCoinList = coingecko.createPublicFunction('/coins/list', 'Request for CoinGecko Coins List');
var getTrendingCoinList = coingecko.createPublicFunction('/search/trending', 'Request for CoinGecko Trending Coins List');
var getStatusUpdates = coingecko.createPublicFunction('/status_updates', 'Request for CoinGecko Status Updates');
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
	fs.writeFile(reportFilePath, '', function (err) { if (err) l.err(err, 0, true); });

	let buyWith = properties.get("main.BUY_WITH");
	let buyExceptions = properties.get("main.BUY_EXCEPTIONS").split(' ');
	let buyWhiteList = properties.get("main.BUY_WHITELIST");
	let buyBudget = parseFloat(properties.get("main.BUY_BUDGET"));
	let buyTotalMin = parseFloat(properties.get("main.BUY_TOTAL_MIN"));
	let buyTotalBalPercent = parseFloat(properties.get("main.BUY_TOTAL_BALANCE_PERCENT"));
	let buyWithQuery = properties.get("main.BUY_WITH_QUERY");
	let profitPercent = parseFloat(properties.get("main.PROFIT_PERCENT"));
	let totalBought = 0;

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

		// Ticker
		viberBot.getBot().onTextMessage(/^ticker\s+([A-Za-z]+?)$/i, async (message, response) => {
			let asset = message.text.match(/^ticker\s+([A-Za-z]+?)$/i)[1].toUpperCase();
			let ticker = await (Ticker.request(getTicker, { searchParams: { pair: asset+BASE_CURRENCY } }, l, SIMULATION));
			if (ticker) viberBot.sendTextMessage(ticker.toString());
			else viberBot.sendTextMessage("Failed to get ticker information.");
		});

		// Portfolio
		viberBot.getBot().onTextMessage(/^(my )?(portfolio|holdings)$/i, async (message, response) => {
			await coingecko.getPortfolio(properties.get('coingecko.REMEMBER_USER_TOKEN'), properties.get('coingecko.PORTFOLIO_ID'), BASE_CURRENCY).then(cgportfolioResponse => {
				if (cgportfolioResponse.statusCode>=200 && cgportfolioResponse.statusCode<300) {
					viberBot.sendTextMessage(coingecko.reportPortfolio(cgportfolioResponse));
				}else {
					let suggestTokenExpired = cgportfolioResponse.statusCode==200 ? ' Perhaps user token cookie expired?' : '';
					viberBot.sendTextMessage(`Request failed with status ${cgportfolioResponse.statusCode} and body\n${cgportfolioResponse.body}.${suggestTokenExpired}`);
				}
			});
		});

		// Trending
		viberBot.getBot().onTextMessage(/^(trending( coins)?)$/i, async (message, response) => {
			await getTrendingCoinList({searchParams: {}, headers: {accept: 'application/json'}}).then(cgResponse => {
				if (cgResponse.statusCode>=200 && cgResponse.statusCode<300) {
					viberBot.sendTextMessage(coingecko.reportTrendingCoins(cgResponse));
				}else { viberBot.sendTextMessage(`Request failed.`); }
			});
		});

		// Status updates
		viberBot.getBot().onTextMessage(/^((status\s+)?updates)|(news)$/i, async (message, response) => {
			await getStatusUpdates({searchParams: {}, headers: {accept: 'application/json'}}).then(async cgResponse => {
				if (cgResponse.statusCode>=200 && cgResponse.statusCode<300) {
					let updates = coingecko.reportStatusUpdates(cgResponse);
					for (let i=0; i < updates.length; i++) {
						await viberBot.sendTextMessage(updates[i]);
						await sleep(1000);
					}
				}else { viberBot.sendTextMessage(`Request failed.`); }
			});
		});

		// Trade ASSET_SYMBOL BUY_TOTAL
		viberBot.getBot().onTextMessage(/^trade ([A-Z]+)$/i, async (message, response) => {
			let assetToInvestIn = message.text.match(/^trade ([A-Z]+)$/i)[1];
			if (assetToInvestIn) {
				let order = new Order(1, 'limit', 'buy', viberBot, l, SIMULATION, true);
				order.setAutoTradeTotalBought(totalBought);
				if (await order.autoTradePreConditions(getBalance, getTradeableAssetPairs, assetToInvestIn, buyWith, buyWithQuery, buyExceptions, buyWhiteList, buyBudget, buyTotalMin)) {
					await order.autoTrade(assetToInvestIn, getTicker, addOrder, buyWith, buyBudget, buyTotalBalPercent, buyTotalMin, profitPercent);
					totalBought += order.getAutoTradeTotalBought();
				}
			}
		});
	}

	let timestampSecondsI=0, timestampSecondsF;
	let maxNumOHLCResults = properties.get("ohlc.MAXNUMRESULTS");
	let assets = properties.get("ohlc.ASSETS").split(' ');

	while(true) {

		//try {
			
			// Send message to the subscribers every 3 hours that the script is running
			timestampSecondsF = Math.floor(Date.now() / 1000);
			if (viberBot && timestampSecondsF - timestampSecondsI >= 3 * 60 * 60) {
				let canStartTradingMsg = viberBot.canStartTrading ? " I am permitted to auto-trade." : " I am not permitted to auto-trade.";
				await viberBot.sendTextMessage(`Running evaluation on assets to recommend.${canStartTradingMsg}`);
				timestampSecondsI = Math.floor(Date.now() / 1000);
			}
			// Analyse assets to recommend for trading
			let analysis = new Analysis(assets, maxNumOHLCResults, BASE_CURRENCY, l, SIMULATION);
			let recommendedAssets = await analysis.recommend(getOHLC, reportFilePath);

			// If allowed to auto-trade
			if (viberBot && viberBot.canStartTrading) {
				//let assetResultsReversed = [{name: "ANT"}, {name: "MATIC"}];
				let assetResultsReversed = recommendedAssets.reverse();
				let assetToInvestIn;
				// Attempt to auto-trade each recommended asset, starting from the best recommendation
				for (let i=0; i<assetResultsReversed.length; i++) {

					assetToInvestIn = assetResultsReversed[i].name;

					// Create a new Order
					let order = new Order(1, 'limit', 'buy', viberBot, l, SIMULATION);
					order.setAutoTradeTotalBought(totalBought);
					// If prerequisites to auto-trade are met, submit the limit Order with conditional take-profit
					if (await order.autoTradePreConditions(getBalance, getTradeableAssetPairs, assetToInvestIn, buyWith, buyWithQuery, buyExceptions, buyWhiteList, buyBudget, buyTotalMin)) {
						let autoTradeResult = await order.autoTrade(assetToInvestIn, getTicker, addOrder, buyWith, buyBudget, buyTotalBalPercent, buyTotalMin, profitPercent);
						if (autoTradeResult) {
							totalBought += order.getAutoTradeTotalBought();
						}else {
							viberBot.canStartTrading = false;
							await viberBot.sendTextMessage(`I stopped auto-trading. Awaiting instructions.`);
							break;
						}
					}
					await sleep(1000);
				}
			}
			l.i("Sleeping...");
			await sleep(5 * 60000);

		// }catch(e) {
		// 	let exceptionMsg = l.err(`Exception caught: ${e}`, 0, true);
		// 	if (viberBot) await viberBot.sendTextMessage(`${exceptionMsg}`);
		// 	await sleep(3000);
		// }

	}

})();
