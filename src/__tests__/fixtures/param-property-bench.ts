import 'overtake';

const suite = benchmark('ops', () => null);

const target = suite.target('param-property', () => {
  class Container {
    constructor(public value: number) {}
  }
  return { Container };
});

target.measure('create', ({ Container }) => {
  return new Container(42);
});
