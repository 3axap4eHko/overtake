benchmark('Array delete element methods', () => {
  setup(() => 5);
  measure('splice', (element, next) => (array) => {
    const deleteIndex = array.indexOf(element);
    const newArray = array.splice(deleteIndex, 1);
    next(newArray);
  });

  measure('filter', (element, next) => (array) => {
    const newArray = array.filter((v) => v !== element);
    next(newArray);
  });

  measure('for loop', (element, next) => (array) => {
    for (var i = 0, newArray = [], length = array.length; i < length; i++) {
      if (element !== array[i]) {
        newArray.push(element);
      }
    }
    next();
  });

  perform('10 elements', 500000, [[Array.from({ length: 10 }).map((v, id) => id)]]);
  perform('1000 elements', 500000, [[Array.from({ length: 1000 }).map((v, id) => id)]]);
});
