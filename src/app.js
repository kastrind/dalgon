import fs from 'fs';
import { options } from './command.js';
import PropertiesReader from 'properties-reader';
import Logger from './Logger.js';
import Dalgon from './Dalgon.js';
import CoinGecko from './CoinGecko.js';
import Ledger from './Ledger.js';
import Ticker from './Ticker.js';
import Balance from './Balance.js';
import AssetInfo from './AssetInfo.js';
import DalgonViberBot from './DalgonViberBot.js';
import Analysis from './Analysis.js';
import Order from './Order.js';

import { isEmpty, sleep } from './utils.js';

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
var TIMEZONE = properties.get("main.TIMEZONE");

// coingecko instance
var coingecko = new CoinGecko(l, SIMULATION);
var getTrendingCoinList = coingecko.createPublicFunction('/search/trending', 'Request for CoinGecko Trending Coins List');
var getStatusUpdates = coingecko.createPublicFunction('/status_updates', 'Request for CoinGecko Status Updates');

// dalgon instance
var dalgon = new Dalgon(APIKEY, PRIVATEAPIKEY, l, SIMULATION);
var getAssetInfo = dalgon.createPublicFunction('/0/public/Assets', 'Request for Get Asset Info');
var getTradeableAssetPairs = dalgon.createPublicFunction('/0/public/AssetPairs', 'Request for Get Tradeable Asset Pairs');
var getTicker = dalgon.createPublicFunction('/0/public/Ticker', 'Request for Get Ticker');
var getOHLC = dalgon.createPublicFunction('/0/public/OHLC', 'Request for Get OHLC Data');

var privateHeaderObj = {'Content-Type': 'application/x-www-form-urlencoded; charset=utf-8'};
var getLedgerInfo     = dalgon.createPrivateFunction('/0/private/Ledgers',        privateHeaderObj, 'Request for Get Ledger Info');
var getBalance        = dalgon.createPrivateFunction('/0/private/Balance',        privateHeaderObj, 'Request for Get Balance');
var getOpenOrders     = dalgon.createPrivateFunction('/0/private/OpenOrders',     privateHeaderObj, 'Request for Open Orders');
var queryOrders       = dalgon.createPrivateFunction('/0/private/QueryOrders',    privateHeaderObj, 'Request for Query Orders');
var addOrder          = dalgon.createPrivateFunction('/0/private/AddOrder',       privateHeaderObj, 'Request for Adding an Order');
var cancelOrder       = dalgon.createPrivateFunction('/0/private/CancelOrder',    privateHeaderObj, 'Request for Cancel Order');

(async function () {

	// clean asset report file
	let reportFilePath = properties.get('main.ASSET_EVAL_REPORT_FILE');
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
		viberBot.getBot().onTextMessage(/^ticker\s+([A-Za-z]+)( base )?([A-Za-z]+)?$/i, async (message, response) => {
			let matches = message.text.match(/^ticker\s+([A-Za-z]+)( base )?([A-Za-z]+)?$/i);
			let asset = matches[1].toUpperCase();
			let baseCurrency = matches[3] ? matches[3].toUpperCase() : BASE_CURRENCY;
			let ticker = await (Ticker.request(getTicker, { searchParams: { pair: asset + baseCurrency } }, l, SIMULATION));
			if (ticker) viberBot.sendTextMessage(ticker.toString());
			else viberBot.sendTextMessage("Failed to get ticker information.");
		});

		// Balance
		viberBot.getBot().onTextMessage(/^(my )?(kraken )?balance$/i, async (message, response) => {
			let balance = await (Balance.request(getBalance, {}, l, SIMULATION));
			if (balance) viberBot.sendTextMessage(balance.toString());
			else viberBot.sendTextMessage("Failed to get balance.");
		});

		// Purchases
		viberBot.getBot().onTextMessage(/^(my )?(purchases)$/i, async (message, response) => {
			let timeTolerance = properties.get("ledger.TIME_TOLERANCE");
			let ledger = await (Ledger.request(getLedgerInfo, {ofs: 0}, timeTolerance, BASE_CURRENCY, l, SIMULATION));
			ledger.groupLedgerEntries();
			ledger.getAssetPurchaseInfo();
			if (ledger) viberBot.sendTextMessage(ledger.reportPurchaseInfo());
			else viberBot.sendTextMessage("Failed to get purchase history.");
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
				let assetInfos = await AssetInfo.request(getAssetInfo, {searchParams: { asset: assets.join(',') }}, l, SIMULATION);
				//await getAssetInfo({searchParams: { asset: assets.join(',') } }).then(s => assetInfoResponseBody = JSON.parse(s.body));
				if (!isEmpty(assetInfos)) {
				//if (!isEmpty(assetInfoResponseBody) && assetInfoResponseBody.result && Object.keys(assetInfoResponseBody.result).length > 0) {
					let holdings = {};
					let total = 0;
					for (let i=0; i < assetInfos.length; i++) {
						let assetInfo = assetInfos[i];
						let assetAltName = assetInfo.altName || assetInfo.assetName;
						let ticker = await (Ticker.request(getTicker, { searchParams: { pair: assetAltName+BASE_CURRENCY } }, l, SIMULATION));
						if (ticker) {
							holdings[assetAltName] = (ticker.askPrice * parseFloat(balance.balanceJsonResponse[assetInfo.assetName])).toFixed(2);
							total += parseFloat(holdings[assetAltName]);
							if (holdings[assetAltName] == '0.00') delete holdings[assetAltName];
							else holdings[assetAltName] += BASE_CURRENCY;
						}
					}
					let report = '';
					Object.keys(holdings).reduce( (prev, curr, i) => { let elem = i==1 ? prev : curr; report += `${elem}: ${holdings[elem]}\n`; });
					report += `Total: ${total}${BASE_CURRENCY}`;
					viberBot.sendTextMessage(report);
				}else viberBot.sendTextMessage(`Failed to get portfolio value: could not get asset info.`);
			}else viberBot.sendTextMessage("Failed to get portfolio value: could not get balance.");
		});

		// Open Orders
		viberBot.getBot().onTextMessage(/^(my )?(open orders)$/i, async (message, response) => {
			let openOrdersResponseBody = await (Order.request(getOpenOrders, {}));
			if (openOrdersResponseBody && openOrdersResponseBody.result) {
				viberBot.sendTextMessage(Order.reportOpenOrders(openOrdersResponseBody, TIMEZONE));
			}else if (openOrdersResponseBody && !isEmpty(openOrdersResponseBody.error)) {
				viberBot.sendTextMessage(`${openOrdersResponseBody.error}`);
			}else viberBot.sendTextMessage("Failed to get open orders.");
		});

		// Cancel Order txid
		viberBot.getBot().onTextMessage(/^cancel order (\S+)$/i, async (message, response) => {
			let matches = message.text.match(/^cancel order (\S+)$/i);
			let txid = matches[1];
			let report = '';
			let cancelOrderResponseBody = await Order.request(cancelOrder, {txid: txid});
			if (cancelOrderResponseBody && !isEmpty(cancelOrderResponseBody.error)) {
				report = l.err(`Failed to cancel Order ${txid} with error: ${cancelOrderResponseBody.error.toString()}`, 0, true);
			}else if (cancelOrderResponseBody && cancelOrderResponseBody.result.count) {
				report = l.suc(`Order ${txid} canceled.`, 0, true);
			}else {
				report = l.err(`Failed to cancel Order ${txid}.`, 0, true);
			}
			viberBot.sendTextMessage(`${report}`);
		});

		// Change unit price of Order txid: get Order info, cancel it, create a new Order with changed unit price and submit it
		viberBot.getBot().onTextMessage(/^change order (\S+) unit price (\S+)$/i, async (message, response) => {
			let matches = message.text.match(/^change order (\S+) unit price (\S+)$/i);
			let txid = matches[1];
			let unitPrice = parseFloat(matches[2]);

			viberBot.sendTextMessage(`Please wait.`);
			let report = l.i(`CANCEL ORDER & ADD NEW WITH CHANGED UNIT PRICE - START`) + '\n';
			let reportEnd = `CANCEL ORDER & ADD NEW WITH CHANGED UNIT PRICE - END`;

			// Get Order information
			let queryOrderResponseBody = await Order.request(queryOrders, {txid: txid});
			await sleep(1000);
			if (queryOrderResponseBody && !isEmpty(queryOrderResponseBody.error)) {
				report += l.err(`Failed to query Order with error: ${queryOrderResponseBody.error.toString()}`, 1, true) + '\n';
				report += l.i(`${reportEnd}`);
				viberBot.sendTextMessage(`${report}`);
				return;
			}else if (queryOrderResponseBody && queryOrderResponseBody.result) {

				// Create a new Order
				txid = Object.keys(queryOrderResponseBody.result)[0];
				let userref = queryOrderResponseBody.result[txid].userref;
				let pair = queryOrderResponseBody.result[txid].descr.pair;
				let type = queryOrderResponseBody.result[txid].descr.type;
				let ordertype = queryOrderResponseBody.result[txid].descr.ordertype;
				let price = unitPrice;
				let price2 = queryOrderResponseBody.result[txid].descr.price;
				let leverage = queryOrderResponseBody.result[txid].descr.leverage;
				let volume = queryOrderResponseBody.result[txid].vol;
				let oflags = queryOrderResponseBody.result[txid].oflags;

				// Cancel old Order
				let cancelOrderResponseBody = await Order.request(cancelOrder, {txid: txid});
				await sleep(1000);
				if (cancelOrderResponseBody && !isEmpty(cancelOrderResponseBody.error)) {
					report += l.err(`Failed to cancel old Order with error: ${cancelOrderResponseBody.error.toString()}`, 1, true) + '\n';
					report += l.i(`${reportEnd}`);
					viberBot.sendTextMessage(`${report}`);
					return;
				}else if (cancelOrderResponseBody && cancelOrderResponseBody.result.count) {
					report += l.i(`Old Order canceled.`, 1) + '\n';
				}else {
					report += l.err(`Failed to cancel old Order.`, 1, true) + '\n';
					report += l.i(`${reportEnd}`);
					viberBot.sendTextMessage(`${report}`);
					return;
				}

				await sleep(1000);

				// Submit new Order
				let newOrder = new Order(userref, ordertype, type, viberBot, l, SIMULATION);
				let newOrderResponseBody = await Order.request(addOrder, newOrder.prepareOrderParamsObj(pair, { price: price, price2: price2, volume: volume, leverage: leverage, oflags: oflags, }));
				await sleep(1000);
				if (newOrderResponseBody && !isEmpty(newOrderResponseBody.error)) {
					report += l.err(`Failed to submit new Order with error: ${newOrderResponseBody.error.toString()}`, 1, true) + '\n';
					report += l.i(`${reportEnd}`);
					viberBot.sendTextMessage(`${report}`);
					return;
				}else if (newOrderResponseBody && newOrderResponseBody.result.descr.order) {
					report += l.suc(`Submitted new Order: ${newOrderResponseBody.result.descr.order}`, 1, true) + '\n';
					report += l.i(`${reportEnd}`);
					viberBot.sendTextMessage(`${report}`);
				}else {
					report += l.err(`Failed to submit new Order.`, 1, true) + '\n';
					report += l.i(`${reportEnd}`);
					viberBot.sendTextMessage(`${report}`);
					return;
				}

			}else {
				report += l.err(`Failed to query Order.`, 1, true) + '\n';
				report += l.i(`${reportEnd}`);
				viberBot.sendTextMessage(`${report}`);
			}
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
	let maxNumOHLCResults = properties.get("ohlc.MAX_NUM_RESULTS");
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
