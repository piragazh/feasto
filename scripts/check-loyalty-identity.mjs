#!/usr/bin/env node
/**
 * check-loyalty-identity.mjs - a phone number is the customer's identity, so every
 * place that touches it must agree EXACTLY. Points were awarded under one
 * normalisation and looked up under another: a customer who typed "+44 7123..."
 * was told they had no points, and "0044..." started a second balance.
 */
import fs from 'node:fs';
import * as lib from '../src/lib/loyalty-identity.js';
const load = (file) => {
  const src = fs.readFileSync(file, 'utf8');
  const start = src.indexOf('function normalizeUkPhone(');
  const end = src.indexOf('function getLoyaltyIdentifier(') > 0
    ? src.indexOf('function getLoyaltyIdentifier(') : src.indexOf('Deno.serve(');
  if (start < 0 || end < 0) throw new Error(`${file}: phone normaliser missing`);
  return new Function(src.slice(start, end) + '\nreturn { normalizeUkPhone, phoneLoyaltyKey };')();
};
const copies = {
  awardLoyaltyPoints: load(new URL('../base44/functions/awardLoyaltyPoints/entry.ts', import.meta.url)),
  getGuestLoyaltyPoints: load(new URL('../base44/functions/getGuestLoyaltyPoints/entry.ts', import.meta.url)),
};
const inputs = ['07123456789','07123 456789','+447123456789','+44 7123 456789','447123456789',
  '00447123456789','0044 7123456789','(07123) 456-789','7123456789','020 7946 0958','+44 20 7946 0958',
  '+33 6 12 34 56 78','', null, undefined, '123', 'n/a'];
let checks = 0, bad = 0;
for (const [name, c] of Object.entries(copies)) for (const p of inputs) {
  checks++;
  if (lib.normalizeUkPhone(p) !== c.normalizeUkPhone(p)) { bad++; console.log('  MISMATCH', name, JSON.stringify(p), lib.normalizeUkPhone(p), c.normalizeUkPhone(p)); }
  checks++;
  if (lib.phoneLoyaltyKey(p) !== c.phoneLoyaltyKey(p)) { bad++; console.log('  MISMATCH key', name, JSON.stringify(p)); }
}
// The bug itself: award key must equal lookup key.
for (const p of inputs.filter(Boolean)) {
  checks++;
  const awarded = copies.awardLoyaltyPoints.phoneLoyaltyKey(p);
  const looked = copies.getGuestLoyaltyPoints.phoneLoyaltyKey(p);
  if (awarded !== looked) { bad++; console.log('  AWARD/LOOKUP DISAGREE for', JSON.stringify(p), awarded, looked); }
}
console.log(`${checks} comparisons across ${Object.keys(copies).length} copies: ${bad} mismatches`);
process.exit(bad ? 1 : 0);
