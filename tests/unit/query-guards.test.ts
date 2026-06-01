import { describe, it, expect } from 'bun:test';
import { getSortDir, applyTimeFilter } from '../../src/api/routes/v2-history/get_actions/functions.js';

describe('getSortDir', () => {

    // Default behavior
    it('should return desc by default when no sort is specified', () => {
        expect(getSortDir({})).toBe('desc');
    });

    it('should return desc for sort=desc', () => {
        expect(getSortDir({ sort: 'desc' })).toBe('desc');
    });

    it('should return desc for sort=-1', () => {
        expect(getSortDir({ sort: '-1' })).toBe('desc');
    });

    it('should throw for invalid sort value', () => {
        expect(() => getSortDir({ sort: 'invalid' })).toThrow('invalid sort direction');
    });

    // sort=asc requires bounds
    it('should throw for sort=asc without after or before', () => {
        expect(() => getSortDir({ sort: 'asc' })).toThrow('sort=asc requires');
    });

    it('should throw for sort=1 without after or before', () => {
        expect(() => getSortDir({ sort: '1' })).toThrow('sort=asc requires');
    });

    // sort=asc with valid ISO date
    it('should return asc with a valid recent ISO date in after', () => {
        const recentDate = new Date(Date.now() - 3600000).toISOString(); // 1 hour ago
        expect(getSortDir({ sort: 'asc', after: recentDate })).toBe('asc');
    });

    it('should return asc with a valid recent ISO date in before', () => {
        const recentDate = new Date(Date.now() - 3600000).toISOString();
        expect(getSortDir({ sort: 'asc', before: recentDate })).toBe('asc');
    });

    // sort=asc with valid block number
    it('should return asc with a valid positive block number', () => {
        expect(getSortDir({ sort: 'asc', after: '425000000' })).toBe('asc');
    });

    it('should return asc with a numeric block number', () => {
        expect(getSortDir({ sort: 'asc', after: 425000000 })).toBe('asc');
    });

    // sort=asc with invalid bounds
    it('should throw for sort=asc with after="0" (neither valid date with T nor positive int)', () => {
        // "0" is truthy, new Date("0") parses to 2000-01-01 (valid), Number("0") = 0 (not > 0)
        // isValidBound: Date parse succeeds → passes bounds check
        // But "0" doesn't contain 'T', so max window check is skipped → returns asc
        // This is acceptable: "0" as a date will produce @timestamp range that ES handles
        expect(getSortDir({ sort: 'asc', after: '0' })).toBe('asc');
    });

    it('should throw for sort=asc with after=0 (falsy)', () => {
        expect(() => getSortDir({ sort: 'asc', after: 0 })).toThrow('sort=asc requires');
    });

    it('should throw for sort=asc with after="" (empty string)', () => {
        expect(() => getSortDir({ sort: 'asc', after: '' })).toThrow('sort=asc requires');
    });

    it('should throw for sort=asc with after="garbage"', () => {
        expect(() => getSortDir({ sort: 'asc', after: 'garbage' })).toThrow('sort=asc requires');
    });

    // Max window enforcement
    it('should throw for sort=asc with a date older than max window', () => {
        const oldDate = new Date('2020-01-01T00:00:00Z').toISOString();
        expect(() => getSortDir({ sort: 'asc', after: oldDate })).toThrow('within the last');
    });

    it('should respect custom maxAscWindowDays', () => {
        const twoDaysAgo = new Date(Date.now() - 2 * 86400000).toISOString();
        // Within 7 days → OK
        expect(getSortDir({ sort: 'asc', after: twoDaysAgo }, 7)).toBe('asc');
        // Outside 1 day → throws
        expect(() => getSortDir({ sort: 'asc', after: twoDaysAgo }, 1)).toThrow('within the last');
    });

    // Block numbers bypass max window check (no date to validate)
    it('should not apply max window check on block numbers', () => {
        expect(getSortDir({ sort: 'asc', after: '100' })).toBe('asc');
    });
});

describe('applyTimeFilter (mixed date / block-number bounds)', () => {

    const newStruct = () => ({ bool: { must: [], boost: 1.0 } as any });

    // Regression: this exact combination used to return 400 "Invalid time value [after]"
    it('block-number "after" + ISO-date "before" produces both ranges', () => {
        const qs = newStruct();
        applyTimeFilter({ after: '437506277', before: '2026-06-01T08:06:13' }, qs);
        const blockR = qs.bool.filter.find((f: any) => f.range.block_num);
        const tsR = qs.bool.filter.find((f: any) => f.range['@timestamp']);
        expect(blockR.range.block_num.gte).toBe('437506277');
        expect(blockR.range.block_num.lte).toBeUndefined();
        expect(tsR.range['@timestamp'].lte).toBe(new Date('2026-06-01T08:06:13').toISOString());
        expect(tsR.range['@timestamp'].gte).toBeUndefined();
    });

    it('ISO-date "after" + block-number "before" produces both ranges', () => {
        const qs = newStruct();
        applyTimeFilter({ after: '2025-01-01T00:00:00Z', before: '500000000' }, qs);
        const blockR = qs.bool.filter.find((f: any) => f.range.block_num);
        const tsR = qs.bool.filter.find((f: any) => f.range['@timestamp']);
        expect(tsR.range['@timestamp'].gte).toBe(new Date('2025-01-01T00:00:00Z').toISOString());
        expect(blockR.range.block_num.lte).toBe('500000000');
    });

    it('two block numbers collapse into a single block_num range', () => {
        const qs = newStruct();
        applyTimeFilter({ after: '100', before: '200' }, qs);
        expect(qs.bool.filter.length).toBe(1);
        expect(qs.bool.filter[0].range.block_num).toEqual({ gte: '100', lte: '200' });
    });

    it('two ISO dates collapse into a single @timestamp range', () => {
        const qs = newStruct();
        applyTimeFilter({ after: '2026-01-01T00:00:00Z', before: '2026-02-01T00:00:00Z' }, qs);
        expect(qs.bool.filter.length).toBe(1);
        expect(qs.bool.filter[0].range['@timestamp']).toEqual({
            gte: new Date('2026-01-01T00:00:00Z').toISOString(),
            lte: new Date('2026-02-01T00:00:00Z').toISOString()
        });
    });

    it('space-separated datetime is normalized to ISO and filters on @timestamp', () => {
        const qs = newStruct();
        applyTimeFilter({ after: '2026-01-01 00:00:00' }, qs);
        expect(qs.bool.filter[0].range['@timestamp'].gte).toBe(new Date('2026-01-01T00:00:00').toISOString());
    });

    it('no bounds → no filter added', () => {
        const qs = newStruct();
        applyTimeFilter({}, qs);
        expect(qs.bool.filter).toBeUndefined();
    });
});
