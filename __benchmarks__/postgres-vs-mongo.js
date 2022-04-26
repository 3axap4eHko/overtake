benchmark('mongodb vs postgres', () => {
  setup(async () => {
    const { default: PG } = await import('pg');
    const postgres = new PG.Client({
      user: 'user',
      host: 'postgres',
      database: 'db',
      password: 'password',
      port: 5432,
    });
    await postgres.connect();
    await postgres.query('DROP TABLE IF EXISTS overtake');
    await postgres.query('CREATE TABLE IF NOT EXISTS overtake ( id SERIAL not null, idx int not null, value varchar(45) NOT NULL, PRIMARY KEY (id) )');

    const { MongoClient } = await import('mongodb');
    const mongo = new MongoClient('mongodb://localhost', {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    await mongo.connect();
    const db = mongo.db();
    await db.dropCollection('overtake').catch(Boolean);
    await db.createCollection('overtake');

    return { postgres, mongo };
  });

  measure('postgres inserts', async ({ postgres }, next) => {
    // prepare a query
    const query = 'INSERT INTO overtake(idx, value) VALUES($1, $2) RETURNING *';

    return (value, idx) => postgres.query(query, [idx, value]).then(next);
  });

  measure('mongodb inserts', async ({ mongo }, next) => {
    // prepare a collection
    const db = mongo.db();
    const collection = db.collection('overtake');

    return (value, idx) => collection.insertOne({ idx, value }).then(next);
  });

  measure('postgres query data', async ({ postgres }, next) => {
    const query = `SELECT * FROM overtake WHERE value = $1`;
    return (value) => postgres.query(query, [value]).then(next);
  });

  measure('mongodb query data', async ({ mongo }, next) => {
    // prepare a collection
    const db = mongo.db();
    const collection = db.collection('overtake');

    return (value) => collection.find({ value }).toArray().then(next);
  });

  measure('postgres query inserts', async ({ postgres }, next) => {
    // prepare a query
    const insert = 'INSERT INTO overtake(idx, value) VALUES($1, $2) RETURNING id';
    const query = `SELECT * FROM overtake WHERE id = $1`;

    return async (value, idx) => {
      const {
        rows: [{ id }],
      } = await postgres.query(insert, [idx, value]);
      await postgres.query(query, [id]);
      next();
    };
  });

  measure('mongodb query inserts', async ({ mongo }, next) => {
    // prepare a collection
    const db = mongo.db();
    const collection = db.collection('overtake');

    return async (value, idx) => {
      const { insertedId } = await collection.insertOne({ idx, value });
      await collection.findOne({ _id: insertedId });
      next();
    };
  });

  measure('postgres group data', async ({ postgres }, next) => {
    const query = `
     SELECT value, COUNT(idx) as count
     FROM overtake
     GROUP BY value
    `;
    return () => postgres.query(query).then(next);
  });

  measure('mongodb group data', async ({ mongo }, next) => {
    // prepare a collection
    const db = mongo.db();
    const collection = db.collection('overtake');
    const pipeline = [
      {
        $group: {
          _id: '$value',
          idx: { $first: '$idx' },
          value: { $first: '$value' },
        },
      },
    ];
    return () => collection.aggregate(pipeline).toArray().then(next);
  });

  teardown(async ({ mongo, postgres }) => {
    await postgres.end();
    await mongo.close();
  });

  perform('simple test', 1000, [
    ...Array(100)
      .fill(0)
      .map((_, idx) => [`test${idx}`]),
  ]);
});
