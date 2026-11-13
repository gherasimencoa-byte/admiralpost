/* Admiral: one conversation for Eva and the support team. */
(async () => {
  if (window.__admiralChat) return;
  window.__admiralChat = true;
  const script = document.currentScript;
  const base = new URL('.', script.src);
  const KEY = script.dataset.key;
  const API = 'https://supabase.alilpost.ge/functions/v1/ops-chat';
  const requestedLang = new URLSearchParams(location.search).get('lang') || document.documentElement.lang;
  const lang = ['en','he'].includes(requestedLang) ? requestedLang : 'ru';
  const {translations} = await import(new URL('consultant-i18n.js', base).href);
  const t = translations[lang];
  const chatTitle = lang === 'he' ? 'יועץ Admiral-Post' : lang === 'en' ? 'Admiral-Post Consultant' : 'Консультант Admiral-Post';
  const copy = {
    ru: {help:'Помощь',ai:'Ева · Виртуальный помощник',human:'Консультант',waiting:'Ожидаем консультанта',online:'Команда на связи',offline:'Оператор ответит в рабочее время',hello:'Здравствуйте! Я Ева, виртуальный помощник Admiral. Помогу с доставкой или приглашу консультанта в этот чат.',quote:'Рассчитать доставку',track:'Отследить посылку',order:'Оформить заявку',handoff:'Позвать консультанта',handoffText:'Хочу поговорить с консультантом.',quoteText:'Помоги рассчитать стоимость доставки.',orderText:'Хочу оформить заявку на забор посылки.',back:'Назад к переписке',contact:'Оставить контакты',later:'Позже',saved:'Контакты сохранены. Спасибо!',trackNumber:'Номер отправления',trackError:'Не удалось получить статус. Проверьте номер или обратитесь к консультанту.',trackEmpty:'Событий пока нет.',aiError:'Сообщение сохранено, но Ева пока не смогла ответить. Повторите запрос или позовите консультанта.',retry:'Повторить ответ',network:'Нет связи. Сообщение не отправлено. Повторите попытку.',consent:'Продолжая, вы соглашаетесь на сохранение переписки для консультации. Ответы Евы формирует ИИ OpenAI. Не отправляйте паспортные и банковские данные.',accept:'Начать с Евой',closed:'Диалог завершён',placeholder:'Напишите ваш вопрос…',rating:'Оцените консультацию',rated:'Спасибо за оценку!',loading:'Загрузка…',contactNote:'Имя и телефон помогут связаться с вами, если вы закроете сайт.',submitError:'Проверьте данные. Не удалось отправить заявку.'},
    en: {help:'Help',ai:'Eva · Virtual assistant',human:'Consultant',waiting:'Waiting for a consultant',online:'Support team online',offline:'A consultant will reply during business hours',hello:'Hello! I’m Eva, Admiral’s virtual assistant. I can help with delivery or invite a consultant into this chat.',quote:'Get a quote',track:'Track parcel',order:'Request pickup',handoff:'Talk to a person',handoffText:'I would like to talk to a human consultant.',quoteText:'Help me calculate the shipping price.',orderText:'I would like to request courier pickup.',back:'Back to conversation',contact:'Leave contact details',later:'Later',saved:'Contact details saved. Thank you!',trackNumber:'Tracking number',trackError:'Unable to get tracking information. Check the number or contact a consultant.',trackEmpty:'No events yet.',aiError:'Your message is saved, but Eva could not reply yet. Retry or ask for a consultant.',retry:'Retry reply',network:'Connection lost. Your message was not sent. Please try again.',consent:'By continuing, you agree to save this conversation for customer support. Eva’s replies use OpenAI AI. Do not send passport or bank card details.',accept:'Start with Eva',closed:'Conversation closed',placeholder:'Type your question…',rating:'Rate your consultation',rated:'Thank you for your feedback!',loading:'Loading…',contactNote:'Your name and phone help us reach you if you leave the website.',submitError:'Check your details. The request could not be submitted.'},
    he: {help:'עזרה',ai:'אווה · עוזרת וירטואלית',human:'נציג',waiting:'ממתינים לנציג',online:'הצוות זמין',offline:'נציג יחזור אליכם בשעות הפעילות',hello:'שלום! אני אווה, העוזרת הווירטואלית של Admiral. אעזור במשלוח או אזמין נציג לשיחה הזו.',quote:'חישוב מחיר',track:'מעקב משלוח',order:'הזמנת איסוף',handoff:'שיחה עם נציג',handoffText:'אני רוצה לדבר עם נציג אנושי.',quoteText:'עזרי לי לחשב את עלות המשלוח.',orderText:'אני רוצה להזמין איסוף עם שליח.',back:'חזרה לשיחה',contact:'השארת פרטי קשר',later:'אחר כך',saved:'פרטי הקשר נשמרו. תודה!',trackNumber:'מספר משלוח',trackError:'לא ניתן לקבל מידע. בדקו את המספר או פנו לנציג.',trackEmpty:'אין עדכונים עדיין.',aiError:'ההודעה נשמרה, אך אווה לא הצליחה לענות. נסו שוב או פנו לנציג.',retry:'ניסיון חוזר',network:'אין חיבור. ההודעה לא נשלחה. נסו שוב.',consent:'בהמשך אתם מסכימים לשמירת השיחה לצורך שירות. תשובות אווה נוצרות באמצעות OpenAI. אין לשלוח פרטי דרכון או כרטיס אשראי.',accept:'להתחיל עם אווה',closed:'השיחה הסתיימה',placeholder:'כתבו את השאלה שלכם…',rating:'דירוג השירות',rated:'תודה על הדירוג!',loading:'טוען…',contactNote:'שם וטלפון יעזרו לנו ליצור קשר אם תעזבו את האתר.',submitError:'בדקו את הפרטים. לא ניתן לשלוח את הבקשה.'}
  }[lang];
  const ns = 'apchat_' + KEY;
  const storage = {get(k){try{return localStorage.getItem(ns+k);}catch{return null;}},set(k,v){try{v===null?localStorage.removeItem(ns+k):localStorage.setItem(ns+k,v);}catch{}}};
  const S={token:storage.get('t'),open:script.dataset.open==='true'||storage.get('o')==='1',consent:storage.get('consent')==='1',chat:null,messages:[],last:0,visitor:{},online:false,busy:false,ready:false,draft:storage.get('draft')||'',view:'chat',unread:0,pending:null,aiError:false,orderDraft:{},orderTouched:{},number:null};
  const returnCopy = {
    ru: ['С возвращением! Продолжим с Евой или дождёмся консультанта?', 'Продолжить с Евой', 'Дождаться консультанта', 'Консультанты работают с воскресенья по пятницу с 09:00 до 18:00 по Израилю. Ваш запрос обработают в ближайшие рабочие часы.', 'С возвращением! Ваш диалог с консультантом открыт.', 'С возвращением! Ваш запрос в очереди к консультанту.'],
    en: ['Welcome back! Continue with Eva or wait for a consultant?', 'Continue with Eva', 'Wait for a consultant', 'Our consultants work Sunday to Friday, 09:00–18:00 Israel time. Your request will be handled during the next business hours.', 'Welcome back! Your conversation with the consultant is open.', 'Welcome back! Your request is in the queue for a consultant.'],
    he: ['ברוכים השבים! להמשיך עם אווה או להמתין לנציג?', 'להמשיך עם אווה', 'להמתין לנציג', 'הנציגים זמינים בימים ראשון עד שישי, 09:00–18:00 לפי שעון ישראל. נטפל בפנייה בשעות הפעילות הקרובות.', 'ברוכים השבים! השיחה עם הנציג פתוחה.', 'ברוכים השבים! הפנייה ממתינה לנציג.']
  }[lang];
  const visitKey = ns + '_visit';
  const idleTime = 30 * 60 * 1000;
  let lastVisit = 0, returning = false, canResume = false, choosing = false;
  try { lastVisit = Number(sessionStorage.getItem(visitKey)); } catch {}
  function markVisit() {
    const now = Date.now();
    if (S.messages.some(m=>m.author==='visitor') && (lastVisit === 0 || now - lastVisit >= idleTime)) returning = true;
    lastVisit = now;
    try { sessionStorage.setItem(visitKey, String(now)); } catch {}
  }
  function outsideHours(date = new Date()) {
    const parts = new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Jerusalem',weekday:'short',hour:'2-digit',hourCycle:'h23'}).formatToParts(date);
    const hour = Number(parts.find(p=>p.type==='hour').value);
    return parts.find(p=>p.type==='weekday').value === 'Sat' || hour < 9 || hour >= 18;
  }
  function showReturn(log) {
    const waiting = S.chat?.mode === 'waiting' && S.chat.status !== 'closed';
    const human = S.chat?.mode === 'human' && S.chat.status !== 'closed';
    const prompt = human ? returnCopy[4] : waiting && !canResume ? returnCopy[5] : returnCopy[0];
    log.append(bubble({author:'bot',name:copy.ai,body:prompt + (outsideHours() ? '\n\n' + returnCopy[3] : '')}));
    if (human) return;
    const card=el('div','card');
    async function choose(eva) {
      if (choosing) return;
      choosing=true;
      try {
        if (eva && waiting) merge(await api('resume_ai',{chat_id:S.chat.id,after:S.last}));
        if (!eva && !waiting) merge(await api('handoff',{body:copy.handoffText,request_id:crypto.randomUUID(),after:S.last}));
        returning=false;
        renderView(); schedule();
        if (eva) composer.querySelector('textarea').focus();
      } catch { showError(copy.network); }
      finally { choosing=false; }
    }
    if (!waiting || canResume) card.append(button(returnCopy[1],()=>choose(true),'chip'));
    card.append(button(returnCopy[2],()=>choose(false),'chip'));body.append(card);
  }
  let timer,body,composer,statusEl,actionsEl,panel,launcher,previousFocus;
  const host=document.createElement('div');host.id='admiral-chat-root';
  const root=host.attachShadow({mode:'open'});
  const el=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;};
  const button=(text,fn,cls='')=>{const b=el('button',cls,text);b.type='button';b.onclick=fn;return b;};
  const avatar=()=>{const img=el('img','avatar');img.src=new URL('consultant-eva.jpeg',base).href;img.alt='';return img;};
  const style=el('style');style.textContent=`
:host{all:initial;font-family:system-ui,-apple-system,'Segoe UI',sans-serif;color:#102e53;--navy:#102e53;--orange:#f59e0b;--line:#dfe7ef}*{box-sizing:border-box}button,input,textarea{font:inherit}button,a,input,textarea{outline-offset:3px}button{cursor:pointer}button:disabled{opacity:.55;cursor:wait}button:focus-visible,a:focus-visible{outline:3px solid #f59e0b}a{color:#245484}button{touch-action:manipulation}.launcher{position:fixed;right:20px;bottom:calc(96px + env(safe-area-inset-bottom,0px));z-index:10020;display:flex;align-items:center;gap:10px;border:2px solid #fff;background:var(--navy);color:white;border-radius:40px;padding:7px 20px 7px 7px;box-shadow:0 8px 28px #102e5333;font-size:15px;font-weight:650;min-height:58px}.avatar{height:42px;width:42px;border-radius:50%;object-fit:cover;object-position:50% 12%;background:white;flex-shrink:0}.badge{position:absolute;inset:-5px -3px auto auto;background:#e65d20;color:white;min-width:22px;height:22px;display:grid;place-items:center;border-radius:20px;border:2px solid white;font-size:11px}.window{position:fixed;z-index:10030;right:20px;bottom:20px;width:min(420px,calc(100vw - 24px));height:min(690px,calc(100dvh - 40px));display:flex;flex-direction:column;background:#f5f7fa;border:1px solid #dfe7ef;border-radius:24px;overflow:hidden;box-shadow:0 20px 65px #102e5333;font-size:14px;line-height:1.5}.header{background:var(--navy);color:white;padding:18px;display:flex;gap:12px;align-items:center;flex-shrink:0}.identity{flex:1;min-width:0}.brand{font-size:18px;letter-spacing:.2px;font-weight:750}.status{font-size:12px;color:#d6e3ef;margin-top:2px}.close{background:transparent;border:0;color:white;width:40px;height:40px;font-size:27px;border-radius:50%}.close:hover{background:#ffffff15}.body{flex:1;min-height:0;overflow-y:auto;overscroll-behavior:contain;padding:20px 16px;display:flex;flex-direction:column;gap:12px;scrollbar-width:thin}.message{max-width:90%;padding:12px 14px;border-radius:17px;white-space:pre-wrap;overflow-wrap:anywhere}.assistant{align-self:flex-start;background:white;border:1px solid #e8edf2;border-end-start-radius:5px}.customer{align-self:flex-end;background:#e5eef8;border-end-end-radius:5px}.system{align-self:center;text-align:center;color:#607184;font-size:12px;max-width:95%;padding:4px}.name{font-size:11px;font-weight:650;color:#4b637b;display:block;margin-bottom:4px}.time{display:block;font-size:10px;color:#8190a0;text-align:end;margin-top:5px}.actions{display:flex;gap:7px;flex-wrap:wrap;padding:10px 14px;background:#fff;border-top:1px solid var(--line);flex-shrink:0}.chip{background:#fff;border:1px solid #d9e2ec;color:var(--navy);border-radius:18px;padding:7px 11px;font-size:12px;min-height:34px}.chip:hover{background:#edf3f9}.compose{padding:10px 14px;display:flex;align-items:flex-end;gap:8px;background:white}.compose textarea{flex:1;width:0;resize:none;border:1px solid #d8e1ea;border-radius:16px;padding:11px 12px;min-height:44px;max-height:100px;background:#f9fbfd;color:var(--navy);font-size:16px}.send{flex-shrink:0;background:var(--orange);border:0;color:#102e53;border-radius:50%;width:44px;height:44px;display:grid;place-items:center}.send svg{width:20px;height:20px}.footer{display:flex;justify-content:space-between;padding:0 18px 12px;background:white;font-size:11px;color:#8290a0;flex-shrink:0}.footer a{color:#218447;text-decoration:none}.notice{font-size:11px;color:#718094;line-height:1.5;margin:0}.card{background:white;border:1px solid var(--line);border-radius:16px;padding:16px}.card h2{font-size:17px;margin:0 0 10px}.primary{border:0;background:var(--navy);color:white;border-radius:12px;padding:12px 16px;width:100%;margin-top:10px;font-weight:650}.link{background:transparent;border:0;color:#456683;text-decoration:underline;padding:8px 0;font-size:12px}.field{display:block;font-size:12px;font-weight:600;margin-top:11px}.field input{display:block;width:100%;border:1px solid #d6e0e9;border-radius:10px;padding:10px;font-size:16px;font-weight:400;margin-top:4px;color:#102e53}.field input:focus{outline:2px solid #4b7398}.consent{display:flex;align-items:flex-start;gap:8px;margin-top:15px;font-size:12px}.consent input{margin-top:4px}.error{color:#a33321;font-size:12px;margin-top:8px}.typing{font-size:12px;color:#6c7f93;padding:4px;align-self:flex-start}.stars{display:flex;justify-content:center;gap:8px}.stars button{background:white;border:0;color:#d18500;font-size:26px;min-width:35px}.back{align-self:flex-start}.track-event{border-inline-start:2px solid #d5e2ef;padding:0 0 14px 12px;margin-inline-start:4px;white-space:pre-wrap}.track-event strong{display:block}.window[dir=rtl] .track-event{padding:0 12px 14px 0}.window[dir=rtl] .send svg{transform:scaleX(-1)}
@media(max-width:600px){.launcher{right:12px;bottom:calc(86px + env(safe-area-inset-bottom,0px));font-size:14px;padding-right:16px;min-height:54px}.launcher .avatar{width:36px;height:36px}.window{right:0;bottom:auto;top:var(--viewport-top,0px);width:100%;max-width:100%;height:var(--viewport-height,100dvh);max-height:none;border:0;border-radius:0;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}.header{padding:12px 16px}.body{padding:16px 12px}.footer{padding-bottom:10px}.message{max-width:92%}}
@media(prefers-reduced-motion:no-preference){.launcher{animation:appear .25s ease-out}.window{animation:appear .2s ease-out}@keyframes appear{from{opacity:0;transform:translateY(7px)}to{opacity:1;transform:none}}}
`;
  root.append(style);document.body.append(host);
  // Hide old floating controls only after the replacement is mounted.
  const pageStyle=el('style');pageStyle.textContent='#admiral-ai-launch,#admiral-ai-panel{display:none!important}';document.head.append(pageStyle);
  function api(action,data={}){return fetch(API,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,key:KEY,token:S.token,lang,client:"admiral-unified-v1",page_url:location.href,page_title:document.title,...data}),signal:AbortSignal.timeout(160000)}).then(async r=>{const d=await r.json();if(!r.ok||d.error){const e=Error(d.error||t.error);e.status=r.status;throw e;}return d;});}
  const routeText = {
    ru: { no: name => 'К сожалению, ' + name + ' не входит в список стран, куда Admiral Post доставляет посылки из Израиля.', ask: 'В какую страну хотите отправить посылку? Укажите название страны, и я сверю его со списком направлений Admiral Post.', unavailable: 'Сейчас не удаётся проверить список направлений. Пожалуйста, попробуйте ещё раз или позовите консультанта.' },
    en: { no: name => 'Unfortunately, ' + name + ' is not among the countries Admiral Post delivers parcels to from Israel.', ask: 'Which country are you sending the parcel to? I’ll check our published destinations.', unavailable: 'I can’t check our destinations right now. Please try again or ask for a consultant.' },
    he: { no: name => 'לצערנו, ' + name + ' אינה ברשימת המדינות שאליהן Admiral Post שולחת חבילות מישראל.', ask: 'לאיזו מדינה תרצו לשלוח את החבילה? אבדוק ברשימת היעדים שלנו.', unavailable: 'כרגע אין אפשרות לבדוק את רשימת היעדים. אפשר לנסות שוב או לבקש נציג.' }
  }[lang];
  const normalizeCountry = text => String(text).toLowerCase().normalize('NFKC').replace(/[״"'׳]/g,'').replace(/[^\p{L}\p{N}]+/gu,' ').trim();
  const countryNames = new Intl.DisplayNames([lang],{type:'region'});
  const labels = new Map();
  const languages = ['ru','en','he','uk'].map(l=>new Intl.DisplayNames([l],{type:'region',fallback:'none'}));
  for(const a of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ') for(const b of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'){
    const code=a+b;
    if(code==='IL')continue;
    for(const display of languages){
      const name=display.of(code);
      if(!name)continue;
      const label=normalizeCountry(name);
      labels.set(label,code);
      if(/[ая]$/u.test(label))labels.set(label.slice(0,-1)+(label.endsWith('я')?'ю':'у'),code);
      if(display.resolvedOptions().locale==='he')labels.set('ל'+label,code);
    }
  }
  for(const [code,aliases] of Object.entries({KR:['южную корею','южная корея','южную короею','south okrea','south corea','корею','сеул','דרום קוריאה','לדרום קוריאה'],KP:['северную корею','северная корея','north okrea','пхеньян','צפון קוריאה','לצפון קוריאה'],US:['сша','америка','америку','usa'],BY:['белоруссию'],KG:['киргизию'],GB:['англию','uk']})){
    for(const alias of aliases)labels.set(alias,code);
  }
  const sortedLabels=[...labels].sort((a,b)=>b[0].length-a[0].length);
  function countryCodes(text){
    let phrase=' '+normalizeCountry(text)+' ';
    const found=[];
    for(const [label,code] of sortedLabels){
      const word=' '+label+' ';
      if(phrase.includes(word)){found.push(code);phrase=phrase.split(word).join(' ');}
    }
    return found;
  }
  let registry;
  async function destinations(){
    if(!registry)registry=fetch(new URL('delivery-destinations.json',base)).then(async r=>{
      if(!r.ok)throw Error();
      const data=await r.json();
      if(!Array.isArray(data.destinations)||!data.destinations.length)throw Error();
      return new Set(data.destinations);
    }).catch(e=>{registry=null;throw e;});
    return registry;
  }
  const shippingQuestion = /(?:отправ|достав|пересла|посылк|курьер|расч[её]т|ship|deliver|send|parcel|משלוח|לשלוח)/iu;
  function decision(text,allowed){
    const codes=countryCodes(text);
    const missing=codes.find(code=>!allowed.has(code));
    return missing ? routeText.no(countryNames.of(missing)) : null;
  }
  let turns=[];
  try{turns=JSON.parse(sessionStorage.getItem(ns+'routeTurns')||'[]');}catch{}
  function transcript(){
    const local=turns.filter(x=>x.token===S.token && (!x.chat||x.chat===S.chat?.id)).flatMap(x=>[{author:'visitor',body:x.text,at:x.at},{author:'bot',name:copy.ai,body:x.answer,at:x.at}]);
    return [...S.messages,...local].sort((a,b)=>Date.parse(a.at)-Date.parse(b.at));
  }
  function saveRouteTurn(text,answer){
    turns.push({token:S.token,chat:S.chat?.id,text,answer,at:new Date().toISOString()});turns=turns.slice(-30);
    try{sessionStorage.setItem(ns+'routeTurns',JSON.stringify(turns));}catch{}
  }
  async function guardReply(text){
    const allowed=await destinations();
    if(countryCodes(text).length)return decision(text,allowed);
    const prior=transcript().reverse().find(m=>m.author==='visitor'&&countryCodes(m.body).length);
    if((shippingQuestion.test(text) && !prior && /(?:цен|стои|сколько|куда|хочу отправ|заказать достав|рассчит|сколько|price|quote|how much|ship to|עלות|מחיר)/iu.test(text)) || (shippingQuestion.test(text) && /(?:достав|отправ|посылк).{0,28}\sв\s+\p{L}|(?:ship|deliver|send).{0,25}\bto\s+\p{L}/iu.test(text)))return routeText.ask;
    if(prior && (shippingQuestion.test(text)||/\d\s*(?:кг|kg|קג)|^(?:да|yes|כן)$/i.test(text)))return decision(prior.body,allowed);
    return null;
  }
  function merge(d){
    if(d.token){S.token=d.token;storage.set('t',d.token);}
    if(d.visitor)S.visitor=d.visitor;
    if(typeof d.online==='boolean')S.online=d.online;
    if(d.chat!==undefined){if(S.chat&&d.chat&&S.chat.id!==d.chat.id){S.messages=[];S.last=0;S.orderDraft={};S.orderTouched={};S.number=null;}S.chat=d.chat;}
    for(const m of d.messages||[]){if(S.messages.some(x=>x.id===m.id))continue;S.messages.push(m);S.last=Math.max(S.last,m.id);if(!S.open&&['operator','bot'].includes(m.author))S.unread++;}
    S.messages.sort((a,b)=>a.id-b.id);
    if(d.draft){for(const [k,v] of Object.entries(d.draft))if(!S.orderTouched[k])S.orderDraft[k]=v;}
    if(d.number)S.number=d.number;
    if(d.opened)S.open=true;
    updateStatus();
  }
  function identity(){if(S.chat?.status==='closed')return copy.closed;if(S.chat?.mode==='human')return (S.chat.operator_name||copy.human)+' · Admiral';if(S.chat?.mode==='waiting')return copy.waiting;return copy.ai;}
  function updateStatus(){if(statusEl)statusEl.textContent=identity();}
  function render(){
    root.querySelector('.launcher')?.remove();root.querySelector('.window')?.remove();body=null;composer=null;statusEl=null;
    if(!S.open){launcher=button('',open,'launcher');launcher.append(avatar(),el('span','',chatTitle));launcher.setAttribute('aria-label',chatTitle);launcher.setAttribute('aria-expanded','false');if(S.unread)launcher.append(el('span','badge',String(S.unread)));root.append(launcher);return;}
    panel=el('section','window');panel.dir=lang==='he'?'rtl':'ltr';panel.lang=lang;panel.setAttribute('role','dialog');panel.setAttribute('aria-label',chatTitle);
    const header=el('header','header'),ident=el('div','identity');ident.append(el('div','brand',chatTitle));statusEl=el('div','status',identity());statusEl.setAttribute('role','status');ident.append(statusEl);const closeButton=button('×',close,'close');closeButton.setAttribute('aria-label',t.close);header.append(avatar(),ident,closeButton);panel.append(header);
    body=el('div','body');panel.append(body);
    actionsEl=el('nav','actions');actionsEl.setAttribute('aria-label',copy.help);panel.append(actionsEl);
    composer=el('form','compose');const input=el('textarea');input.rows=1;input.maxLength=2000;input.placeholder=copy.placeholder;input.setAttribute('aria-label',t.question);input.value=S.draft;input.oninput=()=>{S.draft=input.value;storage.set('draft',S.draft);input.style.height='auto';input.style.height=Math.min(100,input.scrollHeight)+'px';};input.onkeydown=e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();send();}};
    const sendButton=el('button','send');sendButton.type='submit';sendButton.setAttribute('aria-label',t.send);sendButton.innerHTML='<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M2 21l21-9L2 3v7l15 2-15 2z"/></svg>';composer.append(input,sendButton);composer.onsubmit=e=>{e.preventDefault();send();};panel.append(composer);
    const foot=el('footer','footer');foot.append(el('span','','Admiral-Post'));const wa=el('a','','WhatsApp ↗');wa.href='https://wa.me/972555171600';wa.target='_blank';wa.rel='noopener noreferrer';foot.append(wa);panel.append(foot);root.append(panel);renderView();viewport();
  }
  function bubble(m){const n=el('article','message '+(m.author==='visitor'?'customer':m.author==='system'?'system':'assistant'));if(m.author!=='system'){n.append(el('strong','name',m.author==='visitor'?t.you:m.name||(m.author==='bot'?t.assistant:copy.human)));}const text=m.body||'';const url='https://www.admiral-post.com/documents/declaration.pdf';text.split(url).forEach((part,i)=>{if(i){const a=el('a','',t.pdf);a.href=url;a.target='_blank';a.rel='noopener';n.append(a);}n.append(document.createTextNode(part));});if(m.at)n.append(el('time','time',new Date(m.at).toLocaleTimeString(lang,{hour:'2-digit',minute:'2-digit'})));return n;}
  function renderView(){
    if(!body)return;body.replaceChildren();actionsEl.replaceChildren();composer.hidden=S.view!=='chat';composer.style.display=S.view==='chat'?'':'none';
    if(S.view!=='chat'){body.append(button('← '+copy.back,()=>{S.view='chat';renderView();},'chip back'));if(S.view==='order')return orderForm();if(S.view==='contact')return contactForm();if(S.view==='track')return trackingForm();}
    const log=el('div');log.style.display='contents';log.setAttribute('role','log');log.setAttribute('aria-live','polite');log.setAttribute('aria-label',copy.back);
    if(!S.messages.length)log.append(bubble({author:'bot',body:copy.hello,name:copy.ai}));for(const m of transcript()){if(m.author==='system'&&/Сообщение получено вне рабочего времени/.test(m.body))continue;log.append(bubble(m));}body.append(log);if(S.ready && returning)showReturn(log);
    if(!S.ready)body.append(el('p','notice',copy.loading));
    if(!S.consent&&S.chat?.mode!=='human'&&S.chat?.mode!=='waiting'){const card=el('div','card');card.append(el('p','notice',copy.consent),button(copy.accept,()=>{S.consent=true;storage.set('consent','1');renderView();composer.querySelector('textarea').focus();},'primary'));body.append(card);}
    if(S.busy||S.chat?.typing)body.append(el('div','typing',t.typing+'…'));
    if(S.aiError){const card=el('div','card');card.append(el('p','error',copy.aiError),button(copy.retry,()=>send(S.pending?.text,true),'chip'));body.append(card);}
    if(S.chat?.mode==='waiting'){body.append(el('p','notice',S.online?copy.online:copy.offline));if(!S.visitor.phone)body.append(button(copy.contact,()=>{S.view='contact';renderView();},'chip'));}
    if(S.chat?.status==='closed'&&!S.chat.rated){const c=el('div','card');c.append(el('p','notice',copy.rating));const stars=el('div','stars');for(let i=1;i<=5;i++)stars.append(button('★',async()=>{try{await api('rate',{rating:i});S.chat.rated=true;c.replaceChildren(el('p','notice',copy.rated));}catch{showError(t.error);}},''));c.append(stars);body.append(c);}
    actionsEl.append(button(copy.quote,()=>quick(copy.quoteText),'chip'),button(copy.track,()=>{S.view='track';renderView();},'chip'),button(copy.order,openOrder,'chip'),button(copy.handoff,handoff,'chip'));
    for(const b of actionsEl.querySelectorAll('button')){if([copy.quote,copy.order].includes(b.textContent))b.disabled=S.busy||!S.ready;}syncDisabled();body.scrollTop=body.scrollHeight;
  }
  function syncDisabled(){if(!composer)return;composer.querySelector('button').disabled=!S.ready||S.busy||(!S.consent&&!['human','waiting'].includes(S.chat?.mode));composer.querySelector('textarea').disabled=!S.ready||(!S.consent&&!['human','waiting'].includes(S.chat?.mode));}
  function showError(message){if(body){const n=el('div','error',message);n.setAttribute('role','alert');body.append(n);body.scrollTop=body.scrollHeight;}}
  function quick(text){if(!S.consent){S.draft=text;storage.set('draft',text);render();return;}send(text);}
  async function send(text,retry=false){
    text=(text??S.draft).trim();if(!text||S.busy||!S.ready)return;if(!S.consent&&!['human','waiting'].includes(S.chat?.mode)){renderView();return;}
    markVisit();returning=false;
    if(!S.pending||S.pending.text!==text)S.pending={text,id:crypto.randomUUID()};
    S.busy=true;S.aiError=false;S.view='chat';renderView();
    try{if(!['human','waiting'].includes(S.chat?.mode) || S.chat?.status==='closed'){
      let answer;try{answer=await guardReply(text);}catch{answer=routeText.unavailable;}
      if(answer){saveRouteTurn(text,answer);S.draft='';storage.set('draft','');S.pending=null;S.busy=false;render();schedule();return;}
    }
    const d=await api('send',{body:text,request_id:S.pending.id,after:S.last});if(!['waiting','human'].includes(d.chat?.mode) && d.messages?.some(m=>m.author==='bot')){const allowed=await destinations();for(const m of d.messages){if(m.author==='bot'){const denied=decision(m.body,allowed);if(denied){m.body=denied;delete d.draft;}}}}merge(d);S.aiError=!!d.ai_error;if(d.draft&&Object.values(d.draft).some(Boolean)&&S.chat?.mode==='ai')S.view='order';S.draft='';storage.set('draft','');if(!S.aiError)S.pending=null;}
    catch(e){showError(e.status?e.message:copy.network);S.busy=false;body?.querySelector('.typing')?.remove();syncDisabled();return;}
    finally{S.busy=false;}
    if(composer)composer.querySelector('textarea').value=S.draft;renderView();schedule();
  }
  async function handoff(){if(!S.ready)return;try{const d=await api('handoff',{body:copy.handoffText,request_id:crypto.randomUUID(),after:S.last});merge(d);S.aiError=false;S.view='chat';renderView();schedule();}catch(e){showError(e.message);}}
  async function openOrder(){if(!S.ready||S.busy)return;if(!S.chat){quick(copy.orderText);return;}S.view='order';renderView();try{const d=await api('application');merge(d);if(S.view==='order')renderView();}catch(e){showError(e.message);}}
  function field(form,name,label,type='text',required=true){const wrap=el('label','field',label);const input=el('input');input.name=name;input.type=type;input.required=required;wrap.append(input);form.append(wrap);return input;}
  function orderForm(){
    const c=el('div','card');c.append(el('h2','',copy.order));body.append(c);
    if(S.number){c.append(el('p','',t.receipt.replace('{n}',S.number)),el('p','notice',t.courier));return;}
    c.append(el('p','notice',t.review));const form=el('form');c.append(form);
    const limits={customer_name:120,phone:50,city:150,address:300,destination:100,contents:500,pickup_day:100,email:254,courier_note:500};
    for(const name of ['customer_name','phone','city','address','destination','weight_kg','contents','pickup_day','email','courier_note']){
      const input=field(form,name,t[name],name==='weight_kg'?'number':name==='phone'?'tel':name==='email'?'email':'text',!['email','courier_note'].includes(name));
      if(name==='weight_kg'){input.min='0.1';input.max='1000';input.step='0.1';}else input.maxLength=limits[name];
      input.value=S.orderDraft[name]|| (name==='customer_name'?S.visitor.name:name==='phone'?S.visitor.phone:'')||'';
      input.oninput=()=>{S.orderDraft[name]=input.value;S.orderTouched[name]=true;};
    }
    const consent=el('label','consent'),check=el('input');check.type='checkbox';check.required=true;consent.append(check,el('span','',t.consent));form.append(consent);
    const submit=el('button','primary',t.submit);submit.type='submit';form.append(submit);const err=el('div','error');err.setAttribute('role','alert');form.append(err);
    form.onsubmit=async e=>{e.preventDefault();if(submit.disabled)return;submit.disabled=true;err.textContent='';const draft=Object.fromEntries(new FormData(form));draft.weight_kg=Number(draft.weight_kg);draft.consent=check.checked;
      try{const allowed=await destinations();const denied=decision(draft.destination,allowed);if(denied||!countryCodes(draft.destination).length){err.textContent=denied||routeText.ask;submit.disabled=false;return;}const d=await api('submit',{draft,after:S.last});merge(d);S.view='chat';renderView();}catch(e){err.textContent=e.status?e.message:copy.submitError;submit.disabled=false;}};
  }
  function contactForm(){const c=el('div','card');c.append(el('h2','',copy.contact),el('p','notice',copy.contactNote));const form=el('form');const name=field(form,'name',t.customer_name);name.value=S.visitor.name||'';name.maxLength=120;const phone=field(form,'phone',t.phone,'tel');phone.value=S.visitor.phone||'';phone.maxLength=40;const submit=el('button','primary',t.send);submit.type='submit';const err=el('div','error');form.append(submit,err);c.append(form);body.append(c);form.onsubmit=async e=>{e.preventDefault();if(!/^\+?[\d\s()-]{9,25}$/.test(phone.value)||phone.value.replace(/\D/g,'').length<9){err.textContent=t.phoneError;return;}submit.disabled=true;try{await api('introduce',{name:name.value,phone:phone.value});S.visitor={name:name.value,phone:phone.value};S.view='chat';renderView();body.append(el('p','notice',copy.saved));}catch(e){err.textContent=e.message;submit.disabled=false;}};}
  function trackingForm(){const c=el('div','card');c.append(el('h2','',copy.track));const form=el('form');const number=field(form,'trackNumber',copy.trackNumber);number.maxLength=80;number.pattern='[A-Za-z0-9-]+';const submit=el('button','primary',copy.track);submit.type='submit';form.append(submit);const result=el('div');c.append(form,result);body.append(c);form.onsubmit=async e=>{e.preventDefault();submit.disabled=true;result.replaceChildren(el('p','notice',copy.loading));try{const r=await fetch('https://supabase.alilpost.ge/functions/v1/track-meest',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({trackNumber:number.value.trim()}),signal:AbortSignal.timeout(45000)});const d=await r.json();if(r.status===404){result.replaceChildren(el('p','notice',copy.trackEmpty));return;}if(!r.ok||d.error)throw Error();result.replaceChildren();const desc=v=>typeof v==='string'?v:v?.[lang]||v?.en||v?.ru||Object.values(v||{})[0]||'';for(const event of d.result||[]){const item=el('div','track-event');item.append(el('strong','',desc(event.eventDescr)),el('span','',event.eventDateTime+'\n'+[desc(event.eventCountryDescr),desc(event.eventCityDescr)].filter(Boolean).join(', ')));result.append(item);}if(!d.result?.length)result.append(el('p','notice',copy.trackEmpty));}catch{result.replaceChildren(el('p','error',copy.trackError));}finally{submit.disabled=false;}};}
  function open(){if(S.ready)markVisit();previousFocus=document.activeElement;S.open=true;S.unread=0;storage.set('o','1');render();panel.querySelector('.close').focus();schedule();}
  function close(){S.open=false;storage.set('o',null);render();launcher?.focus();schedule();}
  root.addEventListener('keydown',e=>{if(e.key==='Escape'&&S.open){e.preventDefault();close();}if(e.key==='Tab'&&S.open){const items=[...panel.querySelectorAll('button:not(:disabled),a,input:not(:disabled),textarea:not(:disabled)')].filter(n=>n.getClientRects().length);const first=items[0],last=items[items.length-1];if(e.shiftKey&&root.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&root.activeElement===last){e.preventDefault();first.focus();}}});
  function viewport(){if(!panel||!window.visualViewport)return;panel.style.setProperty('--viewport-height',window.visualViewport.height+'px');panel.style.setProperty('--viewport-top',window.visualViewport.offsetTop+'px');}
  window.visualViewport?.addEventListener('resize',viewport);window.visualViewport?.addEventListener('scroll',viewport);
  window.addEventListener('admiral-chat-open',open);
  function schedule(){clearTimeout(timer);if(document.hidden)return;timer=setTimeout(poll,S.open||S.chat?.status==='active'?4000:30000);}
  async function poll(){try{const last=S.last,mode=S.chat?.mode,typing=S.chat?.typing;merge(await api('ping',{after:S.last}));if(S.open&&S.view==='chat'&&(last!==S.last||mode!==S.chat?.mode||typing!==S.chat?.typing))renderView();else if(!S.open)render();}catch{}schedule();}
  document.addEventListener('visibilitychange',()=>{if(document.hidden)clearTimeout(timer);else if(S.ready){markVisit();if(S.open)renderView();poll();}});
  render();
  try{let d;try{d=await api('init',{referrer:document.referrer});}catch(e){if(e.status!==401)throw e;S.token=null;storage.set('t',null);d=await api('init',{referrer:document.referrer});}merge(d);canResume=d.settings?.resume_ai===true;S.ready=true;if(S.open)markVisit();render();schedule();}catch{S.ready=false;if(body)showError(t.error);}
})();
