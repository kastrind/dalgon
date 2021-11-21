import { options } from './command.js';
import PropertiesReader from 'properties-reader';
import Logger from './Logger.js';
import Dalgon from './Dalgon.js';
import CoinGecko from './CoinGecko.js';
import Ledger from './Ledger.js';
import Ticker from './Ticker.js';
import OHLC from './OHLC.js';
import OHLCRange from './OHLCRange.js';

import { isEmpty, sleep } from './utils.js';


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

// dalgon instance
var dalgon = new Dalgon(APIKEY, PRIVATEAPIKEY, l, SIMULATION);


var getTicker = dalgon.createPublicFunction('/0/public/Ticker', 'Request for Get Ticker');
var getOHLC = dalgon.createPublicFunction('/0/public/OHLC', 'Request for Get OHLC Data');

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

var privateHeaderObj = {'Content-Type': 'application/x-www-form-urlencoded; charset=utf-8'};


var getLedgerInfo     = dalgon.createPrivateFunction('/0/private/Ledgers',        privateHeaderObj, 'Request for Get Ledger Info');
var getBalance        = dalgon.createPrivateFunction('/0/private/Balance',        privateHeaderObj, 'Request for Get Balance');
var getTradeBalance   = dalgon.createPrivateFunction('/0/private/TradeBalance',   privateHeaderObj, 'Request for Trade Balance');
var getOpenOrders     = dalgon.createPrivateFunction('/0/private/OpenOrders',     privateHeaderObj, 'Request for Open Orders');
var getDepositMethods = dalgon.createPrivateFunction('/0/private/DepositMethods', privateHeaderObj, 'Request for Deposit Methods');
var cancelAllOrders   = dalgon.createPrivateFunction('/0/private/CancelAll',      privateHeaderObj, 'Request for Cancel All Orders');

(async function () {
	let maxNumResults = properties.get("ohlc.MAXNUMRESULTS");
	// let assets = properties.get("ohlc.ASSETS").split(' ');
	// for (let i=0; i < assets.length; i++) {
	// 	let asset = assets[i];
	// 	let assetPair = `${asset}${BASE_CURRENCY}`;
	// 	let ohlc = await (OHLC.request(getOHLC, assetPair, '2021-11-12T01:30:00.000Z', maxNumResults, l, SIMULATION));
	// 	let change = ohlc.getChange();
	// 	if (change > 0) {
	// 		l.i(`${assetPair} is up!`);
	// 	}
	// 	l.i(`${assetPair} open change: `+ change);
	// 	setTimeout(async function() {}, 5000);

	// }

})();
