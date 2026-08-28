#!/usr/bin/env node
/* Generate the two environment variables the deployed diary needs.
 *
 *   npm run hash-pin
 *
 * Prints a scrypt hash of the pin you choose and a fresh token secret. Put
 * both in Netlify's environment variables. Neither belongs in the repo, and
 * the pin itself is never written anywhere — not to a file, not to your shell
 * history if you let this prompt for it. */

import { createInterface } from 'node:readline/promises';
import { randomBytes } from 'node:crypto';
import { stdin, stdout } from 'node:process';

import { PIN_MAX, PIN_MIN, hashPin, isValidPinShape } from '../netlify/lib/pin.mjs';

const rl = createInterface({ input: stdin, output: stdout });

const pin = (await rl.question(`Pin (${PIN_MIN}–${PIN_MAX} digits): `)).trim();
rl.close();

if (!isValidPinShape(pin)) {
  console.error(`\nA pin is ${PIN_MIN} to ${PIN_MAX} digits, numbers only. Nothing was written.`);
  process.exit(1);
}

console.log('\nSet these two in Netlify → Site configuration → Environment variables.');
console.log('Do not commit them.\n');
console.log(`DIARY_PIN_HASH=${hashPin(pin)}`);
console.log(`DIARY_TOKEN_SECRET=${randomBytes(32).toString('base64')}`);
console.log(
  '\nChanging DIARY_TOKEN_SECRET invalidates every token, so every device asks for the pin again.',
);
