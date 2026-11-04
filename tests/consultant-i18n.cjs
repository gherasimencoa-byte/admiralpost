const assert=require('node:assert/strict'),fs=require('node:fs');
(async()=>{const {translations:t}=await import('../consultant-i18n.js');const keys=Object.keys(t.ru).sort();for(const lang of ['en','he']){assert.deepEqual(Object.keys(t[lang]).sort(),keys);for(const s of Object.values(t[lang]))assert.ok(s&&!/[А-Яа-яЁё]/.test(s));}
const html=fs.readFileSync('consultant.html','utf8');for(const [,key] of html.matchAll(/data-t="([^"]+)"/g))for(const lang of ['ru','en','he'])assert.ok(t[lang][key],key);
assert.ok(!html.includes('972555171600'));assert.ok(html.includes('972522323554'));console.log('PASS RU/EN/HE translation parity, DOM keys and Admiral contact');})();
