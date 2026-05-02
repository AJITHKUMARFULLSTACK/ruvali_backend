const { env } = require('./config/env');
const { app } = require('./app');

const port = Number(process.env.PORT) || env.port || 3000;

app.listen(port, () => {
  // Required startup log for runtime visibility
  console.log(`ruvali-backend listening on port ${port}`);
});

