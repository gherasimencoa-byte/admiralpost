const assert=require('node:assert/strict');
(async()=>{const {validateDraft}=await import('../supabase/functions/consultant-public/validation.js');
const base={customer_name:'Тест',phone:'0500000000',email:'',destination:'Украина',city:'Хайфа',address:'Тестовая 1',pickup_day:'Пятница',courier_note:'',contents:'Одежда',weight_kg:10,consent:true};
for(const phone of ['0500000000','500000000','+972 50-000-0000'])assert.equal(validateDraft({...base,phone}).phone,'+972500000000');
for(const phone of ['050000000','05000000000','+9720500000000','abc'])assert.throws(()=>validateDraft({...base,phone}));
for(const weight_kg of [0,-1,Infinity,NaN,1001])assert.throws(()=>validateDraft({...base,weight_kg}));
assert.throws(()=>validateDraft({...base,consent:false}));assert.throws(()=>validateDraft({...base,address:''}));assert.throws(()=>validateDraft({...base,email:'broken'}));
assert.equal(validateDraft({...base,email:'test@example.com'}).email,'test@example.com');console.log('PASS public application: phone formats, consent, required fields, weight and email');})();
