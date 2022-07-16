import PropertiesReader from 'properties-reader';
import Logger from '../src/Logger.js';
import Dalgon from '../src/Dalgon.js';
import OHLC from '../src/OHLC.js';
import Analysis from '../src/Analysis.js';
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

// dalgon instance
var dalgon = new Dalgon(APIKEY, PRIVATEAPIKEY, l, SIMULATION);
var getOHLC = dalgon.createPublicFunction('/0/public/OHLC', 'Request for Get OHLC Data');

let tradeableAssets = properties.get("ohlc.ASSETS").split(' ');
//let maxNumOHLCResults = properties.get("ohlc.MAX_NUM_RESULTS");
let maxNumOHLCResults = 5;
var BASE_CURRENCY = properties.get("main.BASE_CURRENCY");

// Analyse assets to recommend for trading
let analysis = new Analysis(tradeableAssets, maxNumOHLCResults, BASE_CURRENCY, l, SIMULATION);

const OHLCBTCEURSimResponseJson = require('./assets/OHLC.BTCEUR.sim.response.json');
const OHLCMANAEURSimResponse1hJson = require('./assets/OHLC.MANAEUR.sim.response.1h.json');
const OHLCMANAEURSimResponse6hJson = require('./assets/OHLC.MANAEUR.sim.response.6h.json');
const OHLCMANAEURSimResponse24hJson = require('./assets/OHLC.MANAEUR.sim.response.24h.json');
const OHLCMANAEURSimResponse1wJson = require('./assets/OHLC.MANAEUR.sim.response.1w.json');
const OHLCMANAEURSimResponse1mJson = require('./assets/OHLC.MANAEUR.sim.response.1m.json');

analysis.setSims(
	{ body: JSON.stringify(OHLCMANAEURSimResponse1hJson) },
	{ body: JSON.stringify(OHLCMANAEURSimResponse6hJson) },
	{ body: JSON.stringify(OHLCMANAEURSimResponse24hJson) },
	{ body: JSON.stringify(OHLCMANAEURSimResponse1wJson) },
	{ body: JSON.stringify(OHLCMANAEURSimResponse1mJson) },
	{},
	{ body: JSON.stringify(OHLCBTCEURSimResponseJson) }); 

let reportFilePath = properties.get('main.ASSET_EVAL_REPORT_FILE');
let recommendedAssets = [];

(async function () {

	describe('Analysis', () => {

		it('should calculate correct metrics', async () => {
			recommendedAssets = await analysis.recommend(getOHLC, reportFilePath);
			
			assert.equal(analysis.report.indexOf('changePastHour: 0.25')>=0, true);
			assert.equal(analysis.report.indexOf('latestClosingPrice: 5')>=0, true);
			assert.equal(analysis.report.indexOf('derivativePastHour: 0.0008333333333333334')>=0, true);

			assert.equal(analysis.report.indexOf('change6h: -0.5')>=0, true);
			assert.equal(analysis.report.indexOf('derivative6h: -0.0033333333333333335')>=0, true);

			assert.equal(analysis.report.indexOf('changeDay24h: -0.2')>=0, true);

			assert.equal(analysis.report.indexOf('changeWeek: -0.18181818181818182')>=0, true);

			assert.equal(analysis.report.indexOf('changeMonth: 0.2727272727272727')>=0, true);

			assert.equal(analysis.report.indexOf('isGreenHammer: true')>=0, true);

			assert.equal(analysis.report.indexOf('lowestCloseWeek: 9')>=0, true);

			assert.equal(analysis.report.indexOf('priceOverLowestWeek: -0.1111111111111111')>=0, true);

			assert.equal(analysis.report.indexOf('priceOverHighestWeek: 0.2727272727272727')>=0, true);


		}).timeout(15000);

	});

})();