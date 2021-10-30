import { options } from './command.js';
import PropertiesReader from 'properties-reader';
import Logger from './Logger.js';
import Dalgon from './Dalgon.js';
import Ledger from './Ledger.js';
import Ticker from './Ticker.js';


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

// dalgon instance
var dalgon = new Dalgon(APIKEY, PRIVATEAPIKEY, l, SIMULATION);


var getTicker = dalgon.createPublicFunction('/0/public/Ticker', 'Request for Get Ticker');

// getTicker({ searchParams: { pair: "ADAEUR" }}).then(function(s) {
// 	l.i("Back from Ticker: " + JSON.stringify(s, null, 2));
// });

var sinceDate = new Date("01/01/2021");
l.i("  "+sinceDate.valueOf());


var getOHLC = dalgon.createPublicFunction('/0/public/OHLC', 'Request for Get OHLC Data');
getOHLC({ searchParams: { pair: "XRPEUR", interval: 1440, since: sinceDate.valueOf()/1000 }}).then(function(s) {
	//l.i("Back from OHLC: " + JSON.stringify(JSON.parse(s.body), null, 2));
	let response = JSON.parse(s.body);
	l.i("timestamp = " + response.result['XXRPZEUR'][0][0]*60);
	var date = new Date(response.result['XXRPZEUR'][0][0]*1000);
	l.i("date = " + date);
	var date = new Date(response.result['XXRPZEUR'][1][0]*1000);
	l.i("date = " + date);
	l.i("length = " + response.result['XXRPZEUR'].length);
});


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

	// let ticker = await (Ticker.request(getTicker, { searchParams: { pair: "XRPEUR" }}, l, SIMULATION));
	// l.d(JSON.stringify(ticker, null, 2));
	
})();
