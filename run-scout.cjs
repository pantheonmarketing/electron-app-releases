// Run the full Giveaway Scout pipeline
const fs = require('fs');
fs.readFileSync('.env', 'utf8').split('\n').forEach(l => {
  const [k, ...v] = l.split('=');
  if (k && v.length) process.env[k.trim()] = v.join('=').trim().replace(/^"|"$/g, '');
});
process.argv = ['node', 'giveaway-scout-apify.cjs',
  '--accounts-file', 'scout-accounts.txt',
  '--posts', '15',
  '--batch-size', '5',
];
require('./giveaway-scout-apify.cjs');
