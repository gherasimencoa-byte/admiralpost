'use strict';
(async()=>{
 const $=id=>document.getElementById(id),cfg=window.ADMIRAL_SUPABASE_CONFIG,db=window.supabase.createClient(cfg.url,cfg.publishableKey);
 let user,conversation=null,busy=false,pending=null,base=AdmiralDraft.snapshot(null);
 const checked=async p=>{const r=await p;if(r.error)throw r.error;return r.data;};
 const say=s=>$('status').textContent=s;
 function controls(){for(const id of ['send','reset','handoff','feedback','reloadDraft'])$(id).disabled=busy||!user;$('draftFields').disabled=busy||!user||!!conversation?.quote_request_id;}
 async function run(fn){if(busy||!user)return;busy=true;controls();try{await fn();}catch(e){say(e.message||'Ошибка сохранения');}finally{busy=false;controls();}}
 function fillDraft(){base=AdmiralDraft.snapshot(conversation);for(const [k,v] of Object.entries(base))$('draftForm').elements[k].value=v;controls();}
 async function load(){
  if(!conversation)return;
  const rows=await checked(db.from('conversation_messages').select('id,role,body,created_at').eq('conversation_id',conversation.id).order('created_at',{ascending:false}).order('id').limit(100));
  $('messages').replaceChildren();
  for(const m of rows.reverse()){const el=document.createElement('article');el.className='bubble';el.textContent=({customer:'Клиент',operator:'Оператор',assistant:'ИИ',note:'Заметка',system:'Система'}[m.role])+': '+m.body;$('messages').append(el);}
  $('open').href='admin-dialogues.html?conversation='+encodeURIComponent(conversation.id);$('open').hidden=false;
 }
 async function ensure(){
  if(conversation)return;
  const id=crypto.randomUUID();
  // Keep the id before inserting so a lost response cannot create another conversation.
  sessionStorage.setItem('admiral-pilot-conversation',id);
  conversation={id};
  try{conversation=await checked(db.from('conversations').insert({id,channel:'manual',topic:'ТЕСТ · сценарий консультанта',assigned_to:user.id}).select().single());}
  catch(e){conversation=await checked(db.from('conversations').select('*').eq('id',id).maybeSingle());if(!conversation){sessionStorage.removeItem('admiral-pilot-conversation');throw e;}}
 }
 async function append(role,body){
  await ensure();
  if(!pending||pending.role!==role||pending.body!==body)pending={id:crypto.randomUUID(),role,body};
  const result=await db.from('conversation_messages').insert({conversation_id:conversation.id,external_id:pending.id,role,body,author_id:user.id});
  if(result.error&&result.error.code!=='23505')throw result.error;
  pending=null;await load();
 }
 try{const {data,error}=await db.auth.getUser();if(error||data.user?.app_metadata?.is_admin!==true)throw Error('Войдите в админку под учётной записью администратора.');user=data.user;
 const id=sessionStorage.getItem('admiral-pilot-conversation');if(id)conversation=await checked(db.from('conversations').select('*').eq('id',id).maybeSingle());await load();fillDraft();say('Ручной тест готов. Сообщения сохраняются в разделе «Диалоги».');controls();
 db.auth.onAuthStateChange(event=>{if(event==='SIGNED_OUT'){user=null;conversation=null;fillDraft();$('messages').replaceChildren();$('open').hidden=true;controls();say('Сессия завершена. Войдите заново.');}});
 }catch(e){say(e.message);}
 $('chat').onsubmit=e=>{e.preventDefault();const body=$('question').value.trim();if(!body)return;run(async()=>{await append($('speaker').value,body);$('question').value='';say('Сообщение сохранено. Это ручной тест, сообщение внешнему клиенту не отправлялось.');});};
 $('reset').onclick=()=>run(async()=>{conversation=null;pending=null;fillDraft();$('draftStatus').textContent='';sessionStorage.removeItem('admiral-pilot-conversation');$('messages').replaceChildren();$('question').value='';$('open').hidden=true;say('Новый сценарий. Предыдущая переписка сохранена в «Диалогах».');});
 $('handoff').onclick=()=>{if(!$('draftForm').reportValidity())return;const edited=Object.fromEntries(new FormData($('draftForm')));run(async()=>{await ensure();if(!conversation.quote_request_id)await saveDraft(edited);conversation=await checked(db.from('conversations').update({assigned_to:null,status:'new'}).eq('id',conversation.id).select().single());await load();say('Диалог и сохранённый черновик помещены во «Входящие». Оператор ещё не подключился.');});};
 $('reloadDraft').onclick=()=>run(async()=>{if(conversation)conversation=await checked(db.from('conversations').select('*').eq('id',conversation.id).single());fillDraft();$('draftStatus').textContent='Загружена сохранённая версия.';});
 $('draftForm').onsubmit=e=>{e.preventDefault();const edited=Object.fromEntries(new FormData(e.currentTarget));run(async()=>{await saveDraft(edited);});};
 async function saveDraft(edited){await ensure();const current=await checked(db.from('conversations').select('*').eq('id',conversation.id).single());const patch=AdmiralDraft.merge(base,edited,current);if(Object.keys(patch).length){const saved=await checked(db.from('conversations').update(patch).eq('id',current.id).eq('updated_at',current.updated_at).select().maybeSingle());if(!saved)throw Error('Диалог изменился во время сохранения. Повторите сохранение.');conversation=saved;}else conversation=current;fillDraft();await load();$('draftStatus').textContent='Черновик сохранён. Заявка ещё не создана.';say('Данные доступны оператору в карточке диалога.');}
 $('feedback').onclick=()=>run(async()=>{const text=$('correction').value.trim();if(!text){say('Опишите ошибку и правильный ответ.');return;}await append('note','СЦЕНАРИЙ НА ПРОВЕРКУ: '+text);$('correction').value='';say('Замечание сохранено. База знаний автоматически не изменяется.');});
})();
