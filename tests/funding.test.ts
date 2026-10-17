import test from 'node:test';
import assert from 'node:assert/strict';
import {fundingLinks} from '../scripts/configure-funding.mjs';

test('funding accepts official profile links without a preset payment amount',()=>{
  assert.equal(fundingLinks('https://paypal.me/example','https://buymeacoffee.com/example').username,'example');
  assert.equal(fundingLinks('https://www.paypal.com/donate?hosted_button_id=ABC123','https://www.buymeacoffee.com/example').paypal,'https://www.paypal.com/donate?hosted_button_id=ABC123');
});
test('funding rejects unrelated hosts, redirects, credentials and payment amounts',()=>{
  for(const url of ['http://paypal.me/example','https://paypal.me.evil.test/example','https://paypal.me/example/50','https://user@paypal.me/example','https://paypal.com/redirect?url=example','https://paypal.com/donate?hosted_button_id=OK&next=bad'])assert.throws(()=>fundingLinks(url,'https://buymeacoffee.com/example'));
  for(const url of ['https://buymeacoffee.com.evil.test/example','https://buymeacoffee.com/example?next=bad','https://buymeacoffee.com/'])assert.throws(()=>fundingLinks('https://paypal.me/example',url));
});
