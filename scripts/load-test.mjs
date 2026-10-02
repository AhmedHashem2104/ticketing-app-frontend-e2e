// Load test for the read-heavy paths fans hit when a big match goes on sale.
// Usage:  pnpm load                      (servers from `pnpm test` must be running, or set BASE_URL)
//         BASE_URL=https://staging.matchpass.app DURATION=60 CONNECTIONS=200 pnpm load
// Exits non-zero when a budget is missed, so it can gate a pipeline.
import autocannon from "autocannon";

const BASE_URL = (process.env.BASE_URL ?? `http://localhost:${process.env.WEB_PORT ?? 3100}`).replace(/\/$/, "");
const DURATION = Number(process.env.DURATION ?? 15);
const CONNECTIONS = Number(process.env.CONNECTIONS ?? 50);

/** p99 latency budgets (ms) and the error-rate ceiling for each scenario. */
const scenarios = [
  { name: "home page (SSR)", path: "/", p99: 1500 },
  { name: "browse matches API", path: "/api/events?tab=matches", p99: 500 },
  { name: "event detail API", path: "/api/events/nile-fc-vs-delta-sc", p99: 500 },
  { name: "stadium seat map API", path: "/api/events/nile-fc-vs-delta-sc/seatmap", p99: 800 },
];
const MAX_ERROR_RATE = 0.01;

function run(scenario) {
  return new Promise((resolve, reject) => {
    const instance = autocannon(
      { url: `${BASE_URL}${scenario.path}`, connections: CONNECTIONS, duration: DURATION, headers: { accept: scenario.path.startsWith("/api") ? "application/json" : "text/html" } },
      (error, result) => (error ? reject(error) : resolve(result)),
    );
    autocannon.track(instance, { renderProgressBar: false, renderResultsTable: false, renderLatencyTable: false });
  });
}

let failed = false;
const rows = [];
for (const scenario of scenarios) {
  const result = await run(scenario);
  const total = result.requests.total || 1;
  const errors = result.errors + result.timeouts + result.non2xx;
  const errorRate = errors / total;
  const ok = result.latency.p99 <= scenario.p99 && errorRate <= MAX_ERROR_RATE;
  failed ||= !ok;
  rows.push({
    scenario: scenario.name,
    "req/s": Math.round(result.requests.average),
    "p50 ms": result.latency.p50,
    "p99 ms": result.latency.p99,
    "budget p99": scenario.p99,
    "errors %": (errorRate * 100).toFixed(2),
    result: ok ? "PASS" : "FAIL",
  });
}

console.log(`\nLoad test · ${BASE_URL} · ${CONNECTIONS} connections · ${DURATION}s per scenario`);
console.table(rows);
process.exit(failed ? 1 : 0);
