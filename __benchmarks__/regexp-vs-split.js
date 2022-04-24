benchmark('first and last names validation', () => {
  setup(() => /(\w+)\s(\w+)/); // pre init regexp

  measure('regexp.test', (regexp, next) => (text) => {
    regexp.test(text);
    next();
  });

  measure('split', (next) => (text) => {
    text.split(' ').length == 2;
    next();
  });

  perform('simple test', 100000, [['John Smith']]);
});
