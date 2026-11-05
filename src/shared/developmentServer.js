/** @param {Record<string, string | undefined>} [env] */
function developmentServer(env = process.env) {
  const raw = env.BUCKY_DEV_PORT ?? "3000";
  if (!/^\d+$/.test(raw)) throw new Error("Invalid development server port");
  const port = Number(raw);
  if (!Number.isSafeInteger(port) || port < 1024 || port > 65534) throw new Error("Invalid development server port");
  return { port, url: `http://localhost:${port}` };
}
module.exports = { developmentServer };
