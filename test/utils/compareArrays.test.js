const assert = require('assert');
const comparator = require('../../src/utils/compareArrays');

describe('compareArrays', function () {
    it('simple case', function () {
        const array1 = [{a: 1, b: 2}];
        const array2 = [{a: 1, b: 3}];
        const result = comparator(array1, array2, 'a');
        const expected = {
            updated: [{a: 1, b: 3}],
            removed: [],
            added: []
        }

        assert.deepEqual(result, expected);
    });

    it('added, removed, updated', function () {
        const array1 = [{a: 1, b: 2}, {a: 2, b: 2}];
        const array2 = [{a: 1, b: 3}, {a: 4, b: 2}];
        const result = comparator(array1, array2, 'a');
        const expected = {
            updated: [{a: 1, b: 3}],
            removed: [{a: 2, b: 2}],
            added: [{a: 4, b: 2}]
        }

        assert.deepEqual(result, expected);
    });
});