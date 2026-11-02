'use strict';
(()=>{
 const profile=['customer_name','phone','email'];
 const fields=[...profile,'destination','weight_kg','contents','message'];
 const snapshot=c=>Object.fromEntries(fields.map(k=>[k,String((profile.includes(k)?c?.[k]:c?.draft?.[k])??'')]));
 function merge(base,edited,current){
  if(current.quote_request_id)throw Error('Заявка уже создана. Изменяйте её в разделе заявок.');
  const now=snapshot(current),patch={},draft={...current.draft};let changed=false;
  for(const k of fields){const value=String(edited[k]??'').trim();if(value===base[k])continue;
   if(now[k]!==base[k]&&now[k]!==value)throw Error('Поле «'+k+'» изменено другим оператором. Обновите черновик.');
   changed=true;if(profile.includes(k))patch[k]=value;else draft[k]=value;
  }
  if(changed){delete draft.consent;delete draft.confirmed;patch.draft=draft;}
  return patch;
 }
 globalThis.AdmiralDraft={snapshot,merge};
})();
