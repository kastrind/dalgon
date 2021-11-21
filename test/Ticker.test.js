import PropertiesReader from 'properties-reader';
import Dalgon from '../src/Dalgon.js';
import Ticker from '../src/Ticker.js';
import Logger from '../src/Logger.js';
import { isEmpty } from '../src/utils.js';
import assert from 'assert';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

// constants
var ENV = 'default';
var PRIVATEAPIKEY = "NO_KEY_NEEDED_BECAUSE_ENDPOINT IS PUBLIC";
var VERBOSE = false;
var DEBUG = false;
var SIMULATION = false;

// load config file
var properties = new PropertiesReader(`./test/env/${ENV}.properties`);
// load config properties
var APIKEY = properties.get("main.APIKEY");

// logger
var l = new Logger(VERBOSE, DEBUG);



// dalgon instance
var dalgon = new Dalgon(APIKEY, PRIVATEAPIKEY, l, SIMULATION);
var getTicker = dalgon.createPublicFunction('/0/public/Ticker', 'Request for Get Ticker');

(async function () {
	let ticker;
	describe('Ticker Test', () => {
		it('should create Ticker instance', async () => {
			ticker = await (Ticker.request(getTicker, { searchParams: { pair: "XRPEUR" } }, l, SIMULATION));
			assert.equal(isEmpty(ticker), false);
		});
		
		it('should assign Ticker values to the appropriate properties', async () => {
			assert(ticker.askPrice, ticker.tickerJsonResponse[ticker.assetPairResponse].a[0]);
			assert(ticker.askWLotVol, ticker.tickerJsonResponse[ticker.assetPairResponse].a[1]);
			assert(ticker.askLotVol, ticker.tickerJsonResponse[ticker.assetPairResponse].a[2]);
	
			assert(ticker.bidPrice, ticker.tickerJsonResponse[ticker.assetPairResponse].b[0]);
			assert(ticker.bidWLotVol, ticker.tickerJsonResponse[ticker.assetPairResponse].b[1]);
			assert(ticker.bidLotVol, ticker.tickerJsonResponse[ticker.assetPairResponse].b[2]);
	
			assert(ticker.lastTradeClosedPrice, ticker.tickerJsonResponse[ticker.assetPairResponse].c[0]);
			assert(ticker.lastTradeClosedLotVol, ticker.tickerJsonResponse[ticker.assetPairResponse].c[1]);
	
			assert(ticker.volToday, ticker.tickerJsonResponse[ticker.assetPairResponse].v[0]);
			assert(ticker.volLast24h, ticker.tickerJsonResponse[ticker.assetPairResponse].v[1]);
	
			assert(ticker.volWAvgPriceToday, ticker.tickerJsonResponse[ticker.assetPairResponse].p[0]);
			assert(ticker.volWAvgPriceLast24h, ticker.tickerJsonResponse[ticker.assetPairResponse].p[1]);
	
			assert(ticker.numTradesToday, ticker.tickerJsonResponse[ticker.assetPairResponse].t[0]);
			assert(ticker.numTradesLast24h, ticker.tickerJsonResponse[ticker.assetPairResponse].t[1]);
	
			assert(ticker.lowToday, ticker.tickerJsonResponse[ticker.assetPairResponse].l[0]);
			assert(ticker.lowLast24h, ticker.tickerJsonResponse[ticker.assetPairResponse].l[1]);
	
			assert(ticker.highToday, ticker.tickerJsonResponse[ticker.assetPairResponse].h[0]);
			assert(ticker.highLast24h, ticker.tickerJsonResponse[ticker.assetPairResponse].h[1]);
	
			assert(ticker.openingPriceToday, ticker.tickerJsonResponse[ticker.assetPairResponse].o);
		});

	});
	
})();
