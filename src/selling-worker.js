import Logger from './Logger.js';
import Dalgon from './Dalgon.js';
import Order from './Order.js';
import { isEmpty, sleep } from './utils.js';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { parentPort, workerData } = require("worker_threads");

// Initialize static info from parent
var VERBOSE = workerData.VERBOSE;
var DEBUG = workerData.DEBUG;
var APIKEY = workerData.APIKEY;
var PRIVATEAPIKEY = workerData.PRIVATEAPIKEY;
var SIMULATION = workerData.SIMULATION;
var TIMEZONE = workerData.TIMEZONE;
var privateHeaderObj = workerData.privateHeaderObj;
var priceToMarketSeriesFilePath = workerData.priceToMarketSeriesFilePath;
var staleOrderExceptions = workerData.staleOrderExceptions;
var staleOrderDays = workerData.staleOrderDays;
var staleOrderPriceDifferencePercent = workerData.staleOrderPriceDifferencePercent;

// Initialize variable info from parent
let profitPercent = workerData.profitPercent;
let recommendedAssetsLength = workerData.recommendedAssetsLength;

let closeWorker = false;

// Update variables from parent
parentPort.once("message", result => {
	let jsonResult = JSON.parse(result);
	// profitPercent = parseFloat(jsonResult.profitPercent);
	// recommendedAssetsLength = parseInt(jsonResult.recommendedAssetsLength);
	closeWorker = jsonResult.close;
});

var l = new Logger(VERBOSE, DEBUG);

// dalgon instance
var dalgon = new Dalgon(APIKEY, PRIVATEAPIKEY, l, SIMULATION);
var getTicker = dalgon.createPublicFunction('/0/public/Ticker', 'Request for Get Ticker');
var getOpenOrders          = dalgon.createPrivateFunction('/0/private/OpenOrders',     privateHeaderObj, 'Request for Open Orders');
var addOrder               = dalgon.createPrivateFunction('/0/private/AddOrder',       privateHeaderObj, 'Request for Adding an Order');
var cancelOrder            = dalgon.createPrivateFunction('/0/private/CancelOrder',    privateHeaderObj, 'Request for Cancel Order');
var getTradeableAssetPairs = dalgon.createPublicFunction('/0/public/AssetPairs', 'Request for Get Tradeable Asset Pairs');

var priceToMarketSeries = Order.readPriceToMarketSeries(priceToMarketSeriesFilePath, l);

(async function () {

	while (true) {

		// Cancel and sell any take-profit orders that went stale or profitable
		let staleResult = await Order.sellStaleProfitOrders(priceToMarketSeries,
															profitPercent,
															staleOrderExceptions,
															staleOrderDays,
															staleOrderPriceDifferencePercent,
															recommendedAssetsLength,
															getOpenOrders,
															TIMEZONE,
															getTicker,
															cancelOrder,
															getTradeableAssetPairs,
															addOrder,
															l);

		priceToMarketSeries = staleResult.priceToMarketSeries;
		Order.writePriceToMarketSeries(priceToMarketSeriesFilePath, priceToMarketSeries, l);

		if (staleResult.result) parentPort.postMessage(staleResult.report);

		if (closeWorker) { break; }

		await sleep(2* 60 * 1000); // Sleep for 2 minutes

	}

})();