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
import TradeableAssetPair from './TradeableAssetPair.js';
import Order from './Order.js';

import { isEmpty, sleep } from './utils.js';

import { createRequire } from 'module';
const require = createRequire(import.meta.url);

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
l.i(`Dalgon starting. Validating CLI input parameters and configuration...`);

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
l.i(`Base currency: ${BASE_CURRENCY}`);
var TIMEZONE = properties.get("main.TIMEZONE");
l.i(`Timezone: ${TIMEZONE}`);
var profitPercent = parseFloat(properties.get("main.PROFIT_PERCENT"));
l.i(`Desired profit percentage: ${profitPercent}`);
var staleOrderDays = parseFloat(properties.get("main.STALE_ORDER_DAYS"));
l.i(`Days until a sell take-profit order goes stale: ${staleOrderDays}`);
var staleOrderPriceDifferencePercent = parseFloat(properties.get("main.STALE_ORDER_PRICE_DIFFERENCE_PERCENT"));
l.i(`Price difference percent for a sell take-profit order to go stale: ${staleOrderPriceDifferencePercent}`);

l.i(`Declaring Kraken and CoinGecko API functions...`);

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

	l.suc(`Dalgon started. Initiating analysis and auto-trading cycle...`, 0, true);

	let priceToMarketSeriesFilePath = properties.get('main.PRICE_TO_MARKET_SERIES_FILE');
	let priceToMarketSeries = Order.readPriceToMarketSeries(priceToMarketSeriesFilePath, l);
	let staleOrderExceptions = properties.get('main.STALE_ORDER_EXCEPTIONS').split(' ');

	// clean asset report file
	let reportFilePath = properties.get('main.ASSET_EVAL_REPORT_FILE');
	fs.writeFile(reportFilePath, '', function (err) { if (err) l.err(err, 0, true); });

	let autoTradeCurrencies = JSON.parse(properties.get("main.AUTOTRADE_CURRENCIES"));
	let buyExceptions = properties.get("main.BUY_EXCEPTIONS").split(' ');
	let buyWhiteList = properties.get("main.BUY_WHITELIST");

	l.i(`Auto-trade currencies: ${JSON.stringify(autoTradeCurrencies, null, 2)}`);
	l.i(`Auto-trade exceptions: ${buyExceptions}`);
	l.i(`Auto-trade whitelist: ${buyWhiteList}`);

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

		l.i(`Dalgon Viber bot initiated.`);

		// Kraken features:

		// Ticker
		viberBot.getBot().onTextMessage(/^ticker\s+([A-Za-z]+)( base )?([A-Za-z]+)?$/i, async (message, response) => {
			let matches = message.text.match(/^ticker\s+([A-Za-z]+)( base )?([A-Za-z]+)?$/i);
			let asset = matches[1].toUpperCase();
			let baseCurrency = matches[3] ? matches[3].toUpperCase() : BASE_CURRENCY;
			let ticker = await (Ticker.request(getTicker, { searchParams: { pair: asset + baseCurrency } }, l, SIMULATION));
			if (ticker) viberBot.sendTextMessage(ticker.toString());
			else viberBot.sendTextMessage("Failed to get ticker information.");
			viberBot.recordHistory(message);
		});

		// Balance
		viberBot.getBot().onTextMessage(/^(my )?(kraken )?balance$/i, async (message, response) => {
			let balance = await (Balance.request(getBalance, {}, l, SIMULATION));
			if (balance) viberBot.sendTextMessage(balance.toString());
			else viberBot.sendTextMessage("Failed to get balance.");
			viberBot.recordHistory(message);
		});

		// Purchases
		viberBot.getBot().onTextMessage(/^(my )?(purchases)$/i, async (message, response) => {
			let timeTolerance = properties.get("ledger.TIME_TOLERANCE");
			let ledger = await (Ledger.request(getLedgerInfo, {ofs: 0}, timeTolerance, BASE_CURRENCY, l, SIMULATION));
			ledger.groupLedgerEntries();
			ledger.getAssetPurchaseInfo();
			if (ledger) viberBot.sendTextMessage(ledger.reportPurchaseInfo());
			else viberBot.sendTextMessage("Failed to get purchase history.");
			viberBot.recordHistory(message);
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
				let assetInfos = await AssetInfo.request(getAssetInfo, {searchParams: { asset: assets.join(',') }}, l, SIMULATION);
				if (!isEmpty(assetInfos)) {
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
					report += `Total: ${total.toFixed(2)}${BASE_CURRENCY}`;
					viberBot.sendTextMessage(report);
				}else viberBot.sendTextMessage(`Failed to get portfolio value: could not get asset info.`);
			}else viberBot.sendTextMessage("Failed to get portfolio value: could not get balance.");
			viberBot.recordHistory(message);
		});

		// Open Orders
		viberBot.getBot().onTextMessage(/^(my )?(open orders)$/i, async (message, response) => {
			viberBot.sendTextMessage('Please wait.');
			let openOrdersResponseBody = await Order.request(getOpenOrders, {});
			if (openOrdersResponseBody && openOrdersResponseBody.result) {
				viberBot.sendBigTextMessage(await Order.reportOpenOrders(openOrdersResponseBody, TIMEZONE, getTicker));
			}else if (openOrdersResponseBody && !isEmpty(openOrdersResponseBody.error)) {
				viberBot.sendTextMessage(`${openOrdersResponseBody.error}`);
			}else viberBot.sendTextMessage("Failed to get open orders.");
			viberBot.recordHistory(message);
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
			viberBot.recordHistory(message);
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
			viberBot.recordHistory(message);
		});

		// Trade ASSET_SYMBOL BUY_TOTAL
		viberBot.getBot().onTextMessage(/^trade ([A-Z]+)$/i, async (message, response) => {
			viberBot.sendTextMessage(`Please wait.`);
			let assetToInvestIn = message.text.match(/^trade ([A-Z]+)$/i)[1].toUpperCase();
			if (assetToInvestIn) {
				let order = new Order(1, 'limit', 'buy', viberBot, l, SIMULATION, true);
				if (await order.autoTradePreConditions(getBalance, getTradeableAssetPairs, assetToInvestIn, buyExceptions, buyWhiteList, autoTradeCurrencies)) {
					await order.autoTrade(profitPercent, assetToInvestIn, getTicker, addOrder);
				}
			}
			viberBot.recordHistory(message);
		});

		// Set Minimum Balance Amount ASSET_SYMBOL AMOUNT
		viberBot.getBot().onTextMessage(/^(set )?min balance (\S+)( |=)(\S+)$/i, async (message, response) => {
			let matches = message.text.match(/^(set )?min balance (\S+)( |=)(\S+)$/i);
			let assetName = matches[2].toUpperCase();
			let minBalance = parseFloat(matches[4]);
			if (!autoTradeCurrencies[assetName]) {
				viberBot.sendTextMessage(`Failed to set minimum balance: auto-trading currency ${assetName} not found.`);
			}else {
				autoTradeCurrencies[assetName].minBalance = minBalance;
				viberBot.sendTextMessage(`${assetName} minimum balance set to ${minBalance}.`);
			}
			viberBot.recordHistory(message);
		});

		// Set Minimum Trading Amount ASSET_SYMBOL AMOUNT
		viberBot.getBot().onTextMessage(/^(set )?trading min (\S+)( |=)(\S+)$/i, async (message, response) => {
			let matches = message.text.match(/^(set )?trading min (\S+)( |=)(\S+)$/i);
			let assetName = matches[2].toUpperCase();
			let minBuyAmount = parseFloat(matches[4]);
			if (!autoTradeCurrencies[assetName]) {
				viberBot.sendTextMessage(`Failed to set minimum trading amount: auto-trading currency ${assetName} not found.`);
			}else {
				autoTradeCurrencies[assetName].minBuyAmount = minBuyAmount;
				viberBot.sendTextMessage(`${assetName} minimum buying amount set to ${minBuyAmount}.`);
			}
			viberBot.recordHistory(message);
		});

		// Set Trading Percentage ASSET_SYMBOL AMOUNT
		viberBot.getBot().onTextMessage(/^(set )?trading percent (\S+)( |=)(\S+)$/i, async (message, response) => {
			let matches = message.text.match(/^(set )?trading percent (\S+)( |=)(\S+)$/i);
			let assetName = matches[2].toUpperCase();
			let buyPercent = parseFloat(matches[4]);
			if (!autoTradeCurrencies[assetName]) {
				viberBot.sendTextMessage(`Failed to set trading percent: auto-trading currency ${assetName} not found.`);
			}else {
				autoTradeCurrencies[assetName].buyPercent = buyPercent;
				viberBot.sendTextMessage(`${assetName} trading percent set to ${buyPercent}.`);
			}
			viberBot.recordHistory(message);
		});

		// Set Profit Percentage ASSET_SYMBOL AMOUNT
		viberBot.getBot().onTextMessage(/^(set )?profit percent (\S+)$/i, async (message, response) => {
			let matches = message.text.match(/^(set )?profit percent (\S+)$/i);
			let newProfitPercent = parseFloat(matches[2]);
			profitPercent = newProfitPercent;
			viberBot.sendTextMessage(`Profit percent set to ${profitPercent}.`);
			viberBot.recordHistory(message);
		});

		// Get Auto-Trading Configuration
		viberBot.getBot().onTextMessage(/^(get )?(auto)?( |-)?trading config(uration)?$/i, async (message, response) => {
			for (let assetName in autoTradeCurrencies) {
				viberBot.sendTextMessage(`AUTOTRADE_CURRENCIES:\n${JSON.stringify(autoTradeCurrencies[assetName], null, 2)}.`);
				await sleep(1000);
			}
			viberBot.sendTextMessage(`BUY_EXCEPTIONS=${buyExceptions}`);
			await sleep(1000);
			viberBot.sendTextMessage(`BUY_WHITELIST=${buyWhiteList}`);
			await sleep(1000);
			viberBot.sendTextMessage(`PROFIT_PERCENT=${profitPercent}`);
			await sleep(1000);
			viberBot.sendTextMessage(`STALE_ORDER_DAYS=${staleOrderDays}`);
			await sleep(1000);
			viberBot.sendTextMessage(`STALE_ORDER_PRICE_DIFFERENCE_PERCENT=${staleOrderPriceDifferencePercent}`);
			viberBot.recordHistory(message);
		});

		// Get History
		viberBot.getBot().onTextMessage(/^history$/i, async (message, response) => {
			viberBot.sendHistory();
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
			viberBot.recordHistory(message);
		});

		// Trending
		viberBot.getBot().onTextMessage(/^(trending( coins)?)$/i, async (message, response) => {
			await getTrendingCoinList({searchParams: {}, headers: {accept: 'application/json'}}).then(cgResponse => {
				if (cgResponse.statusCode>=200 && cgResponse.statusCode<300) {
					viberBot.sendTextMessage(coingecko.reportTrendingCoins(cgResponse));
				}else { viberBot.sendTextMessage(`Request failed.`); }
			});
			viberBot.recordHistory(message);
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
			viberBot.recordHistory(message);
		});
	}

	let timestampSecondsI=0, timestampSecondsF;
	let maxNumOHLCResults = properties.get("ohlc.MAX_NUM_RESULTS");
	let assets = properties.get("ohlc.ASSETS").split(' ');
	l.i(`Assets: ${assets}`);
	l.i(`#Assets: ${assets.length}`);
	let tradeableAssets = await TradeableAssetPair.findTradeableAssets(assets, getTradeableAssetPairs, autoTradeCurrencies, l, SIMULATION);
	l.i(`Auto-tradeable assets: ${tradeableAssets}`);
	l.i(`#Auto-tradeable assets: ${tradeableAssets.length}`);
	let prevRecommendedAssets;
	let oldOrdersReminderSent = false;

	while(true) {

		l.i(`Entered Dalgon main loop.`);

		try {

			if (viberBot) {
				// Cancel and sell any take-profit orders that went stale
				let staleResult = await Order.sellStaleProfitOrders(priceToMarketSeries, profitPercent, staleOrderExceptions, staleOrderDays, staleOrderPriceDifferencePercent, getOpenOrders, TIMEZONE, getTicker, cancelOrder, addOrder, l);
				priceToMarketSeries = staleResult.priceToMarketSeries;
				Order.writePriceToMarketSeries(priceToMarketSeriesFilePath, priceToMarketSeries, l);
				if (staleResult.result) viberBot.sendBigTextMessage(staleResult.report);
			}

			if (viberBot && viberBot.pauseAnalysis) {
				l.i("Analysis paused...");
				await sleep(5 * 60000);
				continue;
			}
			
			// Send message to the subscribers every 3 hours that the script is running
			timestampSecondsF = Math.floor(Date.now() / 1000);
			if (viberBot && timestampSecondsF - timestampSecondsI >= 3 * 60 * 60) {
				let canStartTradingMsg = viberBot.canStartTrading ? " I am permitted to auto-trade." : " I am not permitted to auto-trade.";
				viberBot.sendTextMessage(`Running evaluation on assets to recommend.${canStartTradingMsg}`);
				timestampSecondsI = Math.floor(Date.now() / 1000);
			}
			// Analyse assets to recommend for trading
			let analysis = new Analysis(tradeableAssets, maxNumOHLCResults, BASE_CURRENCY, l, SIMULATION);
			let recommendedAssets = await analysis.recommend(getOHLC, reportFilePath);

			// If first time sending recommended assets, or assets different than previous
			// and macd previous < 0 and macd current > 0, then send recommended assets
			if ((isEmpty(prevRecommendedAssets) || (recommendedAssets.map(asset => asset.name).join(',') != prevRecommendedAssets.map(asset => asset.name).join(','))) &&
				!isEmpty(recommendedAssets.filter(asset => asset.macdPrevious < 0 && asset.macdCurrent > 0))) {
				viberBot.sendRecommendedAssets(reportFilePath);
				prevRecommendedAssets = recommendedAssets.map(asset => asset);
				timestampSecondsI = Math.floor(Date.now() / 1000);
			}

			// Get the Open Orders
			let openOrderAssetPairs = [];
			let existOldOrders = false;
			let openOrdersResponseBody = await Order.request(getOpenOrders, {});
			await sleep(1000);
			if (openOrdersResponseBody && openOrdersResponseBody.result) {
				if (!isEmpty(openOrdersResponseBody.result.open)) {
					for(let txid in openOrdersResponseBody.result.open) {
						let openOrderAssetPair = openOrdersResponseBody.result.open[txid].descr.pair;
						openOrderAssetPairs.push(openOrderAssetPair);

						let dateNow = new Date().getTime();
						let date = new Date(Math.round(Math.floor(parseFloat(openOrdersResponseBody.result.open[txid].opentm)*1000))).getTime();
						let daysDiff = (dateNow - date)/(1000*60*60*24);
						if (daysDiff >= staleOrderDays -1) {
							existOldOrders = true;
						}
					}
				}
			}
			
			// Remind of old orders to monitor
			if (viberBot && existOldOrders && (new Date()).getHours() == 12 && oldOrdersReminderSent == false) {
				viberBot.sendTextMessage(l.i(`Reminder: there are open orders older than ${staleOrderDays - 1} days old remaining. Monitor for selling opportunities.`, 1));
				oldOrdersReminderSent = true;
			}else if ((new Date()).getHours() != 12) {
				oldOrdersReminderSent = false;
			}

			if (isEmpty(recommendedAssets)) {
				l.i("No recommended assets. Sleeping...");
				await sleep(5 * 60000);
				continue;
			}
			
			// If allowed to auto-trade
			if (viberBot && viberBot.canStartTrading) {

				let assetResultsReversed = recommendedAssets.reverse();
				let assetToInvestIn;
				// Attempt to auto-trade each recommended asset, starting from the best recommendation
				for (let i=0; i<assetResultsReversed.length; i++) {

					if (assetResultsReversed.length < 2) {
						l.w(`Will not proceed to auto-trade: there must be at least 2 recommendations.`, 1, true);
						break;
					}

					assetToInvestIn = assetResultsReversed[i].name;
					l.i(`Initiating auto-trading for asset ${assetToInvestIn}`, 0, true);

					// Asset should hit bottom and about to trend upwards
					if (assetResultsReversed[i].candleStickScore < 0.000) {
						l.w(`Will not proceed to order ${assetToInvestIn}: candlestick score < 0.000.`, 1, true);
						continue;
					}

					// If there is an open order for the asset to invest in, do not trade
					let assetInfos = await AssetInfo.request(getAssetInfo, {searchParams: { asset: assetToInvestIn }}, l, SIMULATION);
					await sleep(1000);
					if (!isEmpty(assetInfos)) {
						let assetHasOpenOrder = false;
						for (let i=0; i < assetInfos.length; i++) { // there should be only one
							let assetInfo = assetInfos[i];
							if (openOrderAssetPairs.filter( (pair) => pair.startsWith(assetInfo.assetName) || pair.startsWith(assetInfo.altName) ).length > 0) {
								l.w(`Will not proceed to order ${assetToInvestIn}: there is an open order for this asset.`, 1, true);
								assetHasOpenOrder = true;
							}
						}
						if (assetHasOpenOrder) {
							continue;
						}
					}

					// Create a new Order
					let order = new Order(1, 'limit', 'buy', viberBot, l, SIMULATION);
					// If prerequisites to auto-trade are met, submit the limit Order with conditional take-profit
					if (await order.autoTradePreConditions(getBalance, getTradeableAssetPairs, assetToInvestIn, buyExceptions, buyWhiteList, autoTradeCurrencies)) {
						let autoTradeResult = await order.autoTrade(profitPercent, assetToInvestIn, getTicker, addOrder);
						if (!autoTradeResult) {
							viberBot.canStartTrading = false;
							viberBot.sendTextMessage(`I stopped auto-trading. Awaiting instructions.`);
							break;
						}
					}
					await sleep(1000);
					l.i(`Completed auto-trading for asset ${assetToInvestIn}`, 0, true);
				}
			}
			l.i("Sleeping...");
			await sleep(5 * 60000);

		}catch(e) {
			let exceptionMsg = l.err(`Exception caught: ${e}`, 0, true);
			if (viberBot) viberBot.sendTextMessage(`${exceptionMsg}`);
			await sleep(3000);
		}

	}

})();
