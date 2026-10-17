// Isolated browser proving benchmark with a synthetic ballot; no deployment or secrets.
import { createServer } from 'node:http';
import { readFileSync, statSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { chromium } from 'playwright';
import { BallotBuilder } from './davinci-circom/js/src/builder.ts';

const assets = {
  '/snarkjs.js': ['research/mvp3/davinci-circom/js/node_modules/snarkjs/build/snarkjs.min.js', 'text/javascript'],
  '/ballot.wasm': ['research/mvp3/davinci-circom/ballot_proof_js/ballot_proof.wasm', 'application/wasm'],
  '/ballot.zkey': [process.env.MVP3_BALLOT_ZKEY ?? 'research/mvp3/davinci-circom/artifacts-public/ballot_final_pkey.zkey', 'application/octet-stream'],
};
const server = createServer((request, response) => {
  if (request.url === '/') { response.writeHead(200, { 'content-type': 'text/html' }); response.end('<html><body>Research proof benchmark</body></html>'); return; }
  const asset = assets[request.url];
  if (!asset) { response.writeHead(404); response.end(); return; }
  response.writeHead(200, { 'content-type': asset[1], 'content-length': statSync(asset[0]).size });
  response.end(readFileSync(asset[0]));
});
let browser;
try {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const builder = await BallotBuilder.build();
  const { pubKey } = builder.elgamal.generateKeyPair();
  const config = { numFields: 2, groupSize: 2, uniqueValues: 0, maxValue: 1, minValue: 0, maxValueSum: 1, minValueSum: 1, costExponent: 1 };
  const inputStart = performance.now();
  const inputs = builder.generateInputs([0, 1], 1, pubKey, '1', '0', builder.randomK(), config);
  const nodeInputMs = performance.now() - inputStart;
  browser = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true, args: ['--enable-precise-memory-info'] });
  const page = await browser.newPage();
  await page.goto(base);
  await page.addScriptTag({ url: `${base}/snarkjs.js` });
  const result = await page.evaluate(async ({ inputs, base }) => {
    const before = performance.memory?.usedJSHeapSize ?? null;
    const started = performance.now();
    const { proof, publicSignals } = await window.snarkjs.groth16.fullProve(inputs, `${base}/ballot.wasm`, `${base}/ballot.zkey`);
    return { proofMs: performance.now() - started, heapBefore: before,
      heapAfter: performance.memory?.usedJSHeapSize ?? null, publicSignals: publicSignals.length,
      proofBytes: JSON.stringify(proof).length };
  }, { inputs, base });
  console.log(JSON.stringify({ browser: await browser.version(), nodeInputMs, wasmBytes: statSync(assets['/ballot.wasm'][0]).size,
    zkeyBytes: statSync(assets['/ballot.zkey'][0]).size, ...result }));
  if (result.publicSignals !== 72) process.exitCode = 1;
} finally {
  await browser?.close();
  server.close();
}
