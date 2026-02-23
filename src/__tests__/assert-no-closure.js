import { assertNoClosure } from '../utils.js';

describe('assertNoClosure', () => {
  describe('allows functions without closures', () => {
    test('arrow with params only', () => {
      expect(() => assertNoClosure('(x) => x * 2', 'run')).not.toThrow();
    });

    test('arrow with local variables', () => {
      expect(() => assertNoClosure('(ctx, input) => { const y = ctx.value + input; return y; }', 'run')).not.toThrow();
    });

    test('function expression', () => {
      expect(() => assertNoClosure('function(x) { return x + 1; }', 'run')).not.toThrow();
    });

    test('named function expression', () => {
      expect(() => assertNoClosure('function run(x) { return x + 1; }', 'run')).not.toThrow();
    });

    test('async arrow', () => {
      expect(() => assertNoClosure('async (ctx) => { const r = await fetch("url"); return r; }', 'run')).not.toThrow();
    });

    test('destructured params', () => {
      expect(() => assertNoClosure('({a, b: c}, [d, ...e]) => a + c + d + e.length', 'run')).not.toThrow();
    });

    test('nested function declaration', () => {
      expect(() => assertNoClosure('(arr) => { function helper(x) { return x * 2; } return arr.map(helper); }', 'run')).not.toThrow();
    });

    test('for-of loop variable', () => {
      expect(() => assertNoClosure('(arr) => { let sum = 0; for (const x of arr) sum += x; return sum; }', 'run')).not.toThrow();
    });

    test('member access on params', () => {
      expect(() => assertNoClosure('(ctx) => ctx.data.map(x => x.value)', 'run')).not.toThrow();
    });

    test('globals like console, Buffer, Math, Array', () => {
      expect(() => assertNoClosure('(ctx) => { console.log(Math.max(...ctx)); return Buffer.from(Array.of(1)); }', 'run')).not.toThrow();
    });

    test('try-catch with error binding', () => {
      expect(() => assertNoClosure('(ctx) => { try { return ctx(); } catch (e) { return e; } }', 'run')).not.toThrow();
    });

    test('class expression', () => {
      expect(() => assertNoClosure('() => { class Foo { bar() { return 1; } } return new Foo(); }', 'run')).not.toThrow();
    });

    test('label statements', () => {
      expect(() => assertNoClosure('() => { outer: for (let i = 0; i < 10; i++) { break outer; } }', 'run')).not.toThrow();
    });
  });

  describe('detects closures', () => {
    test('single closed-over variable', () => {
      expect(() => assertNoClosure('(x) => x + closedOver', 'run')).toThrow(/closedOver/);
    });

    test('multiple closed-over variables', () => {
      expect(() => {
        assertNoClosure('(ctx) => sharedData.filter(x => x > threshold)', 'run');
      }).toThrow(/sharedData/);
    });

    test('closed-over function call', () => {
      expect(() => assertNoClosure('(ctx) => helper(ctx)', 'run')).toThrow(/helper/);
    });

    test('closed-over array', () => {
      expect(() => assertNoClosure('() => myArray.map(x => x * 2)', 'run')).toThrow(/myArray/);
    });

    test('computed member access with outer variable', () => {
      expect(() => assertNoClosure('(obj) => obj[key]', 'run')).toThrow(/key/);
    });

    test('variable used as argument', () => {
      expect(() => assertNoClosure('() => JSON.stringify(config)', 'run')).toThrow(/config/);
    });

    test('variable in template literal', () => {
      expect(() => assertNoClosure('() => `${prefix}-value`', 'run')).toThrow(/prefix/);
    });
  });

  describe('error message', () => {
    test('includes the function name', () => {
      expect(() => assertNoClosure('() => x', 'setup')).toThrow(/"setup"/);
      expect(() => assertNoClosure('() => x', 'run')).toThrow(/"run"/);
      expect(() => assertNoClosure('() => x', 'teardown')).toThrow(/"teardown"/);
    });

    test('lists all closed-over variables', () => {
      try {
        assertNoClosure('() => a + b + c', 'run');
        expect.unreachable('should have thrown');
      } catch (e) {
        expect(e.message).toMatch(/\ba\b/);
        expect(e.message).toMatch(/\bb\b/);
        expect(e.message).toMatch(/\bc\b/);
      }
    });

    test('explains the problem and suggests fix', () => {
      try {
        assertNoClosure('() => x', 'run');
        expect.unreachable('should have thrown');
      } catch (e) {
        expect(e.message).toContain('.toString()');
        expect(e.message).toContain('worker');
        expect(e.message).toContain('setup');
        expect(e.message).toContain('data');
      }
    });
  });

  describe('edge cases', () => {
    test('silently passes on unparseable code', () => {
      expect(() => assertNoClosure('not valid js {{{', 'run')).not.toThrow();
    });

    test('empty arrow function', () => {
      expect(() => assertNoClosure('() => {}', 'run')).not.toThrow();
    });

    test('undefined return', () => {
      expect(() => assertNoClosure('() => undefined', 'run')).not.toThrow();
    });
  });
});
