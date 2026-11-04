(()=>{
 if(document.getElementById('admiral-ai-launch'))return;
 const style=document.createElement('style');style.textContent='#admiral-ai-launch{position:fixed;right:18px;bottom:96px;z-index:9997;border:2px solid white;border-radius:28px;padding:8px 16px 8px 8px;display:flex;align-items:center;gap:9px;background:#102e53;color:white;font:700 15px system-ui;box-shadow:0 5px 18px #102e5333;cursor:pointer}#admiral-ai-launch img{object-fit:cover;object-position:50% 12%;border-radius:50%;animation:eva-wave 7s ease-in-out infinite}@keyframes eva-wave{0%,70%,100%{transform:rotate(0)}78%{transform:rotate(-4deg)}88%{transform:rotate(3deg)}}@media(prefers-reduced-motion:reduce){#admiral-ai-launch img{animation:none}}#admiral-ai-panel{position:fixed;right:18px;bottom:18px;width:min(440px,calc(100vw - 24px));height:min(760px,calc(100dvh - 36px));z-index:100000;background:white;border:1px solid #cdd9e5;border-radius:18px;box-shadow:0 12px 50px #102e5350;overflow:hidden}#admiral-ai-panel[hidden]{display:none}#admiral-ai-panel iframe{width:100%;height:100%;border:0}@media(max-width:520px){#admiral-ai-launch{bottom:86px;right:14px;font-size:14px}#admiral-ai-panel{right:6px;bottom:6px;width:calc(100vw - 12px);height:calc(100dvh - 12px)}}';style.textContent+=`@media(max-width:600px){
body{padding-bottom:calc(78px + env(safe-area-inset-bottom,0px))!important}
html{scroll-padding-bottom:calc(90px + env(safe-area-inset-bottom,0px))}
body::after{content:"";position:fixed;inset:auto 0 0;height:calc(70px + env(safe-area-inset-bottom,0px));background:rgba(255,255,255,.97);border-top:1px solid #dce5ed;z-index:9996;pointer-events:none}
#admiral-ai-launch{right:calc(50% - 50px);width:100px;justify-content:center;bottom:calc(10px + env(safe-area-inset-bottom,0px));height:50px;padding:4px 14px 4px 5px;gap:7px;font-size:14px;border-radius:26px;box-shadow:none;max-width:calc(100vw - 180px)}
#admiral-ai-launch .eva-long{display:none}
#admiral-ai-launch .eva-short{display:inline}
#admiral-ai-launch img{width:38px;height:38px;animation:none}
body .whatsapp-float{right:22px!important;left:auto!important;bottom:calc(10px + env(safe-area-inset-bottom,0px))!important;width:72px!important;height:50px!important;border-radius:26px!important;justify-content:center!important;padding:10px!important;min-width:0!important;animation:none!important;z-index:9997!important}
body .whatsapp-float .wa-label{display:none}
#ap-cookie-reopen{left:10px;bottom:calc(16px + env(safe-area-inset-bottom,0px));max-width:85px;min-height:40px}
#admiral-ai-panel{right:0;bottom:0;width:100%;height:100dvh;border:0;border-radius:0;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}
} @media(min-width:601px){#admiral-ai-launch .eva-short{display:none}}`;style.textContent+=`
#admiral-ai-launch[aria-expanded="false"]{animation:eva-nudge 6s ease-in-out 2s infinite}
@media(hover:hover) and (pointer:fine){#admiral-ai-launch:hover{animation:none}}
#admiral-ai-launch:focus-visible{animation:none}
@keyframes eva-nudge{0%,22%,100%{transform:translateX(0) rotate(0)}4%,12%{transform:translateX(-2px) rotate(-1deg)}8%,16%{transform:translateX(2px) rotate(1deg)}20%{transform:translateX(-1px) rotate(-0.5deg)}}
@media(prefers-reduced-motion:reduce){#admiral-ai-launch[aria-expanded="false"]{animation:none}}
`;document.head.append(style);
 const name=document.documentElement.lang==='he'?'אווה · עוזרת וירטואלית':document.documentElement.lang==='en'?'Eva · Virtual assistant':'Ева · Виртуальный помощник';
 const button=document.createElement('button');button.id='admiral-ai-launch';button.type='button';const avatar=document.createElement('img');avatar.src='/consultant-eva.jpeg';avatar.alt='';avatar.width=40;avatar.height=40;const label=document.createElement('span');label.textContent=name;label.className='eva-long';const short=document.createElement('span');short.className='eva-short';short.textContent=document.documentElement.lang==='he'?'אווה':document.documentElement.lang==='en'?'Eva':'Ева';button.setAttribute('aria-label',name);button.append(avatar,label,short);button.setAttribute('aria-expanded','false');button.setAttribute('aria-controls','admiral-ai-panel');
 const panel=document.createElement('section');panel.id='admiral-ai-panel';panel.hidden=true;panel.setAttribute('aria-label',name+' · Admiral Post');let frame;
 const close=()=>{panel.hidden=true;button.setAttribute('aria-expanded','false');button.focus();};
 button.onclick=()=>{if(!panel.hidden){close();return;}if(!frame){frame=document.createElement('iframe');frame.src='/consultant.html?v=eva2&lang='+(['ru','en','he'].includes(document.documentElement.lang)?document.documentElement.lang:'ru');frame.title=name+' · Admiral Post';panel.append(frame);}panel.hidden=false;button.setAttribute('aria-expanded','true');frame.focus();};
 window.addEventListener('message',e=>{if(e.origin===location.origin&&e.source===frame?.contentWindow&&e.data?.type==='admiral-chat-close')close();});window.addEventListener('keydown',e=>{if(e.key==='Escape'&&!panel.hidden)close();});document.body.append(button,panel);
})();
