// Run: node tests/chat-attachments.cjs (Playwright + Chromium required).
const {chromium}=require('playwright');
const fs=require('node:fs/promises');const path=require('node:path');const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{}),args:['--no-sandbox']});
 try {
 for(const lang of ['ru','en','he']){
  const context=await browser.newContext({viewport:{width:360,height:740},acceptDownloads:true});
  const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  let fail=true,capability=true,messages=[],uploadIds=[];
  await page.route('https://chat.test/**',async route=>{
   const url=new URL(route.request().url());
   if(url.pathname==='/')return route.fulfill({contentType:'text/html',body:`<!doctype html><html lang="${lang}"><body><script src="/admiral-chat.js" data-key="test" data-open="true"></script></body></html>`});
   try{const file=await fs.readFile(path.join(__dirname,'..',url.pathname));await route.fulfill({contentType:url.pathname.endsWith('.js')?'text/javascript':'application/octet-stream',body:file});}catch{await route.abort();}
  });
  await page.route('https://supabase.alilpost.ge/**',async route=>{
   const req=route.request();let b;
   if(req.headers()['content-type']?.startsWith('multipart/')){
    const form=await new Response(req.postDataBuffer(),{headers:{'content-type':req.headers()['content-type']}}).formData();
    b=Object.fromEntries(form.entries());uploadIds.push(b.request_id);
    assert.equal(b.file.name,'declaration.pdf');assert.equal(b.body,'Please check');
    if(fail){fail=false;return route.fulfill({status:503,json:{error:'failure'}});}
    messages=[{id:1,author:'visitor',body:b.body,attachment:{name:b.file.name,size:b.file.size,mime:'application/pdf'},at:new Date().toISOString()}];
   }else b=req.postDataJSON();
   if(b.action==='attachment_url')return route.fulfill({json:{url:'https://supabase.alilpost.ge/download.pdf'}});
   return route.fulfill({json:{token:'test-token',settings:{attachments:capability},chat:messages.length?{id:1,status:'waiting',mode:'ai'}:null,messages,visitor:{},online:false}});
  });
  await page.goto('https://chat.test/');await page.locator('.attach').waitFor();
  assert.equal(await page.locator('.attach').isDisabled(),true);
  await page.locator('.primary').click();
  assert.equal(await page.locator('.attach').isDisabled(),false);
  await page.locator('input[type=file]').setInputFiles({name:'photo.png',mimeType:'image/png',buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aP9sAAAAASUVORK5CYII=','base64')});
  assert.equal(await page.locator('.file-tray img').count(),1);await page.locator('.file-tray button').click();
  await page.locator('input[type=file]').setInputFiles({name:'unsafe.svg',mimeType:'image/svg+xml',buffer:Buffer.from('<svg/>')});
  assert.equal(await page.locator('.file-tray').isVisible(),false);
  await page.locator('input[type=file]').setInputFiles({name:'declaration.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF-1.7 test')});
  assert.equal(await page.locator('.file-tray').isVisible(),true);
  await page.locator('.file-tray button').click();assert.equal(await page.locator('.file-tray').isVisible(),false);
  await page.locator('input[type=file]').setInputFiles({name:'declaration.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF-1.7 test')});
  await page.locator('textarea').fill('Please check');await page.locator('.send').click();
  await page.waitForFunction(()=>!document.querySelector('#admiral-chat-root').shadowRoot.querySelector('.send').disabled);
  assert.equal(await page.locator('.file-tray').isVisible(),true);assert.equal(await page.locator('textarea').inputValue(),'Please check');
  await page.locator('.send').click();await page.locator('.attachment-link').waitFor();
  assert.equal(uploadIds.length,2);assert.equal(uploadIds[0],uploadIds[1]);assert.equal(await page.locator('.file-tray').isVisible(),false);
  assert.equal(await page.locator('textarea').inputValue(),'');
  const layout=await page.locator('.compose').evaluate(n=>({width:n.clientWidth,scroll:n.scrollWidth,input:n.querySelector('textarea').getBoundingClientRect().width}));
  assert.ok(layout.scroll<=layout.width);assert.ok(layout.input>=100);
  await page.reload();await page.locator('.attachment-link').waitFor();
  capability=false;await page.reload();await page.locator('.attachment-link').waitFor();assert.equal(await page.locator('.attach').count(),0);
  assert.deepEqual(errors,[]);console.log(lang+': attachment selection, remove, retry, persistence, capability gate, mobile layout passed');
  await context.close();
 }
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
