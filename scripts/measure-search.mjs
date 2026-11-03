// End-to-end search latency through nginx → NestJS → Meilisearch.
// Usage (from the repo root, stack running): node scripts/measure-search.mjs [baseUrl=http://localhost:8080] [runs=50]
const base = process.argv[2] ?? 'http://localhost:8080';
const runs = Number(process.argv[3] ?? 50);

const QUERIES = {
  'browse (no q, sort by name)': '',
  'q=surfactant': 'q=surfactant',
  'q=emulsifer (typo)': 'q=emulsifer',
  'q=P-10001 (SKU)': 'q=P-10001',
  'q=sodium laureth sulfate': 'q=sodium%20laureth%20sulfate',
  '4 filters, no q': 'function=Emulsifier&region=EMEA&certification=Halal&certification=Vegan',
  'q=coatings, sort by rating': 'q=coatings&sort=-rating',
  'q + 2 application areas': 'q=glycol&applicationArea=Coatings&applicationArea=Home%20Care',
  'all statuses, sort by launch year': 'status=ACTIVE&status=PHASE_OUT&status=DISCONTINUED&sort=-launchYear',
  'deep page 400 (offset 8000)': 'page=400',
};

const percentile = (sorted, p) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];

async function timed(query) {
  const started = performance.now();
  const response = await fetch(`${base}/api/products?${query}`);
  const body = await response.json();
  if (!response.ok) throw new Error(`${response.status} for ${query}: ${JSON.stringify(body)}`);
  return { ms: performance.now() - started, body };
}

console.log(`${base}, ${runs} sequential runs per query (after 3 warm-up runs)\n`);
console.log('query'.padEnd(36), 'hits'.padStart(8), 'p50 ms'.padStart(8), 'p95 ms'.padStart(8), 'max ms'.padStart(8));
for (const [label, query] of Object.entries(QUERIES)) {
  for (let i = 0; i < 3; i++) await timed(query);
  const samples = [];
  let hits;
  for (let i = 0; i < runs; i++) {
    const { ms, body } = await timed(query);
    samples.push(ms);
    hits = body.total ?? body.totalHits;
  }
  samples.sort((a, b) => a - b);
  console.log(
    label.padEnd(36),
    String(hits).padStart(8),
    percentile(samples, 0.5).toFixed(1).padStart(8),
    percentile(samples, 0.95).toFixed(1).padStart(8),
    samples.at(-1).toFixed(1).padStart(8),
  );
}

// Mixed load: 10 concurrent clients cycling through the queries.
const concurrency = 10;
const totalRequests = 500;
const queries = Object.values(QUERIES);
const latencies = [];
let next = 0;
const started = performance.now();
await Promise.all(
  Array.from({ length: concurrency }, async () => {
    while (next < totalRequests) {
      const query = queries[next++ % queries.length];
      latencies.push((await timed(query)).ms);
    }
  }),
);
const seconds = (performance.now() - started) / 1000;
latencies.sort((a, b) => a - b);
console.log(
  `\nmixed load: ${concurrency} concurrent clients, ${totalRequests} requests in ${seconds.toFixed(1)} s ` +
    `→ ${(totalRequests / seconds).toFixed(0)} req/s, p50 ${percentile(latencies, 0.5).toFixed(1)} ms, ` +
    `p95 ${percentile(latencies, 0.95).toFixed(1)} ms`,
);
