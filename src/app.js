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

// var sinceDate = new Date("10/20/2021");
// l.i("  "+sinceDate.valueOf());

var getCoinGeckoOHLC = coingecko.createPublicFunction('/coins/{id}/ohlc', 'Request for CoinGecko OHLC');
var getCoinGeckoCoinList = coingecko.createPublicFunction('/coins/list', 'Request for CoinGecko Coins List');

(async function () {
	//let coinGeckoOHLC = await getCoinGeckoOHLC({'{id}': 'bitcoin', searchParams: { vs_currency: 'eur', days: '1'}, headers: {accept: 'application/json'}}, {});
	//l.i(""+coinGeckoOHLC.body);
	let cgCoinListResponse = await getCoinGeckoCoinList({}, {searchParams: {}, headers: {accept: 'application/json'}});
	let cgCoins = JSON.parse(cgCoinListResponse.body);
	if (!isEmpty(cgCoins)) {
		for (let i=0; i<cgCoins.length; i++) {
			let coinId = cgCoins[i].id;
			let coinSymbol = cgCoins[i].symbol;
			let coinName = cgCoins[i].name;
			let cgOHLCResponse = await getCoinGeckoOHLC({'{id}': coinId, searchParams: { vs_currency: 'eur', days: '1'}, headers: {accept: 'application/json'}}, {});
			let cgOHLC = JSON.parse(cgOHLCResponse.body);
			l.i(JSON.stringify(cgOHLC));
			await sleep(1000);
		}
	}
})();


/*
getOHLC({ searchParams: { pair: "XRPEUR", interval: 5, since: sinceDate.valueOf()/1000 }}).then(function(s) {
	l.i("Back from OHLC: " + JSON.stringify(JSON.parse(s.body), null, 2));
	let response = JSON.parse(s.body);
	l.i("timestamp = " + response.result['XXRPZEUR'][0][0]*60);
	var date = new Date(response.result['XXRPZEUR'][0][0]*1000);
	l.i("dateI = " + date);
	var date = new Date(response.result['XXRPZEUR'][ response.result['XXRPZEUR'].length - 1 ][0]*1000);
	l.i("dateF = " + date);
	l.i("length = " + response.result['XXRPZEUR'].length);
});
*/


var privateHeaderObj = {'Content-Type': 'application/x-www-form-urlencoded; charset=utf-8'};


var getLedgerInfo     = dalgon.createPrivateFunction('/0/private/Ledgers',        privateHeaderObj, 'Request for Get Ledger Info');
var getBalance        = dalgon.createPrivateFunction('/0/private/Balance',        privateHeaderObj, 'Request for Get Balance');
var getTradeBalance   = dalgon.createPrivateFunction('/0/private/TradeBalance',   privateHeaderObj, 'Request for Trade Balance');
var getOpenOrders     = dalgon.createPrivateFunction('/0/private/OpenOrders',     privateHeaderObj, 'Request for Open Orders');
var getDepositMethods = dalgon.createPrivateFunction('/0/private/DepositMethods', privateHeaderObj, 'Request for Deposit Methods');
var cancelAllOrders   = dalgon.createPrivateFunction('/0/private/CancelAll',      privateHeaderObj, 'Request for Cancel All Orders');

(async function () {
	// let timeTolerance = properties.get("ledger.TIMETOLERANCE");
	// let ledger = await (Ledger.request(getLedgerInfo, {ofs: 0}, timeTolerance, BASE_CURRENCY, l, SIMULATION));
	// let ledgerGroups = ledger.groupLedgerEntries();
	// let ledgerAssetPurchaseInfo = ledger.getAssetPurchaseInfo();

	// let ticker = await (Ticker.request(getTicker, { searchParams: { pair: "XRPEUR" } }, l, SIMULATION));
	// l.d(JSON.stringify(ticker, null, 2));

	// let ohlc = await (OHLC.request(getOHLC, { searchParams: { pair: "XRPEUR" } }, l, SIMULATION));
	// l.i(JSON.stringify(ohlc, null, 2));


	//let ohlcRange = new OHLCRange('1800-01-01', maxNumResults);
	// let ohlcRange = OHLCRange.create('2002-01-01', maxNumResults);
	// l.i("  "+isEmpty(ohlcRange));
	// l.i(JSON.stringify(ohlcRange, null, 2));

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

	//OHLC Dynamic Date
	// var d = new Date();
	// d.setHours(d.getHours() - 24);
	// console.log(d.toISOString());

	// let ohlc = await (OHLC.request(getOHLC, "MANAEUR", d.toISOString(), maxNumResults, l, SIMULATION));
	// let change = ohlc.getChange();
	// l.i(`ohlc first:`+ JSON.stringify(ohlc.ticks[0], null, 2));
	// l.i(`ohlc last:`+ JSON.stringify(ohlc.ticks[ohlc.ticks.length-1], null, 2));
	// l.i(`open change: `+ change);
	// l.i(`length: `+ ohlc.ticks.length);

	/*
	let ohlc = await (OHLC.request(getOHLC, 'SOLEUR', '2021-11-12T00:35:00.000Z', maxNumResults, l, SIMULATION));
	l.i(JSON.stringify(ohlc, null, 2));
	l.i(`ohlc highest:`+ JSON.stringify(ohlc.getHighest(), null, 2));
	l.i(`ohlc highest close:`+ JSON.stringify(ohlc.getHighestClose(), null, 2));
	l.i(`ohlc lowest:`+ JSON.stringify(ohlc.getLowest(), null, 2));
	l.i(`ohlc lowest close:`+ JSON.stringify(ohlc.getLowestClose(), null, 2));
	l.i(`ohlc max vol:`+ JSON.stringify(ohlc.getMaxVol(), null, 2));
	l.i(`ohlc min vol:`+ JSON.stringify(ohlc.getMinVol(), null, 2));
	l.i(`ohlc first:`+ JSON.stringify(ohlc.ticks[0], null, 2));
	l.i(`ohlc last:`+ JSON.stringify(ohlc.ticks[ohlc.ticks.length-1], null, 2));
	l.i(`open change: `+ ohlc.getChange());
	*/
	
})();
