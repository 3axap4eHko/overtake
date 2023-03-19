benchmark('Class vs Function', () => {
  measure('class declarations via "class"', (_, __, next) => {
    return () => {
      class Class {
        test() {}
      }
      next();
    };
  });

  measure('instantiations of the declared class via class and test method call', (_, __, next) => {
    class Class {
      test() {}
    }
    return () => {
      const test = new Class();
      test.test();
      next();
    };
  });

  measure('class declarations via function', (_, __, next) => {
    return () => {
      function Function() {
        this.test = () => {};
        return this;
      }
      next();
    };
  });

  measure('instantiations of the declared class via function and test method call', (_, __, next) => {
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

  perform('Instantiation', 1000000);
});
