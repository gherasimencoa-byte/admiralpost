// Only server-selected, saved AI applications can enter this queue.
export async function notifyPending(db:any) {
 const key=Deno.env.get('RESEND_API_KEY');
 if(!key){console.error('consultant_notification_missing_config');return;}
 const pending=await db('consultant_notifications?sent_at=is.null&last_attempt=lt.'+encodeURIComponent(new Date(Date.now()-60000).toISOString())+'&order=created_at.asc&limit=5');
 for(const entry of pending){
  const claimed=await db('consultant_notifications?quote_id=eq.'+entry.quote_id+'&sent_at=is.null&last_attempt=eq.'+encodeURIComponent(entry.last_attempt),'PATCH',{last_attempt:new Date().toISOString(),attempts:entry.attempts+1});
  if(!claimed.length)continue;
  try{
   const q=(await db('quote_requests?id=eq.'+entry.quote_id+'&select=id,request_number,created_at,customer_name,phone,email,destination,weight_kg,contents,message'))[0];if(!q)continue;
   const escape=(v:unknown)=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
   const rows=[['Номер',q.request_number],['Дата',q.created_at],['Имя',q.customer_name],['Телефон',q.phone],['Email',q.email],['Направление',q.destination],['Вес, кг',q.weight_kg],['Содержимое',q.contents],['Забор и пожелания',q.message]];
   const html='<h2>Новая заявка из ИИ-чата Admiral Post</h2><table>'+rows.map(([k,v])=>'<tr><th align="left">'+escape(k)+'</th><td style="white-space:pre-wrap">'+escape(v)+'</td></tr>').join('')+'</table><p><a href="https://www.admiral-post.com/admin.html">Открыть заявки</a></p>';
   const response=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:'Bearer '+key,'Content-Type':'application/json','Idempotency-Key':'admiral-ai-quote-'+q.id},body:JSON.stringify({from:Deno.env.get('NOTIFICATION_FROM_EMAIL')||'Admiral Post <onboarding@resend.dev>',to:['gherasimenco.a@icloud.com'],subject:'Admiral Post — заявка №'+q.request_number+' из ИИ-чата',html,...(q.email?{reply_to:q.email}:{})}),signal:AbortSignal.timeout(10000)});
   if(!response.ok)throw Error('provider_http_'+response.status);
   const result=await response.json();if(!result.id)throw Error('provider_missing_id');
   await db('consultant_notifications?quote_id=eq.'+q.id,'PATCH',{sent_at:new Date().toISOString(),provider_id:result.id,last_error:null});
  }catch(e){const message=(e as Error).message;const code=/^provider_(http_\d+|missing_id)$/.test(message)?message:'delivery_attempt_failed';await db('consultant_notifications?quote_id=eq.'+entry.quote_id,'PATCH',{last_error:code});console.error('consultant_notification_failed '+code);}
 }
}
