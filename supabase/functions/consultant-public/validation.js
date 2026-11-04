export function validateDraft(raw) {
 const d={};
 for(const [k,max] of Object.entries({customer_name:120,phone:50,email:254,destination:100,city:150,address:300,pickup_day:100,courier_note:500,contents:500})){
  if(typeof raw?.[k]!=='string' || raw[k].length>max)throw Error('Проверьте поля заявки.');
  d[k]=raw[k].trim();
 }
 for(const k of ['customer_name','phone','destination','city','address','pickup_day','contents'])if(!d[k])throw Error('Заполните обязательные поля заявки.');
 const digits=d.phone.replace(/[\s()+-]/g,'');
 if(!/^(05\d{8}|5\d{8}|9725\d{8})$/.test(digits))throw Error('Проверьте мобильный номер: 10 цифр с нулём или 9 без него. Для другого номера свяжитесь с оператором.');
 d.phone=digits.startsWith('972')?'+'+digits:'+972'+(digits.startsWith('0')?digits.slice(1):digits);
 if(d.email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email))throw Error('Проверьте email.');
 d.weight_kg=Number(raw.weight_kg);if(!Number.isFinite(d.weight_kg)||d.weight_kg<=0||d.weight_kg>1000)throw Error('Проверьте вес посылки.');
 if(raw.consent!==true)throw Error('Подтвердите согласие на обработку данных заявки.');
 d.consent=true;return d;
}
