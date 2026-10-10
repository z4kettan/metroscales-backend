// Vercel serverless entry. Every /api/* request is routed here (see vercel.json).
// The Nest app is built on the first request and reused while the instance is warm.
const { createHandler } = require('../dist/serverless');

let handler;

module.exports = async (req, res) => {
  handler ??= createHandler();
  const app = await handler;
  return app(req, res);
};
