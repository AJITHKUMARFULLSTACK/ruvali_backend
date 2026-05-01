const { env } = require('./config/env');
const { app } = require('./app');

app.listen(env.port, () => {
  // Required startup log for runtime visibility
  console.log(`ruvali-backend listening on port ${env.port}`);
});

