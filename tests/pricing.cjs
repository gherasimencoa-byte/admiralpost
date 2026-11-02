const assert=require('node:assert/strict');
require('../shipping-pricing.js');
const {quote,tariffs}=globalThis.AdmiralPricing;
assert.equal(quote('ukraine',10).total,247);
assert.equal(quote('belarus',10).total,386);
assert.equal(quote('russia',19.6).billed,20);
for(const [country,t] of Object.entries(tariffs)) {
 assert.equal(quote(country,t.included).total,t.base);
 assert.equal(quote(country,t.included+.01).total,t.base+t.extra);
 assert.equal(quote(country,t.limit).billed,t.limit);
 assert.throws(()=>quote(country,t.limit+.01),/WEIGHT_LIMIT/);
 for(const invalid of [0,-1,NaN,Infinity,'']) assert.throws(()=>quote(country,invalid),/INVALID_WEIGHT/);
}
assert.throws(()=>quote('unknown',1),/UNKNOWN_DESTINATION/);
console.log('PASS: all 8 tariffs, boundary weights, rounding and invalid inputs');
