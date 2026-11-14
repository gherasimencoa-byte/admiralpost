/* Progressive upgrade: the existing form and backend remain available if JS fails. */
(function(){
'use strict';
const form=document.getElementById('orderForm');
if(!form||!window.AdmiralPricing)return;
const card=form.closest('.quote-form-card');
if(card){
 const h=card.querySelector('h3'),intro=card.querySelector('p.muted');
 if(h)h.textContent='Вызвать курьера';
 if(intro)intro.textContent='Три коротких шага, без регистрации. Курьер заберёт посылку по вашему адресу в Израиле.';
}
const originalHoneypot='<div aria-hidden="true" style="position:absolute;left:-10000px;width:1px;height:1px;overflow:hidden"><label>Leave blank<input type="text" name="website" tabindex="-1" autocomplete="off"></label></div>';
form.classList.add('courier-steps');
form.noValidate=true;
form.innerHTML=`
 <div class="courier-steps-nav" aria-label="Этапы заявки"><span class="current">1. Посылка</span><span>2. Адрес</span><span>3. Контакты</span></div>
 <section class="courier-step" data-step="1">
  <div class="form-group"><label for="country">Куда отправляем *</label><select name="country" id="country" required>
   <option value="">Выберите направление</option><option>Россия</option><option>Беларусь</option><option>Украина</option><option>Молдова</option><option>Грузия</option><option value="Европа">Европа (страны ЕС)</option><option>США</option><option>Канада</option><option value="Другое">Другое направление — уточнить</option>
  </select></div>
  <div class="form-group"><label for="weight">Примерный вес, кг *</label><div class="weight-choices" role="group" aria-label="Выбрать вес">
   <button type="button" data-weight="2">до 2</button><button type="button" data-weight="5">до 5</button><button type="button" data-weight="10">до 10</button><button type="button" data-weight="20">до 20</button>
  </div><input type="number" name="weight" id="weight" min="0.1" step="0.1" inputmode="decimal" placeholder="или точный вес, например 7" required><small class="muted">Фактический или объёмный вес уточнит курьер.</small></div>
  <div class="form-group"><label for="type">Что отправляете</label><input type="text" name="type" id="type" placeholder="Личные вещи, подарки, документы..."></div>
  <div id="courierPrice" class="courier-price" hidden aria-live="polite"></div>
  <p id="courierStep1Error" class="courier-error" role="alert"></p>
  <div class="courier-actions"><button type="button" class="courier-primary" data-next="1">Далее: адрес и день →</button></div>
 </section>
 <section class="courier-step" data-step="2" hidden>
  <div class="form-group" id="savedAddressGroup" hidden><label for="savedPickupAddress">Сохранённый адрес</label><select id="savedPickupAddress"><option value="">Выбрать адрес из кабинета</option></select></div>
  <div class="form-group"><label for="pickupCity">Город в Израиле *</label><input type="text" id="pickupCity" name="pickupCity" autocomplete="address-level2" required placeholder="Например, Хайфа" list="courierCityHints"><datalist id="courierCityHints"><option value="Тель-Авив"><option value="Хайфа"><option value="Иерусалим"><option value="Ашдод"><option value="Бат-Ям"><option value="Холон"><option value="Ришон-ле-Цион"><option value="Нетания"><option value="Беэр-Шева"></datalist></div>
  <div class="form-group"><label for="pickupStreet">Улица, дом, квартира *</label><input type="text" id="pickupStreet" name="pickupStreet" autocomplete="street-address" required placeholder="Улица, дом, квартира / подъезд"></div>
  <div class="form-group"><label>Когда удобно принять курьера</label><div id="courierDates" class="date-choices" role="group" aria-label="Предварительная дата забора"></div><small class="muted">Дата предварительная. Оператор подтвердит день и время.</small></div>
  <p id="courierStep2Error" class="courier-error" role="alert"></p>
  <div class="courier-actions"><button type="button" class="courier-secondary" data-back="2">← Назад</button><button type="button" class="courier-primary" data-next="2">Далее: контакты →</button></div>
 </section>
 <section class="courier-step" data-step="3" hidden>
  <div class="form-group"><label for="name">Ваше имя *</label><input id="name" name="name" type="text" autocomplete="name" required placeholder="Как к вам обращаться"></div>
  <div class="form-group"><label for="phone">Телефон *</label><input id="phone" name="phone" type="tel" autocomplete="tel" inputmode="tel" required placeholder="+972..."></div>
  <details><summary>Email и комментарий (необязательно)</summary><div class="form-group"><label for="email">Email</label><input id="email" name="email" type="email" autocomplete="email" placeholder="name@example.com"></div><div class="form-group"><label for="message">Комментарий</label><textarea id="message" name="message" placeholder="Пожелания к забору"></textarea></div></details>
  <div class="checkbox-row"><input type="checkbox" id="agree" name="agree" required><label for="agree">Я подтверждаю, что ознакомлен(а) с основными ограничениями на перевозку и согласен(а) на обработку моих данных для связи по заявке.</label></div>
  ${originalHoneypot}
  <div class="courier-price" id="courierFinalPrice"></div>
  <p id="courierStep3Error" class="courier-error" role="alert"></p>
  <div class="courier-actions"><button type="button" class="courier-secondary" data-back="3">← Назад</button><button type="submit" class="courier-primary">Вызвать курьера</button></div>
 </section>
 <section class="courier-success" id="courierSuccess" hidden aria-live="polite"></section>
 <div id="formStatus" class="form-status" role="status" aria-live="polite"></div>`;
const el=id=>document.getElementById(id);
const tariffKeys={'Россия':'russia','Беларусь':'belarus','Украина':'ukraine','Молдова':'moldova','Грузия':'georgia','Европа':'europe','США':'usa','Канада':'canada'};
const money=n=>'₪'+Math.round(n).toLocaleString('ru-RU');
const state={step:1,date:'',quote:null,reference:''};
function view(step){state.step=step;form.querySelectorAll('.courier-step').forEach(x=>x.hidden=Number(x.dataset.step)!==step);form.querySelectorAll('.courier-steps-nav span').forEach((x,i)=>{x.className=i+1===step?'current':i+1<step?'done':''});form.querySelector('.courier-steps-nav').hidden=false;const target=form.querySelector('.courier-step:not([hidden])');if(target)target.scrollIntoView({behavior:'smooth',block:'nearest'});}
function fail(step,message,field){el('courierStep'+step+'Error').textContent=message;if(field){field.setAttribute('aria-invalid','true');field.focus();}return false;}
function updatePrice(){
 const key=tariffKeys[el('country').value],raw=Number(el('weight').value),box=el('courierPrice');
 box.hidden=true;state.quote=null;
 if(el('country').value==='Другое'){box.hidden=false;box.textContent='Направление вне опубликованного списка. Возможность доставки и стоимость уточнит оператор.';return;}
 if(!key||!Number.isFinite(raw)||raw<=0)return;
 const t=AdmiralPricing.tariffs[key];
 if(raw>t.limit){box.hidden=false;box.textContent='Максимальный вес: '+t.limit+' кг. Разделите вещи на несколько посылок.';return;}
 const q=AdmiralPricing.quote(key,raw);state.quote=q;
 box.hidden=false;box.replaceChildren();
 const title=document.createElement('strong');title.textContent=money(q.total);
 const small=document.createElement('small');small.textContent='Ориентировочно за '+q.billed+' кг · комбинированная доставка. Срок зависит от направления.';
 box.append(title,small);
}
function validate(step){
 el('courierStep'+step+'Error').textContent='';
 form.querySelectorAll('[aria-invalid]').forEach(x=>x.removeAttribute('aria-invalid'));
 if(step===1){if(!el('country').value)return fail(1,'Выберите направление.',el('country'));if(el('country').value==='Другое')return fail(1,'Для неподдерживаемого направления обратитесь к оператору.',el('country'));
 const n=Number(el('weight').value);if(!Number.isFinite(n)||n<=0)return fail(1,'Укажите вес посылки.',el('weight'));const t=AdmiralPricing.tariffs[tariffKeys[el('country').value]];if(n>t.limit)return fail(1,'Максимальный вес для направления — '+t.limit+' кг. Разделите посылку.',el('weight'));}
 if(step===2){if(!el('pickupCity').value.trim())return fail(2,'Введите город в Израиле.',el('pickupCity'));if(!el('pickupStreet').value.trim())return fail(2,'Введите улицу и номер дома.',el('pickupStreet'));}
 if(step===3){if(!el('name').value.trim())return fail(3,'Введите имя.',el('name'));if(!el('phone').value.trim()||el('phone').value.replace(/\D/g,'').length<7)return fail(3,'Введите корректный телефон.',el('phone'));if(el('email').value&&!el('email').checkValidity())return fail(3,'Проверьте email.',el('email'));if(!el('agree').checked)return fail(3,'Необходимо согласие с условиями.',el('agree'));}
 return true;
}
el('country').addEventListener('change',updatePrice);
el('weight').addEventListener('input',()=>{form.querySelectorAll('[data-weight]').forEach(b=>b.setAttribute('aria-pressed',String(Number(b.dataset.weight)===Number(el('weight').value))));updatePrice()});
form.querySelectorAll('[data-weight]').forEach(b=>b.addEventListener('click',()=>{el('weight').value=b.dataset.weight;el('weight').dispatchEvent(new Event('input',{bubbles:true}));}));
const days=el('courierDates');const today=new Date();today.setHours(12,0,0,0);
for(let offset=1,count=0;count<5&&offset<20;offset++){const d=new Date(today);d.setDate(d.getDate()+offset);if(d.getDay()===5||d.getDay()===6)continue;const value=[d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');if(!state.date)state.date=value;const b=document.createElement('button');b.type='button';b.className='courier-date';b.dataset.date=value;b.textContent=d.toLocaleDateString('ru-RU',{weekday:'short',day:'numeric',month:'short'});b.setAttribute('aria-pressed',String(state.date===value));b.addEventListener('click',()=>{state.date=value;days.querySelectorAll('button').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));});days.append(b);count++;}
const any=document.createElement('button');any.type='button';any.textContent='Не важно';any.addEventListener('click',()=>{state.date='';days.querySelectorAll('button').forEach(x=>x.setAttribute('aria-pressed',String(x===any)));});days.append(any);
form.querySelectorAll('[data-next]').forEach(b=>b.addEventListener('click',()=>{if(!validate(state.step))return;if(state.step===2){el('courierFinalPrice').textContent=(state.quote?money(state.quote.total)+' ориентировочно · ':'Цена уточняется · ')+el('country').value+' · '+el('weight').value+' кг';}view(state.step+1);}));
form.querySelectorAll('[data-back]').forEach(b=>b.addEventListener('click',()=>view(state.step-1)));
el('savedPickupAddress').addEventListener('change',()=>{const option=el('savedPickupAddress').selectedOptions[0];if(!option||!option.value)return;const bits=option.value.split(',').map(s=>s.trim());el('pickupCity').value=bits.length>=2?bits[bits.length-2]:bits[0];el('pickupStreet').value=bits[bits.length-1]||'';});
// Existing account prefill code may populate the select after authentication.
new MutationObserver(()=>{const group=el('savedAddressGroup');group.hidden=el('savedPickupAddress').options.length<=1;}).observe(el('savedPickupAddress'),{childList:true});
form.addEventListener('submit',async e=>{
 e.preventDefault();e.stopImmediatePropagation();if(state.step!==3||!validate(3))return;
 const status=el('formStatus'),cfg=window.ADMIRAL_SUPABASE_CONFIG||{};status.textContent='';
 if(!cfg.url||!cfg.publishableKey)return fail(3,'Сервис заказов временно недоступен. Свяжитесь с оператором.');
 const pickup='Адрес забора: '+el('pickupCity').value.trim()+', '+el('pickupStreet').value.trim();
 const preferred='Желаемый день: '+(state.date||'не важно')+' (предварительно)';
 const payload={country:el('country').value,weight:el('weight').value,type:el('type').value,name:el('name').value.trim(),phone:el('phone').value.trim(),email:el('email').value.trim(),message:[pickup,preferred,el('message').value.trim()].filter(Boolean).join('\n'),pickup_city:el('pickupCity').value.trim(),pickup_address:el('pickupStreet').value.trim(),pickup_date:state.date||null,agree:el('agree').checked,website:form.elements.website?.value||'',language:'ru'};
 const submit=form.querySelector('[type=submit]');submit.disabled=true;submit.textContent='Отправляем…';
 try{
  let token=null;if(window.supabase){const db=window.supabase.createClient(cfg.url,cfg.publishableKey);token=(await db.auth.getSession()).data.session?.access_token||null;}
  const response=await fetch(cfg.url.replace(/\/$/,'')+'/functions/v1/submit-quote',{method:'POST',headers:{'Content-Type':'application/json',apikey:cfg.publishableKey,...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify(payload)});
  const result=await response.json().catch(()=>({}));
  if(!response.ok||result.error)throw Error(result.error||'Сервер не подтвердил приём заявки.');
  const ref=result.order_number||result.request_number||result.reference||result.order?.number||result.order?.order_number||'';
  const success=el('courierSuccess');success.replaceChildren();const h=document.createElement('h3');h.textContent=ref?'Заявка '+String(ref)+' принята':'Заявка отправлена';const p=document.createElement('p');p.textContent=[el('country').value,el('weight').value+' кг',state.quote?money(state.quote.total)+' ориентировочно':'Стоимость уточнит оператор',el('pickupCity').value+', '+el('pickupStreet').value,'Желаемый день: '+(state.date||'не важно')].join(' · ');const note=document.createElement('p');note.textContent='Оператор свяжется с вами, чтобы подтвердить адрес и день забора.';const actions=document.createElement('div');actions.className='courier-actions';const wa=document.createElement('a');wa.className='courier-primary';wa.target='_blank';wa.rel='noopener noreferrer';wa.textContent='WhatsApp';wa.href='https://wa.me/972522323554?text='+encodeURIComponent('Здравствуйте! '+(ref?'Моя заявка '+ref+'. ':'')+'Прошу подтвердить забор посылки.');const again=document.createElement('button');again.type='button';again.className='courier-secondary';again.textContent='Новая посылка';again.addEventListener('click',()=>{form.reset();state.date=days.querySelector('button')?.dataset.date||'';days.querySelectorAll('button').forEach((x,i)=>x.setAttribute('aria-pressed',String(i===0)));form.querySelectorAll('[data-weight]').forEach(x=>x.setAttribute('aria-pressed','false'));success.hidden=true;form.querySelector('.courier-steps-nav').hidden=false;view(1);updatePrice();});actions.append(wa,again);success.append(h,p,note,actions);form.querySelectorAll('.courier-step').forEach(x=>x.hidden=true);form.querySelector('.courier-steps-nav').hidden=true;success.hidden=false;success.scrollIntoView({behavior:'smooth',block:'nearest'});
 }catch(err){fail(3,err.message||'Ошибка отправки, попробуйте позже.');}finally{submit.disabled=false;submit.textContent='Вызвать курьера';}
},true);
})();
