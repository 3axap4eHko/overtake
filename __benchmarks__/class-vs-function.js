benchmark('Class vs Function', () => {
  setup(() => /(\w+)\s(\w+)/);

  measure('a class declaration via "class"', (regexp, inputArgs, next) => (text) => {
    regexp.test(text);
    next();
  });

  perform('quick test', 10000, [['John Smith']]);

  measure('a class declaration via "class"', (_, __, next) => {
    return () => {
      class Class {
        test() {}
      }
      next();
    };
  });

  measure('instantiation of the declared class via class and test method call', (_, __, next) => {
    class Class {
      test() {}
    }
    return () => {
      const test = new Class();
      test.test();
      next();
    };
  });

  measure('a class declaration via function', (_, __, next) => {
    return () => {
      function Function() {
        this.test = () => {};
        return this;
      }
      next();
    };
  });

  measure('instantiation of the declared class via function and test method call', (_, __, next) => {
    function Function() {
      this.test = () => {};
      return this;
    }
    return () => {
      const test = new Function();
      test.test();
      next();
    };
  });

  perform('Instantiation', 500000);
});
