import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { assertNoClosure } from '../utils.js';

describe('assertNoClosure', () => {
  describe('allows functions without closures', () => {
    it('arrow with params only', () => {
      assert.doesNotThrow(() => assertNoClosure('(x) => x * 2', 'run'));
    });

    it('arrow with local variables', () => {
      assert.doesNotThrow(() => assertNoClosure('(ctx, input) => { const y = ctx.value + input; return y; }', 'run'));
    });

    it('function expression', () => {
      assert.doesNotThrow(() => assertNoClosure('function(x) { return x + 1; }', 'run'));
    });

    it('named function expression', () => {
      assert.doesNotThrow(() => assertNoClosure('function run(x) { return x + 1; }', 'run'));
    });

    it('async arrow', () => {
      assert.doesNotThrow(() => assertNoClosure('async (ctx) => { const r = await fetch("url"); return r; }', 'run'));
    });

    it('destructured params', () => {
      assert.doesNotThrow(() => assertNoClosure('({a, b: c}, [d, ...e]) => a + c + d + e.length', 'run'));
    });

    it('nested function declaration', () => {
      assert.doesNotThrow(() => assertNoClosure('(arr) => { function helper(x) { return x * 2; } return arr.map(helper); }', 'run'));
    });

    it('for-of loop variable', () => {
      assert.doesNotThrow(() => assertNoClosure('(arr) => { let sum = 0; for (const x of arr) sum += x; return sum; }', 'run'));
    });

    it('member access on params', () => {
      assert.doesNotThrow(() => assertNoClosure('(ctx) => ctx.data.map(x => x.value)', 'run'));
    });

    it('globals like console, Buffer, Math, Array', () => {
      assert.doesNotThrow(() => assertNoClosure('(ctx) => { console.log(Math.max(...ctx)); return Buffer.from(Array.of(1)); }', 'run'));
    });

    it('try-catch with error binding', () => {
      assert.doesNotThrow(() => assertNoClosure('(ctx) => { try { return ctx(); } catch (e) { return e; } }', 'run'));
    });

    it('class expression', () => {
      assert.doesNotThrow(() => assertNoClosure('() => { class Foo { bar() { return 1; } } return new Foo(); }', 'run'));
    });

    it('label statements', () => {
      assert.doesNotThrow(() => assertNoClosure('() => { outer: for (let i = 0; i < 10; i++) { break outer; } }', 'run'));
    });
  });

  describe('detects closures', () => {
    it('single closed-over variable', () => {
      assert.throws(() => assertNoClosure('(x) => x + closedOver', 'run'), /closedOver/);
    });

    it('multiple closed-over variables', () => {
      assert.throws(() => assertNoClosure('(ctx) => sharedData.filter(x => x > threshold)', 'run'), /sharedData/);
    });

    it('closed-over function call', () => {
      assert.throws(() => assertNoClosure('(ctx) => helper(ctx)', 'run'), /helper/);
    });

    it('closed-over array', () => {
      assert.throws(() => assertNoClosure('() => myArray.map(x => x * 2)', 'run'), /myArray/);
    });

    it('computed member access with outer variable', () => {
      assert.throws(() => assertNoClosure('(obj) => obj[key]', 'run'), /key/);
    });

    it('variable used as argument', () => {
      assert.throws(() => assertNoClosure('() => JSON.stringify(config)', 'run'), /config/);
    });

    it('variable in template literal', () => {
      assert.throws(() => assertNoClosure('() => `${prefix}-value`', 'run'), /prefix/);
    });
  });

  describe('error message', () => {
    it('includes the function name', () => {
      assert.throws(() => assertNoClosure('() => x', 'setup'), /"setup"/);
      assert.throws(() => assertNoClosure('() => x', 'run'), /"run"/);
      assert.throws(() => assertNoClosure('() => x', 'teardown'), /"teardown"/);
    });

    it('lists all closed-over variables', () => {
      try {
        assertNoClosure('() => a + b + c', 'run');
        assert.fail('should have thrown');
      } catch (e) {
        assert.match((e as Error).message, /\ba\b/);
        assert.match((e as Error).message, /\bb\b/);
        assert.match((e as Error).message, /\bc\b/);
      }
    });

    it('explains the problem and suggests fix', () => {
      try {
        assertNoClosure('() => x', 'run');
        assert.fail('should have thrown');
      } catch (e) {
        const msg = (e as Error).message;
        assert.ok(msg.includes('.toString()'));
        assert.ok(msg.includes('worker'));
        assert.ok(msg.includes('setup'));
        assert.ok(msg.includes('data'));
      }
    });
  });

  describe('edge cases', () => {
    it('silently passes on unparseable code', () => {
      assert.doesNotThrow(() => assertNoClosure('not valid js {{{', 'run'));
    });

    it('empty arrow function', () => {
      assert.doesNotThrow(() => assertNoClosure('() => {}', 'run'));
    });

    it('undefined return', () => {
      assert.doesNotThrow(() => assertNoClosure('() => undefined', 'run'));
    });
  });
});
