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
var strategy = workerData.strategy;
var positionsFilePath = workerData.positionsFilePath;
if (!strategy || !positionsFilePath) throw new Error('Selling worker started without strategy or positions file; restart Dalgon so the app and the worker run the same build.');
var sellingWorkerReportFilePath = workerData.sellingWorkerReportFilePath;
var sellingWorkerHistoryFilePath = workerData.sellingWorkerHistoryFilePath;

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
var getBalance             = dalgon.createPrivateFunction('/0/private/Balance',        privateHeaderObj, 'Request for Get Balance');
var getTradeableAssetPairs = dalgon.createPublicFunction('/0/public/AssetPairs', 'Request for Get Tradeable Asset Pairs');
var queryOrders            = dalgon.createPrivateFunction('/0/private/QueryOrders',    privateHeaderObj, 'Request for Query Orders');
var addOrder               = dalgon.createPrivateFunction('/0/private/AddOrder',       privateHeaderObj, 'Request for Adding an Order');
var cancelOrder            = dalgon.createPrivateFunction('/0/private/CancelOrder',    privateHeaderObj, 'Request for Cancel Order');

var positions = Order.readPositions(positionsFilePath, l);

(async function () {

	while (true) {

		if (closeWorker) { break; }

		try {

			// Exit positions at target or time limit, and journal closed trades
			positions = Order.readPositions(positionsFilePath, l);
			let result = await Order.managePositions(positions, strategy, { getOpenOrders, getTicker, cancelOrder, addOrder, queryOrders, getBalance, getTradeableAssetPairs }, l);

			positions = result.known;
			Order.writePositions(positionsFilePath, positions);

			// if there is sth to report and action was taken, write report
			if (result.report && result.tookAction) {
				fs.appendFileSync(sellingWorkerReportFilePath, result.report);
				for (let entry of result.journal) {
					fs.appendFileSync(sellingWorkerHistoryFilePath, JSON.stringify(entry)+'\n');
				}
			}

		}catch(error) {
			l.err(`Selling worker failed to call Order.managePositions function`, 0, true);
			l.err(`Error name: ${error.name}, message: ${error.message}, stack: ${error.stack}`, 0, true);
		}

		await sleep(90 * 1000); // Sleep for 90 seconds

	}

})();