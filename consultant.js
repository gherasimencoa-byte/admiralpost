import {translations} from './consultant-i18n.js?v=eva2';
'use strict';
(()=>{
 const $=id=>document.getElementById(id),lang=['en','he'].includes(new URLSearchParams(location.search).get('lang'))?new URLSearchParams(location.search).get('lang'):'ru',t=translations[lang],storage='admiral-public-chat-v1-'+lang,cfg=window.ADMIRAL_SUPABASE_CONFIG;
 document.documentElement.lang=lang;document.documentElement.dir=lang==='he'?'rtl':'ltr';document.title=t.title;document.querySelectorAll('[data-t]').forEach(el=>el.textContent=t[el.dataset.t]);$('close').ariaLabel=t.close;$('messages').ariaLabel=t.details;$('question').placeholder=t.placeholder;$('order-form').elements.pickup_day.placeholder=t.dayExample;$('order-form').elements.courier_note.placeholder=t.noteExample;
 let token='',busy=false,pending=null,submitted=false;
 try{token=sessionStorage.getItem(storage)||'';}catch{}
 const status=s=>$('status').textContent=s;
 const setBusy=v=>{busy=v;for(const id of ['start','send','submit-order','reset','show-order'])$(id).disabled=v;};
 const api=async(action,data={})=>{const r=await fetch(cfg.url+'/functions/v1/consultant-public',{method:'POST',headers:{'Content-Type':'application/json',apikey:cfg.publishableKey},body:JSON.stringify({action,token,lang,...data}),signal:AbortSignal.timeout(160000)});const d=await r.json();if(!r.ok){const e=Error(d.error||t.error);e.status=r.status;throw e;}return d;};
 function line(role,text){const el=document.createElement('article');el.className='bubble '+role;const title=document.createElement('strong');title.textContent=role==='customer'?t.you:t.assistant;el.append(title);const url='https://www.admiral-post.com/documents/declaration.pdf';text.split(url).forEach((part,i)=>{if(i){const a=document.createElement('a');a.href=url;a.target='_blank';a.rel='noopener';a.textContent=t.pdf;el.append(a);}el.append(document.createTextNode(part));});$('messages').append(el);$('messages').scrollTop=$('messages').scrollHeight;return el;}
 function fill(d){if(!d||!Object.keys(d).length)return;for(const [k,v] of Object.entries(d)){const input=$('order-form').elements.namedItem(k);if(input&&k!=='consent')input.value=v||'';}$('order-form').elements.consent.checked=false;$('order').open=true;}
 function receipt(n){submitted=true;$('receipt').textContent=t.receipt.replace('{n}',n);$('success').hidden=false;$('order').hidden=true;$('chat').hidden=true;$('show-order').hidden=true;}
 async function restore(action='history'){setBusy(true);try{const d=await api(action,{consent:true});$('welcome').hidden=true;$('conversation').hidden=false;$('messages').replaceChildren();for(const m of d.messages||[])line(m.role,m.body);fill(d.draft);if(d.number)receipt(d.number);status('');}catch(e){if(e.status===401){token='';try{sessionStorage.removeItem(storage);}catch{}}status(e.message);$('welcome').hidden=false;}finally{setBusy(false);}}
 $('start').onclick=async()=>{if(!token){token=Array.from(crypto.getRandomValues(new Uint8Array(32))).map(b=>b.toString(16).padStart(2,'0')).join('');try{sessionStorage.setItem(storage,token);}catch{}}await restore('start');};
 $('reset').onclick=()=>{if(busy)return;token='';pending=null;submitted=false;try{sessionStorage.removeItem(storage);}catch{}$('messages').replaceChildren();$('order-form').reset();$('question').value='';$('welcome').hidden=false;$('conversation').hidden=true;$('success').hidden=true;$('order').hidden=false;$('order').open=false;$('chat').hidden=false;$('show-order').hidden=false;status('');};
 async function reveal(text){
  if(matchMedia('(prefers-reduced-motion: reduce)').matches){line('assistant',text);return;}
  const el=line('assistant',''),node=document.createTextNode('');el.append(node);
  for(let i=0;i<text.length;i+=22){node.textContent=text.slice(0,i+22);$('messages').scrollTop=$('messages').scrollHeight;await new Promise(resolve=>setTimeout(resolve,18));}
  el.remove();line('assistant',text);
 }
 $('chat').onsubmit=async e=>{e.preventDefault();if(busy||submitted)return;const text=$('question').value.trim();if(!text)return;
 if(!pending||pending.text!==text){pending={text,request_id:crypto.randomUUID()};line('customer',text);}
 setBusy(true);status('');$('typing').hidden=false;
 try{const d=await api('message',pending);$('typing').hidden=true;await reveal(d.text);fill(d.draft);$('question').value='';pending=null;status('');}catch(e){status(e.message);}finally{$('typing').hidden=true;setBusy(false);}
 };
 $('show-order').onclick=()=>{$('order').open=true;$('order').scrollIntoView({behavior:'smooth',block:'start'});};
 $('order-form').onsubmit=async e=>{e.preventDefault();if(busy||submitted)return;const f=new FormData(e.target),draft=Object.fromEntries(f);draft.consent=f.get('consent')==='on';draft.weight_kg=Number(f.get('weight_kg'));setBusy(true);status(t.sending);try{const d=await api('submit',{draft});receipt(d.number);status('');$('success').scrollIntoView({behavior:'smooth'});}catch(e){status(e.message);}finally{setBusy(false);}};
 $('close').onclick=()=>{if(window.parent!==window)window.parent.postMessage({type:'admiral-chat-close'},location.origin);else location.href='/';};
 if(token)restore();
})();
