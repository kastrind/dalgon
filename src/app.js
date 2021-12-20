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
var getAssetInfo = dalgon.createPublicFunction('/0/public/Assets', 'Request for Get Asset Info');
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

	// let quarter = new Date();
	// quarter.setHours(quarter.getHours() - 24*30*3);
	// let assetPair = "QTUMEUR";
	// let ohlcQuarter = await (OHLC.request(getOHLC, assetPair, quarter.toISOString(), 720, l, SIMULATION));
	// let changeQuarter = ohlcQuarter.getChange();

	// let ohlcQuarterHalf = new OHLC(assetPair, l, {});
	// ohlcQuarterHalf.setTicks(ohlcQuarter.ticks.slice(0, Math.ceil(ohlcQuarter.getTicks().length/2)));
	// let changeQuarterHalf = ohlcQuarterHalf.getChange();
	// l.i(`${ohlcQuarter.getTicks().length} ${changeQuarter} ${ohlcQuarterHalf.getTicks().length} ${changeQuarterHalf}`);
	// l.i(`${ohlcQuarter.getTicks()[0].open} ${ohlcQuarter.getTicks()[539].open}`);
	// l.i(`${ohlcQuarter.getTicks()[0].open} ${ohlcQuarter.getTicks()[269].open}`);
	// l.i(`${JSON.stringify(ohlcQuarterHalf.getTicks()[0])} ${JSON.stringify(ohlcQuarterHalf.getTicks()[269])}`);
	// return;

	// clean asset report file
	let reportFilePath = properties.get('main.ASSETREPORTFILE');
	fs.writeFile(reportFilePath, '', function (err) { if (err) l.err(err, 0, true); });

	let autoTradeCurrencies = JSON.parse(properties.get("main.AUTOTRADE_CURRENCIES"));
	let buyExceptions = properties.get("main.BUY_EXCEPTIONS").split(' ');
	let buyWhiteList = properties.get("main.BUY_WHITELIST");
	let totalBought = {};

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

		// Kraken features:

		// Ticker
		viberBot.getBot().onTextMessage(/^ticker\s+([A-Za-z]+?)$/i, async (message, response) => {
			let asset = message.text.match(/^ticker\s+([A-Za-z]+?)$/i)[1].toUpperCase();
			let ticker = await (Ticker.request(getTicker, { searchParams: { pair: asset+BASE_CURRENCY } }, l, SIMULATION));
			if (ticker) viberBot.sendTextMessage(ticker.toString());
			else viberBot.sendTextMessage("Failed to get ticker information.");
		});

		// Balance
		viberBot.getBot().onTextMessage(/^(my )?(kraken )?balance$/i, async (message, response) => {
			let balance = await (Balance.request(getBalance, {}, l, SIMULATION));
			if (balance) viberBot.sendTextMessage(balance.toString());
			else viberBot.sendTextMessage("Failed to get balance.");
		});

		// Portfolio value
		viberBot.getBot().onTextMessage(/^(my )?(kraken )?portfolio value$/i, async (message, response) => {
			viberBot.sendTextMessage('Please wait.');
			let balance = await (Balance.request(getBalance, {}, l, SIMULATION));
			if (balance)  {
				let assets = [];
				for (let asset in balance.balanceJsonResponse) {
					assets.push(asset);
				}
				let assetInfoResponseBody;
				await getAssetInfo({searchParams: { asset: assets.join(',') } }).then(s => assetInfoResponseBody = JSON.parse(s.body));
				if (!isEmpty(assetInfoResponseBody) && assetInfoResponseBody.result && Object.keys(assetInfoResponseBody.result).length > 0) {
					let holdings = {};
					let total = 0;
					for (let assetInfo in assetInfoResponseBody.result) {
						let assetAltName = assetInfoResponseBody.result[assetInfo].altname || assetInfo;
						let ticker = await (Ticker.request(getTicker, { searchParams: { pair: assetAltName+BASE_CURRENCY } }, l, SIMULATION));
						if (ticker) {
							holdings[assetAltName] = (ticker.askPrice * parseFloat(balance.balanceJsonResponse[assetInfo])).toFixed(2);
							total += parseFloat(holdings[assetAltName]);
							if (holdings[assetAltName] == '0.00') delete holdings[assetAltName];
							else holdings[assetAltName] += BASE_CURRENCY;
						}
					}
					let report = '';
					Object.keys(holdings).reduce( (prev, curr, i) => { let elem = i==1 ? prev : curr; report += `${elem}: ${holdings[elem]}\n`; });
					report += `Total: ${total}${BASE_CURRENCY}`;
					viberBot.sendTextMessage(report);
				}
			}
			else viberBot.sendTextMessage("Failed to get portfolio value.");
		});

		// Open Orders
		viberBot.getBot().onTextMessage(/^(my )?(open orders)$/i, async (message, response) => {
			let openOrdersResponseBody = await (Order.request(getOpenOrders, {}));
			if (openOrdersResponseBody && openOrdersResponseBody.result) {
				viberBot.sendTextMessage(Order.reportOpenOrders(openOrdersResponseBody));
			}else if (openOrdersResponseBody && openOrdersResponseBody.error) {
				viberBot.sendTextMessage(`${openOrdersResponseBody.error}`);
			}else viberBot.sendTextMessage("Failed to get open orders.");
		});

		// Purchases
		viberBot.getBot().onTextMessage(/^(my )?(purchases)$/i, async (message, response) => {
			let timeTolerance = properties.get("ledger.TIMETOLERANCE");
			let ledger = await (Ledger.request(getLedgerInfo, {ofs: 0}, timeTolerance, BASE_CURRENCY, l, SIMULATION));
			ledger.groupLedgerEntries();
			ledger.getAssetPurchaseInfo();
			if (ledger) viberBot.sendTextMessage(ledger.reportPurchaseInfo());
			else viberBot.sendTextMessage("Failed to get purchase history.");
		});

		// Trade ASSET_SYMBOL BUY_TOTAL
		viberBot.getBot().onTextMessage(/^trade ([A-Z]+)$/i, async (message, response) => {
			let assetToInvestIn = message.text.match(/^trade ([A-Z]+)$/i)[1].toUpperCase();
			if (assetToInvestIn) {
				let order = new Order(1, 'limit', 'buy', viberBot, l, SIMULATION, true);
				order.setAutoTradeTotalBought(totalBought);
				if (await order.autoTradePreConditions(getBalance, getTradeableAssetPairs, assetToInvestIn, buyExceptions, buyWhiteList, autoTradeCurrencies)) {
					await order.autoTrade(assetToInvestIn, getTicker, addOrder);
					totalBought = order.getAutoTradeTotalBought();
				}
			}
		});

		// Set Budget ASSET_SYMBOL AMOUNT
		viberBot.getBot().onTextMessage(/^(set )?budget (\S)+( |=)(\S)+$/i, async (message, response) => {
			let matches = message.text.match(/^(set )?budget (\S+)( |=)(\S+)$/i);
			let assetName = matches[2].toUpperCase();
			let budget = parseFloat(matches[4]);
			if (!autoTradeCurrencies[assetName]) {
				viberBot.sendTextMessage(`Failed to set budget: auto-trading currency ${assetName} not found.`);
			}else {
				autoTradeCurrencies[assetName].budget = budget;
				viberBot.sendTextMessage(`${assetName} budget set to ${budget}\n${JSON.stringify(autoTradeCurrencies, null, 2)}.`);
			}
		});

		// Get Auto-Trading Configuration
		viberBot.getBot().onTextMessage(/^(get )?(auto)?( |-)?trading config(uration)?$/i, async (message, response) => {
			viberBot.sendTextMessage(`${JSON.stringify(autoTradeCurrencies, null, 2)}.`);
		});

		// Coingecko Features:

		// Portfolio
		viberBot.getBot().onTextMessage(/^(my )?(portfolio|holdings)$/i, async (message, response) => {
			await coingecko.getPortfolio(properties.get('coingecko.REMEMBER_USER_TOKEN'), properties.get('coingecko.PORTFOLIO_ID'), BASE_CURRENCY).then(cgportfolioResponse => {
				if (cgportfolioResponse.statusCode>=200 && cgportfolioResponse.statusCode<300) {
					viberBot.sendTextMessage(coingecko.reportPortfolio(cgportfolioResponse));
				}else {
					let suggestTokenExpired = cgportfolioResponse.statusCode==200 ? ' Perhaps user token cookie expired?' : '';
					viberBot.sendTextMessage(`Request failed with status ${cgportfolioResponse.statusCode} and body\n${cgportfolioResponse.body.substring(0, 100)}....\n${suggestTokenExpired}`);
				}
			}).catch(cgportfolioResponse => {
				let suggestTokenExpired = cgportfolioResponse.statusCode==200 ? ' Perhaps user token cookie expired?' : '';
				viberBot.sendTextMessage(`Request failed with status ${cgportfolioResponse.statusCode} and body\n${cgportfolioResponse.body}.${suggestTokenExpired}`);
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
	}

	let timestampSecondsI=0, timestampSecondsF;
	let maxNumOHLCResults = properties.get("ohlc.MAXNUMRESULTS");
	let assets = properties.get("ohlc.ASSETS").split(' ');

	while(true) {

		try {
			
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
					if (await order.autoTradePreConditions(getBalance, getTradeableAssetPairs, assetToInvestIn, buyExceptions, buyWhiteList, autoTradeCurrencies)) {
						let autoTradeResult = await order.autoTrade(assetToInvestIn, getTicker, addOrder);
						if (autoTradeResult) {
							totalBought = order.getAutoTradeTotalBought();
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

		}catch(e) {
			let exceptionMsg = l.err(`Exception caught: ${e}`, 0, true);
			if (viberBot) await viberBot.sendTextMessage(`${exceptionMsg}`);
			await sleep(3000);
		}

	}

})();
