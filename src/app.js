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
var getTicker = dalgon.createPublicFunction('/0/public/Ticker', 'Request for Get Ticker');
var getOHLC = dalgon.createPublicFunction('/0/public/OHLC', 'Request for Get OHLC Data');
var privateHeaderObj = {'Content-Type': 'application/x-www-form-urlencoded; charset=utf-8'};
var getLedgerInfo     = dalgon.createPrivateFunction('/0/private/Ledgers',        privateHeaderObj, 'Request for Get Ledger Info');
var getBalance        = dalgon.createPrivateFunction('/0/private/Balance',        privateHeaderObj, 'Request for Get Balance');
var getTradeBalance   = dalgon.createPrivateFunction('/0/private/TradeBalance',   privateHeaderObj, 'Request for Trade Balance');
var getOpenOrders     = dalgon.createPrivateFunction('/0/private/OpenOrders',     privateHeaderObj, 'Request for Open Orders');
var getDepositMethods = dalgon.createPrivateFunction('/0/private/DepositMethods', privateHeaderObj, 'Request for Deposit Methods');
var cancelAllOrders   = dalgon.createPrivateFunction('/0/private/CancelAll',      privateHeaderObj, 'Request for Cancel All Orders');

(async function () {

	let reportFilePath = properties.get('main.ASSETREPORTFILE');
	fs.writeFile(reportFilePath, '', function (err) { if (err) throw err; });

	if (cmdOpts.botAuthToken) {
		let viberBotExposeUrl = properties.get("viberBot.EXPOSEURL");
		let viberBotPort = properties.get("viberBot.PORT");
		let viberBotName = properties.get("viberBot.BOTNAME");
		let viberBotAvatarUrl = properties.get("viberBot.AVATARURL");
		let viberBotAuthToken = cmdOpts.botAuthToken;
		let viberBot = new DalgonViberBot(l, reportFilePath, viberBotExposeUrl, viberBotPort, viberBotName, viberBotAvatarUrl, viberBotAuthToken);
	}
	
	let maxNumResults = properties.get("ohlc.MAXNUMRESULTS");
	let assets = properties.get("ohlc.ASSETS").split(' ');
	let day24h = new Date();
	day24h.setHours(day24h.getHours() - 24);
	let week = new Date();
	week.setHours(week.getHours() - 24*7);
	let month = new Date();
	month.setHours(month.getHours() - 24*30);
	let quarter = new Date();
	quarter.setHours(quarter.getHours() - 24*30*3);
	var report = "";
	for (let i=0; i < assets.length; i++) {
		let asset = assets[i];
		let assetPair = `${asset}${BASE_CURRENCY}`;
		l.i(`Asset ${asset}:`);
		let ohlcDay24h = await (OHLC.request(getOHLC, assetPair, day24h.toISOString(), maxNumResults, l, SIMULATION));
		let changeDay24h = ohlcDay24h.getChange();
		sleep(1000);
		let ohlcWeek = await (OHLC.request(getOHLC, assetPair, week.toISOString(), maxNumResults, l, SIMULATION));
		let changeWeek = ohlcWeek.getChange();
		sleep(1000);
		let ohlcMonth = await (OHLC.request(getOHLC, assetPair, month.toISOString(), maxNumResults, l, SIMULATION));
		let changeMonth = ohlcMonth.getChange();
		sleep(1000);
		let ohlcQuarter = await (OHLC.request(getOHLC, assetPair, quarter.toISOString(), maxNumResults, l, SIMULATION));
		let changeQuarter = ohlcQuarter.getChange();
		sleep(1000);

		let lowestCloseWeek = ohlcWeek.getLowestClose().close;
		let priceOverLowestWeek = 0;
		if ( lowestCloseWeek > 0) {
			priceOverLowestWeek = ( ohlcDay24h.ticks[ohlcDay24h.ticks.length -1].close - lowestCloseWeek ) / lowestCloseWeek;
		}
		let highestCloseWeek = ohlcWeek.getHighestClose().close;
		let priceOverHighestWeek = 0;
		if ( highestCloseWeek > 0) {
			priceOverHighestWeek = ( highestCloseWeek - ohlcDay24h.ticks[ohlcDay24h.ticks.length -1].close ) / ohlcDay24h.ticks[ohlcDay24h.ticks.length-1].close;
		}
		let lowestCloseMonth = ohlcMonth.getLowestClose().close;
		let priceOverLowestMonth = 0;
		if ( lowestCloseMonth > 0) {
			priceOverLowestMonth = ( ohlcDay24h.ticks[ohlcDay24h.ticks.length -1].close - lowestCloseMonth ) / lowestCloseMonth;
		}
		let highestCloseMonth = ohlcMonth.getHighestClose().close;
		let priceOverHighestMonth = 0;
		if ( highestCloseMonth > 0) {
			priceOverHighestMonth = ( highestCloseMonth - ohlcDay24h.ticks[ohlcDay24h.ticks.length -1].close ) / ohlcDay24h.ticks[ohlcDay24h.ticks.length-1].close;
		}

		report = "";

		if (changeDay24h <= 0 && changeWeek <= 0 && changeMonth > 0) {
			l.i(`${assetPair} is down ${prcnt(changeDay24h)}% in 24h, ${prcnt(changeWeek)}% week and up ${prcnt(changeMonth)}% in month.`, 1);
			l.i(`${assetPair} price is ${prcnt(priceOverLowestWeek)}% up over the lowest in week.`, 1);
			l.i(`${assetPair} price is ${prcnt(priceOverHighestWeek)}% down over the highest in week.`, 1);
			l.i(`${assetPair} price is ${prcnt(priceOverLowestMonth)}% up over the lowest in month.`, 1);
			l.i(`${assetPair} price is ${prcnt(priceOverHighestMonth)}% down over the highest in month.`, 1);
			report += `${assetPair} is down ${prcnt(changeDay24h)}% in 24h, ${prcnt(changeWeek)}% week and up ${prcnt(changeMonth)}% in month.\n`;
		}else if (changeDay24h <= 0 && changeWeek <= 0 && changeMonth <= 0 && changeQuarter > 0) {
			l.i(`${assetPair} is down ${prcnt(changeDay24h)}% in 24h, ${prcnt(changeWeek)}% week, ${prcnt(changeMonth)}% in month and ${prcnt(changeQuarter)}% up in quarter.`, 1);
			report += `${assetPair} is down ${prcnt(changeDay24h)}% in 24h, ${prcnt(changeWeek)}% week, ${prcnt(changeMonth)}% in month and ${prcnt(changeQuarter)}% up in quarter.\n`;
			l.i(`${assetPair} price is ${prcnt(priceOverLowestWeek)}% up over the lowest in week.`, 1);
			l.i(`${assetPair} price is ${prcnt(priceOverHighestWeek)}% down over the highest in week.`, 1);
			l.i(`${assetPair} price is ${prcnt(priceOverLowestMonth)}% up over the lowest in month.`, 1);
			l.i(`${assetPair} price is ${prcnt(priceOverHighestMonth)}% down over the highest in month.`, 1);
		}
		fs.appendFile(reportFilePath, report, function (err) { if (err) throw err; });
	}

})();
