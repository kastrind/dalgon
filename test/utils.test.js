// import { createRequire } from 'module';
// const require = createRequire(import.meta.url);

//const assert = require('assert');

import assert from 'assert';
import { isEmpty, isOK } from '../src/utils.js';

describe('isEmpty Test', () => {
	it('should return true with empty array', () => {
		assert.equal(isEmpty([]), true);
	});
	it('should return true with empty object', () => {
		assert.equal(isEmpty({}), true);
	});
	it('should return true with undefined', () => {
		assert.equal(isEmpty(undefined), true);
	});
	it('should return true with null', () => {
		assert.equal(isEmpty(null), true);
	});
	it('should return false with zero', () => {
		assert.equal(isEmpty(0), false);
	});
	it('should return false with one', () => {
		assert.equal(isEmpty(1), false);
	});
	it('should return false with non-empty array', () => {
		assert.equal(isEmpty([1]), false);
	});
	it('should return false with primitive constructor', () => {
		assert.equal(isEmpty(new Number()), false);
	});
	it('should return true with object constructor', () => {
		assert.equal(isEmpty(new Object()), true);
	});
});

describe('isOK Test', () => {
	it('should be OK with 200', () => {
		assert.equal(isOK(200), true);
	});
	it('should be OK with 201', () => {
		assert.equal(isOK(201), true);
	});
	it('should be OK with 299', () => {
		assert.equal(isOK(299), true);
	});
	it('should not be OK with 404', () => {
		assert.equal(isOK(404), false);
	});
	it('should not be OK with 500', () => {
		assert.equal(isOK(500), false);
	});
	it('should not be OK with 2', () => {
		assert.equal(isOK(2), false);
	});
	it('should not be OK with 0', () => {
		assert.equal(isOK(0), false);
	});
	it('should not be OK with empty', () => {
		assert.equal(isOK(''), false);
	});
	it('should not be OK with undefined', () => {
		assert.equal(isOK(undefined), false);
	});
});