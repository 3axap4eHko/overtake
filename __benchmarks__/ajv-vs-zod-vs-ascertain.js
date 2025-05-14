benchmark('ajv vs zod vs ascertain', () => {
  setup(async () => {
    const { z } = await import('zod');
    const { Ajv } = await import('ajv');
    const { compile, ascertain } = await import('ascertain');

    const ajv = new Ajv();
    const ajvValidate = ajv.compile({
      $id: 'AjvTest',
      $schema: 'http://json-schema.org/draft-07/schema#',
      type: 'object',
      properties: {
        number: {
          type: 'number',
        },
        negNumber: {
          type: 'number',
        },
        maxNumber: {
          type: 'number',
        },
        string: {
          type: 'string',
        },
        longString: {
          type: 'string',
        },
        boolean: {
          type: 'boolean',
        },
        deeplyNested: {
          type: 'object',
          properties: {
            foo: {
              type: 'string',
            },
            num: {
              type: 'number',
            },
            bool: {
              type: 'boolean',
            },
          },
          required: ['foo', 'num', 'bool'],
        },
      },
      required: ['number', 'negNumber', 'maxNumber', 'string', 'longString', 'boolean', 'deeplyNested'],
    });

    const zodValidate = z.object({
      number: z.number(),
      negNumber: z.number(),
      maxNumber: z.number(),
      string: z.string(),
      longString: z.string(),
      boolean: z.boolean(),
      deeplyNested: z.object({
        foo: z.string(),
        num: z.number(),
        bool: z.boolean(),
      }),
    });

    const ascValidate = compile({
      number: Number,
      negNumber: Number,
      maxNumber: Number,
      string: String,
      longString: String,
      boolean: Boolean,
      deeplyNested: {
        foo: String,
        num: Number,
        bool: Boolean,
      },
    });

    return { z, ajvValidate, zodValidate, ascValidate, ascertain };
  });

  measure('zod static schema validation', async ({ zodValidate }, next) => {
    return (input) => {
      zodValidate.parse(input.data);
      next();
    };
  });

  measure('ascertain schema validation', async ({ ascValidate }, next) => {
    return (input) => {
      ascValidate(input.data);
      next();
    };
  });

  measure('ajv schema validation', async ({ ajvValidate }, next) => {
    return (input) => {
      ajvValidate(input.data);
      next();
    };
  });

  perform('simple test', 500000, [
    [
      {
        data: {
          number: 0,
          negNumber: -100,
          maxNumber: Number.MAX_VALUE,
          string: 'string',
          longString: 'longString'.repeat(100),
          boolean: false,
          deeplyNested: {
            foo: 'foo',
            num: 1,
            bool: true,
          },
        },
      },
    ],
  ]);
});
