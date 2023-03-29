benchmark('Array copy methods', () => {
  measure('slice', (next) => (array) => {
    const newArray = array.slice();
    next(newArray);
  });

  measure('spread', (next) => (array) => {
    const newArray = [...array];
    next(newArray);
  });

  measure('concat', (next) => (array) => {
    const newArray = [].concat(array);
    next(newArray);
  });

  measure('Array.from', (next) => (array) => {
    const newArray = Array.from(array);
    next(newArray);
  });

  measure('for loop assign', (next) => (array) => {
    for (var i = 0, newArray = [], length = array.length; i < length; i++) {
      newArray[i] = array[i];
    }
    next();
  });

  measure('for loop push', (next) => (array) => {
    for (var i = 0, newArray = [], length = array.length; i < length; i++) {
      newArray.push(array[i]);
    }
    next();
  });

  perform('10 elements', 500000, [[Array.from({ length: 10 }).map((v, id) => id)]]);
  perform('1000 elements', 500000, [[Array.from({ length: 1000 }).map((v, id) => id)]]);
});
