/**
 * @fileoverview Local dev / traditional-host entry point. Run with `npm start`
 * or `npm run dev`. NOT used on Vercel — see api/index.js for that path,
 * which imports src/app.js directly instead.
 */

const app = require("./app");
const config = require("./config");
const { printEnvReport } = require("./config/validateEnv");

printEnvReport();

app.listen(config.port, () => {
  console.log(`Pick Match backend listening on http://localhost:${config.port}`);
});
