import fs from 'fs';
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
var staleOrderPriceDifferencePercentSequence = workerData.staleOrderPriceDifferencePercentSequence;
var sellingWorkerReportFilePath = workerData.sellingWorkerReportFilePath;
var sellingWorkerHistoryFilePath = workerData.sellingWorkerHistoryFilePath;

// Initialize variable info from parent
let profitPercent = workerData.profitPercent;
let recommendedAssetsLength = workerData.recommendedAssetsLength;

let closeWorker = false;

// Update variables from parent
parentPort.once("message", result => {
	if (result.hasOwnProperty('close') && result.close)
	closeWorker = result.close;
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

		if (closeWorker) { break; }

		try {

			// Cancel and sell any take-profit orders that went stale or profitable
			let staleResult = await Order.sellStaleProfitOrders(priceToMarketSeries,
																profitPercent,
																staleOrderExceptions,
																staleOrderDays,
																staleOrderPriceDifferencePercentSequence,
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

			// if there is sth to report and action was taken, write report
			if (staleResult.report && staleResult.tookAction) {
				fs.appendFileSync(sellingWorkerReportFilePath, staleResult.report, function (err) { if (err) l.err(err, 0, true); });
				if (staleResult.hasOwnProperty('metadata')) {
					fs.appendFileSync(sellingWorkerHistoryFilePath, JSON.stringify(staleResult.metadata)+'\n', function (err) { if (err) l.err(err, 0, true); });
				}
			}

		}catch(error) {
			that.l.err(`Selling worker failed to call Order.sellStaleProfitOrders function`, 0, true);
			that.l.err(`Error name: ${error.name}, message: ${error.message}, stack: ${error.stack}`, 0, true);
		}

		await sleep(90 * 1000); // Sleep for 90 seconds

	}

})();