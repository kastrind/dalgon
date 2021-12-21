import PropertiesReader from 'properties-reader';
import Dalgon from '../src/Dalgon.js';
import TradeableAssetPair from '../src/TradeableAssetPair.js';
import Logger from '../src/Logger.js';
import { isEmpty } from '../src/utils.js';
import assert from 'assert';

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
var getTradeableAssetPairs = dalgon.createPublicFunction('/0/public/AssetPairs', 'Request for Get Tradeable Asset Pairs');

(async function () {
	let tap;
	describe('TradeableAssetPair Test', () => {
		it('should create TradeableAssetPair instance', async () => {
			tap = await (TradeableAssetPair.request(getTradeableAssetPairs,{ searchParams: { pair: "XXRPXXBT" } }, l, SIMULATION));
			assert.equal(isEmpty(tap), false);
		});

		it('should return one TradeableAssetPair instance', async () => {
			assert(tap.length, 1);
		});
		
		it('should assign TradeableAssetPair values to the appropriate properties', async () => {
			assert(tap[0].altName, tap[0].response.altname);
			assert(tap[0].wsName, tap[0].response.wsname);
			assert(tap[0].aClassBase, tap[0].response.aclass_base);
			assert(tap[0].base, tap[0].response.base);
			assert(tap[0].aClassQuote, tap[0].response.aclass_quote);
			assert(tap[0].quote, tap[0].response.quote);
			assert(tap[0].lot, tap[0].response.lot);
			assert(tap[0].pairDecimals, tap[0].response.pair_decimals);
			assert(tap[0].lotDecimals, tap[0].response.lot_decimals);
			assert(tap[0].lotMultiplier, tap[0].response.lot_multiplier);
			assert(tap[0].leverageBuy, tap[0].response.leverage_buy);
			assert(tap[0].leverageSell, tap[0].response.leverage_sell);
			assert(tap[0].fees, tap[0].response.fees);
			assert(tap[0].makerFees, tap[0].response.fees_maker);
			assert(tap[0].feeVolCurrency, tap[0].response.fee_volume_currency);
			assert(tap[0].marginCall, tap[0].response.margin_call);
			assert(tap[0].marginStop, tap[0].response.margin_stop);
			assert(tap[0].orderMin, tap[0].response.ordermin);
		});

	});
	
})();
