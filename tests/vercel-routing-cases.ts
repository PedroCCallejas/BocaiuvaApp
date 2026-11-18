import assert from 'node:assert/strict';
import fs from 'node:fs';
export const vercelRoutingTestCases = [{ name: 'fallback web respeita cleanUrls e nao captura API ou assets', run() {
  const config = JSON.parse(fs.readFileSync('vercel.json', 'utf8'));
  assert.equal(config.cleanUrls, true);
  assert.deepEqual(config.rewrites, ['matches', 'lineup', 'players', 'teams'].map(section => ({ source: '/' + section + '/:path*', destination: '/' })));
  for (const rule of config.rewrites) assert.doesNotMatch(rule.destination, /\.html$/);
} }];
