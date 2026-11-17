import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';

export async function run(){
  const source=await fs.readFile(new URL('../admiral-order-api.js',import.meta.url),'utf8');
  const storage=new Map();let calls=[];let mode='network';let user=null;
  const db={auth:{getSession:async()=>({data:{session:user?{user:{id:user},access_token:'test-token'}:null},error:null})}};
  function load(){
    const ctx={crypto:webcrypto,TextEncoder,Uint8Array,JSON,Error,Object,
      ADMIRAL_SUPABASE_CONFIG:{url:'https://example.invalid',publishableKey:'public-test'},
      supabase:{createClient:()=>db},
      sessionStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},
      fetch:async(url,args)=>{calls.push({url,...args});if(mode==='network')throw Error('Network lost');return new Response(JSON.stringify(mode==='bad-success'?{ok:true}:{ok:true,order_id:12}),{status:mode==='error'?503:201});}};
    vm.runInNewContext(source,ctx);return ctx.AdmiralOrderApi;
  }
  let api=load();const payload={name:'Customer Test',phone:'+123456789',language:'ru'};
  await assert.rejects(api.send(payload));const first=JSON.parse(calls.at(-1).body).request_key;
  assert(!JSON.stringify([...storage.values()]).includes('Customer Test'));
  api=load();await assert.rejects(api.send(payload));assert.equal(JSON.parse(calls.at(-1).body).request_key,first);
  mode='error';await api.send(payload);assert.equal(JSON.parse(calls.at(-1).body).request_key,first);
  mode='bad-success';await assert.rejects(api.send(payload));assert.equal(JSON.parse(calls.at(-1).body).request_key,first);
  mode='success';await api.send(payload);assert.equal(JSON.parse(calls.at(-1).body).request_key,first);assert.equal(storage.size,0);
  await api.send(payload);assert.notEqual(JSON.parse(calls.at(-1).body).request_key,first);
  mode='network';await assert.rejects(api.send(payload));const guest=JSON.parse(calls.at(-1).body).request_key;
  user='verified-user';await assert.rejects(api.send(payload));assert.notEqual(JSON.parse(calls.at(-1).body).request_key,guest);assert.equal(calls.at(-1).headers.Authorization,'Bearer test-token');
  let scripts=0;
  for(const file of ['index.html','account.html','admin.html','en/index.html','he/index.html']){
    const text=await fs.readFile(new URL('../'+file,import.meta.url),'utf8');
    for(const match of text.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)){
      if(!match[2].trim()||/type\s*=\s*["']application\/ld\+json/i.test(match[1]))continue;
      new vm.Script(match[2],{filename:file});scripts++;
    }
    assert(!text.includes('/functions/v1/submit-quote'));
  }
  return ['PASS retries survive reload without storing customer fields','PASS success resets key; errors retain key','PASS signed-in identity changes request key','PASS all three language forms use direct endpoint helper',`PASS ${scripts} inline scripts parse`];
}
