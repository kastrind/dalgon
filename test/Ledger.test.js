import PropertiesReader from 'properties-reader';
import Dalgon from '../src/Dalgon.js';
import Ledger from '../src/Ledger.js';
import Logger from '../src/Logger.js';
import { isEmpty } from '../src/utils.js';
import assert from 'assert';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

// constants
var ENV = 'default';
var PRIVATEAPIKEY = "NO_KEY_NEEDED_BECAUSE_WE_RUN_SIMULATIONS";
var VERBOSE = false;
var DEBUG = false;
var SIMULATION = true;

// load config file
var properties = new PropertiesReader(`./test/env/${ENV}.properties`);
// load config properties
var APIKEY = properties.get("main.APIKEY");
var BASE_CURRENCY = properties.get("main.BASE_CURRENCY");

// logger
var l = new Logger(VERBOSE, DEBUG);



// dalgon instance
var dalgon = new Dalgon(APIKEY, PRIVATEAPIKEY, l, SIMULATION);
var privateHeaderObj = {'Content-Type': 'application/x-www-form-urlencoded; charset=utf-8'};
var getLedgerInfo = dalgon.createPrivateFunction('/0/private/Ledgers', privateHeaderObj, 'Request for Get Ledger Info');

(async function () {
	let timeTolerance = properties.get("ledger.TIMETOLERANCE");
	let ledger;
	describe('Ledger Test', () => {
		it('should create Ledger instance', async () => {
			const ledgerSimResponseJson = require('./assets/Ledger.sim.response.json');
			ledger = await (Ledger.request(getLedgerInfo, {ofs: 0}, timeTolerance, BASE_CURRENCY, l, SIMULATION, { body: JSON.stringify(ledgerSimResponseJson) } ));
			assert.equal(isEmpty(ledger), false);
			let firstKey = Object.keys(ledger.ledgerJsonResponse.result.ledger)[0];
			let ledgerPropsExpected = ['refid', 'time', 'type', 'subtype', 'aclass', 'asset', 'amount', 'fee', 'balance'];
			ledgerPropsExpected.forEach( elem => { assert.equal(ledger.ledgerJsonResponse.result.ledger[firstKey].hasOwnProperty(elem), true); } );
		});

		it('should have the expected properties in a ledger entry', async () => {
			let firstKey = Object.keys(ledger.ledgerJsonResponse.result.ledger)[0];
			let ledgerPropsExpected = ['refid', 'time', 'type', 'subtype', 'aclass', 'asset', 'amount', 'fee', 'balance'];
			ledgerPropsExpected.forEach( elem => { assert.equal(ledger.ledgerJsonResponse.result.ledger[firstKey].hasOwnProperty(elem), true); } );
		});
	});

	let ledgerGroups;
	describe('Ledger Group Test', () => {
		it('should create 2 Ledger Groups', () => {
			ledgerGroups = ledger.groupLedgerEntries();
			assert.equal(Object.keys(ledgerGroups).length, 2); 
		});
		it('should have THIS-IS-A-TEST as the first group', () => {
			assert.equal(Object.keys(ledgerGroups)[0], 'THIS-IS-A-TEST');
		});
		it('should have LIFE46-PR22N-BE2O2Y as the second group', () => {
			assert.equal(Object.keys(ledgerGroups)[1], 'LIFE46-PR22N-BE2O2Y');
		});
	});

	let ledgerAssetPurchaseInfo;
	describe('Ledger Asset Purchase Info', () => {
		it('should return purchase info on 2 assets', () => {
			ledgerAssetPurchaseInfo = ledger.getAssetPurchaseInfo();
			assert.equal(Object.keys(ledgerAssetPurchaseInfo).length, 2); 
		});
		it('should have XXRP2 as the first asset', () => {
			assert.equal(Object.keys(ledgerAssetPurchaseInfo)[0], 'XXRP2'); 
		});
		it('should have amount = 28.90886, base fees = 0.456 and base deposit = 38.5 ', () => {
			assert.equal(ledgerAssetPurchaseInfo['XXRP2'][0].amount, 28.90886); 
			assert.equal(ledgerAssetPurchaseInfo['XXRP2'][0].baseFees, 0.456); 
			assert.equal(ledgerAssetPurchaseInfo['XXRP2'][0].baseDeposit, 38.5); 
		});
		it('should have XXRP as the second asset', () => {
			assert.equal(Object.keys(ledgerAssetPurchaseInfo)[1], 'XXRP'); 
		});
		it('should have amount = 18.90886, base fees = 1.79 and base deposit = 20 ', () => {
			assert.equal(ledgerAssetPurchaseInfo['XXRP'][0].amount, 18.90886); 
			assert.equal(ledgerAssetPurchaseInfo['XXRP'][0].baseFees, 1.79); 
			assert.equal(ledgerAssetPurchaseInfo['XXRP'][0].baseDeposit, 20); 
		});
	});
	
})();
