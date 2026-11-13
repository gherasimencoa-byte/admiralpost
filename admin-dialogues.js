'use strict';
(() => {
 const $=id=>document.getElementById(id), cfg=window.ADMIRAL_SUPABASE_CONFIG;
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const date=v=>new Date(v).toLocaleString('ru-RU');
 const labels={new:'Новый',active:'В работе',waiting:'Ждём клиента',closed:'Закрыт',manual:'Вручную',website_ai:'ИИ на сайте',website_operator:'Оператор на сайте',customer:'Клиент',assistant:'ИИ',operator:'Оператор · запись',note:'Внутренняя заметка',system:'Система'};
 let db,user,rows=[],page=0,filter='incoming',selected=null,loadVersion=0,messageOffset=0,messageRows=[];
 const say=(s,error=false,detail=false)=>{const el=$(detail?'detailNotice':'notice');el.textContent=s;el.classList.toggle('error',error);};
 const checked=async promise=>{const r=await promise;if(r.error)throw r.error;return r.data;};
 async function action(button,fn,detail=false){button.disabled=true;try{await fn();}catch(e){say(e.message||'Не удалось выполнить действие',true,detail);}finally{button.disabled=false;}}
 async function load(){
  const version=++loadVersion; say('Загрузка…');
  try{
   let q=db.from('conversations').select('*',{count:'exact'}).order('updated_at',{ascending:false}).order('id').range(page*50,page*50+49);
   if(filter==='incoming')q=q.neq('status','closed').is('assigned_to',null);
   if(filter==='mine')q=q.eq('assigned_to',user.id);
   if($('channel').value)q=q.eq('channel',$('channel').value);
   const search=$('search').value.trim().replace(/[^\p{L}\p{N}@+ ._-]/gu,'').slice(0,100);
   if(search)q=q.or(['customer_name','phone','email','topic'].map(f=>`${f}.ilike.%${search}%`).join(','));
   const {data,error,count}=await q;if(version!==loadVersion)return;if(error)throw error;rows=data||[];
   $('rows').innerHTML=rows.map(c=>`<tr><td><button data-open="${esc(c.id)}">${esc(c.customer_name||'Без имени')}</button><small>${esc(c.phone)}</small></td><td>${esc(date(c.updated_at))}</td><td><span class="badge">${labels[c.status]}</span></td><td>${c.assigned_to===user.id?'Вы':c.assigned_to?'Назначен оператор':'Не назначен'}</td><td>${labels[c.channel]}<small>${esc(c.topic||'Без темы')}</small></td><td>${esc(c.summary||'—')}</td><td>${c.quote_request_id?'Создана':'—'}</td></tr>`).join('')||'<tr><td colspan="7">Диалогов пока нет. Создайте обращение вручную или измените фильтр.</td></tr>';
   $('count').textContent=`Найдено: ${count??rows.length} · Страница ${page+1}`;$('prev').disabled=page===0;$('next').disabled=(page+1)*50>=(count||0);say('Данные обновлены.');
  }catch(e){if(version===loadVersion)say('Не удалось загрузить диалоги: '+e.message,true);}
 }
 function showMessages(){ $('messages').innerHTML=messageRows.map(m=>`<article class="bubble ${esc(m.role)}"><small>${labels[m.role]} · ${esc(date(m.created_at))}</small>${esc(m.body)}</article>`).join('')||'<p class="muted">История пока пуста.</p>'; }
 async function loadMessages(reset=false){
  if(!selected)return;const id=selected.id;if(reset){messageOffset=0;messageRows=[];}
  const data=await checked(db.from('conversation_messages').select('*').eq('conversation_id',id).order('created_at',{ascending:false}).order('id',{ascending:false}).range(messageOffset,messageOffset+99));
  if(selected?.id!==id)return;messageRows=[...(data||[]).reverse(),...messageRows];messageOffset+=(data||[]).length;showMessages();$('older').hidden=data.length<100;
  if(reset)$('messages').scrollTop=$('messages').scrollHeight;
 }
 function linked(){const exists=!!selected.quote_request_id;$('quoteForm').hidden=exists;$('linked').textContent=exists?'Заявка уже создана. Она доступна в разделе «Заявки с сайта».':'Проверьте данные клиента и заполните недостающие поля.';}
 async function open(id){
  selected=rows.find(c=>c.id===id);if(!selected)return;
  $('title').textContent=selected.customer_name||'Новый диалог';$('detailNotice').textContent='';
  for(const name of ['customer_name','phone','email','topic','status','summary'])$('profileForm').elements[name].value=selected[name]||'';
  $('quoteForm').reset();for(const name of ['destination','weight_kg','contents','message'])$('quoteForm').elements[name].value=selected.draft?.[name]||'';
  $('body').value='';$('assign').textContent=selected.assigned_to===user.id?'Вы ответственный':'Взять себе';linked();$('detail').showModal();await loadMessages(true);
 }
 $('rows').addEventListener('click',e=>{const b=e.target.closest('[data-open]');if(b)action(b,()=>open(b.dataset.open),true);});
 $('close').onclick=()=>$('detail').close();$('detail').addEventListener('close',()=>{selected=null;});
 $('new').onclick=e=>action(e.currentTarget,async()=>{
  const c=await checked(db.from('conversations').insert({channel:'manual',assigned_to:user.id}).select().single());filter='mine';page=0;tabs();await load();if(!rows.some(r=>r.id===c.id))rows.push(c);await open(c.id);
 });
 function tabs(){document.querySelectorAll('[data-filter]').forEach(b=>b.classList.toggle('active',b.dataset.filter===filter));}
 document.querySelectorAll('[data-filter]').forEach(b=>b.onclick=()=>{filter=b.dataset.filter;page=0;tabs();load();});
 let timer;$('search').oninput=()=>{clearTimeout(timer);timer=setTimeout(()=>{page=0;load();},300);};$('channel').onchange=()=>{page=0;load();};$('refresh').onclick=load;
 $('prev').onclick=()=>{page=Math.max(0,page-1);load();};$('next').onclick=()=>{page++;load();};
 $('older').onclick=e=>action(e.currentTarget,()=>loadMessages(),true);
 $('profileForm').onsubmit=e=>{e.preventDefault();const id=selected?.id;if(!id)return;const values=Object.fromEntries(new FormData(e.currentTarget));action(e.submitter,async()=>{const c=await checked(db.from('conversations').update(values).eq('id',id).select().single());if(selected?.id===id){selected=c;$('title').textContent=c.customer_name||'Диалог';}say('Данные сохранены.',false,true);await load();},true);};
 $('assign').onclick=e=>{const id=selected?.id;if(!id)return;action(e.currentTarget,async()=>{const c=await checked(db.from('conversations').update({assigned_to:user.id,status:'active'}).eq('id',id).select().single());if(selected?.id===id){selected=c;$('assign').textContent='Вы ответственный';$('profileForm').elements.status.value='active';}await load();},true);};
 $('messageForm').onsubmit=e=>{e.preventDefault();const id=selected?.id;if(!id)return;const body=$('body').value.trim(),role=$('role').value;if(!body)return;action(e.submitter,async()=>{await checked(db.from('conversation_messages').insert({conversation_id:id,body,role,author_id:user.id}));if(selected?.id===id){$('body').value='';await loadMessages(true);}say('Запись сохранена в истории. Клиенту сообщение не отправлялось.',false,true);await load();},true);};
 $('saveDraft').onclick=e=>{const id=selected?.id;if(!id)return;const draft=Object.fromEntries(new FormData($('quoteForm')));delete draft.consent;delete draft.confirmed;action(e.currentTarget,async()=>{const c=await checked(db.from('conversations').update({draft}).eq('id',id).select().single());if(selected?.id===id)selected=c;say('Черновик сохранён. Заявка ещё не создана.',false,true);},true);};
 $('quoteForm').onsubmit=e=>{e.preventDefault();if(!$('profileForm').reportValidity())return;const id=selected?.id;if(!id)return;const d={...Object.fromEntries(new FormData($('profileForm'))),...Object.fromEntries(new FormData(e.currentTarget))};d.weight_kg=Number(d.weight_kg);d.consent=d.consent==='on';d.confirmed=d.confirmed==='on';action(e.submitter,async()=>{const q=await checked(db.rpc('convert_conversation',{p_id:id,p_draft:d}));if(selected?.id===id){selected.quote_request_id=q;linked();await loadMessages(true);}say('Заявка создана. Курьер ещё не назначен.',false,true);await load();},true);};
 async function init(){
  $('new').disabled=true;if(!cfg?.url||!window.supabase)throw Error('Конфигурация недоступна.');db=window.supabase.createClient(cfg.url,cfg.publishableKey);
  const {data,error}=await db.auth.getUser();if(error||!data.user||data.user.app_metadata?.is_admin!==true){say('Для доступа войдите в админ-панель по ссылке сверху.',true);return;}user=data.user;$('workspace').hidden=false;$('new').disabled=false;
  db.auth.onAuthStateChange((event)=>{if(event==='SIGNED_OUT'){loadVersion++;rows=[];selected=null;$('detail').close();$('rows').replaceChildren();$('messages').replaceChildren();$('workspace').hidden=true;$('new').disabled=true;say('Сессия завершена. Войдите в админ-панель.');}});await load();
  const requested=new URLSearchParams(location.search).get("conversation");
  if(requested&&/^[0-9a-f-]{36}$/i.test(requested)){const c=await checked(db.from("conversations").select("*").eq("id",requested).maybeSingle());if(c){if(!rows.some(r=>r.id===c.id))rows.push(c);await open(c.id);}}
 }
 init().catch(e=>say(e.message,true));
})();
