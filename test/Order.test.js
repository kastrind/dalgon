import PropertiesReader from 'properties-reader';
import Logger from '../src/Logger.js';
import Dalgon from '../src/Dalgon.js';
import Order from '../src/Order.js';
import { isEmpty } from '../src/utils.js';
import assert from 'assert';

import { createRequire } from 'module';
const require = createRequire(import.meta.url);

// constants
var ENV = 'default';
var PRIVATEAPIKEY = 'NO_KEY_NEEDED';
var VERBOSE = true;
var DEBUG = true;
var FORCE_HIDE = true;
var SIMULATION = true;

// logger
var l = new Logger(VERBOSE, DEBUG, FORCE_HIDE);

// load config file
var properties = new PropertiesReader(`./test/env/${ENV}.properties`);

// load config properties
var APIKEY = properties.get("main.APIKEY");
var TIMEZONE = properties.get("main.TIMEZONE");
var profitPercent = parseFloat(properties.get("main.PROFIT_PERCENT"));
var staleOrderDays = parseFloat(properties.get("main.STALE_ORDER_DAYS"));
var staleOrderPriceDifferencePercentSequence = properties.get("main.STALE_ORDER_PRICE_DIFFERENCE_PERCENT_SEQUENCE").split(',');
var priceToMarketSeriesFilePath = properties.get('main.PRICE_TO_MARKET_SERIES_FILE');
var priceToMarketSeries = Order.readPriceToMarketSeries(priceToMarketSeriesFilePath, l);
var staleOrderExceptions = properties.get('main.STALE_ORDER_EXCEPTIONS').split(' ');

// dalgon instance
var dalgon = new Dalgon(APIKEY, PRIVATEAPIKEY, l, SIMULATION);
var getTicker         = dalgon.createPublicFunction('/0/public/Ticker', 'Request for Get Ticker');
var getOpenOrders     = dalgon.createPrivateFunction('/0/private/OpenOrders', {}, 'Request for Open Orders');
var addOrder          = null;
var cancelOrder       = null;
var getTradeableAssetPairs = null;

const simOpenOrdersObj = require('../test/assets/open.Orders.sim.response.json');
const simTickerObj     = require('../test/assets/Ticker.sim.response.json');

var recommendedAssetsLength = 1;

(async function () {

	describe('Sell Stale Take-profit Orders Search Test', () => {
		it('should sell stale Order', async () => {
			let staleResult = await Order.sellStaleProfitOrders(priceToMarketSeries, profitPercent, staleOrderExceptions, staleOrderDays, staleOrderPriceDifferencePercentSequence, recommendedAssetsLength, getOpenOrders, TIMEZONE, getTicker, cancelOrder, getTradeableAssetPairs, addOrder, l, { body: JSON.stringify(simOpenOrdersObj) }, {}, {}, {}, { body: JSON.stringify(simTickerObj) });
			delete priceToMarketSeries['11O6Z4CS-S5LIA-IOU4TR'];
			delete simOpenOrdersObj.result.open['11O6Z4CS-S5LIA-IOU4TR'];
			assert.equal(staleResult.report.indexOf('Order is stale:')>=0, true);
			assert.equal(staleResult.report.indexOf('61.00% to market price.')>=0, true);
		});

		it('should sell profitable Order at the optimal moment to maximize profit: 1A', async () => {
			let staleResult = await Order.sellStaleProfitOrders(priceToMarketSeries, profitPercent, staleOrderExceptions, staleOrderDays, staleOrderPriceDifferencePercentSequence, recommendedAssetsLength, getOpenOrders, TIMEZONE, getTicker, cancelOrder, getTradeableAssetPairs, addOrder, l, { body: JSON.stringify(simOpenOrdersObj) }, {}, {}, {}, { body: JSON.stringify(simTickerObj) });
			delete priceToMarketSeries['1O6Z4CS-S5LIA-IOU4TR'];
			delete simOpenOrdersObj.result.open['1O6Z4CS-S5LIA-IOU4TR'];
			assert.equal(staleResult.report.indexOf('canSellForProfit 1A')>=0, true);
		});

		it('should sell profitable Order at the optimal moment to maximize profit: 2A', async () => {
			let staleResult = await Order.sellStaleProfitOrders(priceToMarketSeries, profitPercent, staleOrderExceptions, staleOrderDays, staleOrderPriceDifferencePercentSequence, recommendedAssetsLength, getOpenOrders, TIMEZONE, getTicker, cancelOrder, getTradeableAssetPairs, addOrder, l, { body: JSON.stringify(simOpenOrdersObj) }, {}, {}, {}, { body: JSON.stringify(simTickerObj) });
			delete priceToMarketSeries['1OW27RX-YWQBE-2ZZYP7'];
			delete simOpenOrdersObj.result.open['1OW27RX-YWQBE-2ZZYP7'];
			assert.equal(staleResult.report.indexOf('canSellForProfit 2A')>=0, true);
		});

		it('should sell profitable Order at the optimal moment to maximize profit: 2B', async () => {
			let staleResult = await Order.sellStaleProfitOrders(priceToMarketSeries, profitPercent, staleOrderExceptions, staleOrderDays, staleOrderPriceDifferencePercentSequence, recommendedAssetsLength, getOpenOrders, TIMEZONE, getTicker, cancelOrder, getTradeableAssetPairs, addOrder, l, { body: JSON.stringify(simOpenOrdersObj) }, {}, {}, {}, { body: JSON.stringify(simTickerObj) });
			delete priceToMarketSeries['1OOV7GI-OVXI2-KKPO2V'];
			delete simOpenOrdersObj.result.open['1OOV7GI-OVXI2-KKPO2V'];
			assert.equal(staleResult.report.indexOf('canSellForProfit 2B')>=0, true);
		});

		it('should sell profitable Order if gained considerable ground: 3A', async () => {
			let staleResult = await Order.sellStaleProfitOrders(priceToMarketSeries, profitPercent, staleOrderExceptions, staleOrderDays, staleOrderPriceDifferencePercentSequence, recommendedAssetsLength, getOpenOrders, TIMEZONE, getTicker, cancelOrder, getTradeableAssetPairs, addOrder, l, { body: JSON.stringify(simOpenOrdersObj) }, {}, {}, {}, { body: JSON.stringify(simTickerObj) });
			delete priceToMarketSeries['11O7TBWY-TZ2FA-2JS27W'];
			delete simOpenOrdersObj.result.open['11O7TBWY-TZ2FA-2JS27W'];
			assert.equal(staleResult.report.indexOf('canSellForProfit 3A')>=0, true);
		});

	});

})();