import PropertiesReader from 'properties-reader';
import Dalgon from '../src/Dalgon.js';
import OHLC from '../src/OHLC.js';
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
var getOHLC = dalgon.createPublicFunction('/0/public/OHLC', 'Request for Get OHLC Data');

(async function () {
	let maxNumResults = properties.get("ohlc.MAX_NUM_RESULTS");
	let ohlc;
	let d = new Date();
	d.setHours(d.getHours() - 24);
	describe('OHLC Test', () => {
		it('should create OHLC instance', async () => {
			ohlc = await (OHLC.request(getOHLC, "MANAEUR", d.toISOString(), maxNumResults, l, SIMULATION));
			assert.equal(isEmpty(ohlc), false);
		});

		it('should have ticks with the expected properties', async () => {
			let tickPropsExpected = ['time', 'date', 'open', 'high', 'low', 'close', 'volWavgPrice', 'vol', 'count'];
			tickPropsExpected.forEach(elem => { assert.equal(ohlc.ticks[0].hasOwnProperty(elem), true); });
		});
		
		it('should have 288 ticks for 24h and 5 min interval', async () => {
			assert.equal(ohlc.ticks.length, 288);
		});

		it('should calculate correct metrics', async () => {
			let simulation = true;
			let dalgonSim = new Dalgon(APIKEY, PRIVATEAPIKEY, l, simulation);
			const ohlcSimResponseJson = require('./assets/OHLC.sim.response.json');
			let getOHLCSim = dalgonSim.createPublicFunction('/0/public/OHLC', 'Request for Get OHLC Data');
			let ohlcSim = await (OHLC.request(getOHLCSim, "MANAEUR", d.toISOString(), maxNumResults, l, simulation, { body: JSON.stringify(ohlcSimResponseJson) } ));
			//console.log(ohlcSim);
			assert.equal(ohlcSim.getChange(), -0.06129232999078365);
			assert.equal(ohlcSim.getHighest().high, 3.87468);
			assert.equal(ohlcSim.getHighestClose().close, 3.8619);
			assert.equal(ohlcSim.getLowest().low, 3.41753);
			assert.equal(ohlcSim.getLowestClose().close, 3.42484);
			assert.equal(ohlcSim.getMinVol().vol, 0);
			assert.equal(ohlcSim.getMaxVol().vol, 87344.26547723);
		});

	});
	
})();
