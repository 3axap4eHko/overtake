import 'overtake';

const suite = benchmark('ops', () => null);

const target = suite.target('enum', () => {
  enum Direction {
    Up,
    Down,
    Left,
    Right,
  }
  return { Direction };
});

target.measure('access', ({ Direction }) => {
  return Direction.Up + Direction.Right;
});
