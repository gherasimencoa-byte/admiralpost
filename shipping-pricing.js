'use strict';
// Authoritative website parcel tariffs. Currency: ILS.
(() => {
 const tariffs = {
    russia:  {name:'Россия', limit:20, base:154, included:2, extra:29},
    belarus: {name:'Беларусь', limit:30, base:154, included:2, extra:29},
    usa:     {name:'США', limit:20, base:199, included:1, extra:40},
    canada:  {name:'Канада', limit:30, base:199, included:1, extra:30},
    ukraine: {name:'Украина', limit:50, base:156, included:3, extra:13},
    moldova: {name:'Молдова', limit:30, base:129, included:2, extra:8},
    georgia: {name:'Грузия', limit:30, base:200, included:15, extra:10},
    europe:  {name:'Европа — тариф Европа 1', limit:30, base:149, included:2, extra:25}
  };
 Object.values(tariffs).forEach(Object.freeze); Object.freeze(tariffs);
 function quote(country, weight) {
  const t=tariffs[country], raw=Number(weight);
  if(!t) throw new Error('UNKNOWN_DESTINATION');
  if(!Number.isFinite(raw)||raw<=0) throw new Error('INVALID_WEIGHT');
  if(raw>t.limit) throw new Error('WEIGHT_LIMIT');
  const billed=Math.ceil(raw);
  return {country,weight:raw,billed,total:t.base+Math.max(0,billed-t.included)*t.extra,currency:'ILS',limit:t.limit};
 }
 globalThis.AdmiralPricing=Object.freeze({tariffs,quote});
})();
