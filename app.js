const $ = s => document.querySelector(s);
const authFeedback=(text,isError=true)=>window.wishlistAuthFeedback?.(text,isError);
const node = (tag, text, cls) => { const n=document.createElement(tag); if(text)n.textContent=text;if(cls)n.className=cls;return n; };
const safeURL = value => {try{const u=new URL(value);return u.protocol==='https:'?u.href:null;}catch{return null;}};
let data,config,person='all',demo=false,busy=false,statuses=[],session=null;
const demoStates=new Map();
try{session=JSON.parse(localStorage.getItem('badillo-session'));}catch{}
const connected=()=>Boolean(config?.supabaseUrl&&config?.publishableKey);
function saveSession(s){session=s;try{s?localStorage.setItem('badillo-session',JSON.stringify(s)):localStorage.removeItem('badillo-session');}catch{}}
async function request(path,body,authenticated=true,method='POST'){
 if(authenticated&&session&&Date.now()/1000>session.expires_at-60){const s=await request('/auth/v1/token?grant_type=refresh_token',{refresh_token:session.refresh_token},false);saveSession({...s,expires_at:Date.now()/1000+s.expires_in});}
 const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),15000);let response;try{response=await fetch(config.supabaseUrl+path,{method,headers:{'Content-Type':'application/json',apikey:config.publishableKey,...(authenticated&&session?{Authorization:'Bearer '+session.access_token}:{})},...(method==='GET'?{}:{body:JSON.stringify(body)}),signal:controller.signal});}catch(e){throw Error(e.name==='AbortError'?'The request timed out. Check your connection and try again.':'Could not reach sign-in. Check your connection or browser blocking settings.');}finally{clearTimeout(timer);}
 const result=await response.json().catch(()=>null);if(!response.ok)throw Error((result?.message||result?.msg||result?.error_description||'The request was rejected.')+' (HTTP '+response.status+(result?.error_code?', '+result.error_code:'')+')');return result;
}
function notice(text){$('#connection').textContent=text;}
async function refresh(){if(demo)return;statuses=[];if(!connected()){notice('Gift ideas are being gathered. Shared reservation and purchase tracking is not connected yet.');render();return;}
 if(!session){notice('Use Sign in at the top right with your invited family email to see shared availability and reserve gifts.');render();return;}
 render();try{statuses=await request('/rest/v1/rpc/list_gift_statuses',{});notice('Family tracking connected · Updates refresh every 20 seconds. Availability is confirmed when you reserve.');}catch(e){notice('Tracking unavailable: '+e.message+' Do not rely on availability until reconnected.');}render();}
function render(){ $('#logout').hidden=!session;$('#signin').hidden=!!session;$('#account-email').hidden=!session;$('#account-email').textContent=session?.user?.email|| (session?'Account unavailable':'');$('#login').hidden=!!session;$('#filter').disabled=!demo&&(!connected()||!session||!statuses.length);if($('#filter').disabled)$('#filter').value='all';const gifts=demo?data.examples:data.gifts;
 $('#list-title').textContent=(person==='all'?'Everyone':data.people.find(p=>p.id===person).name)+(demo?'’s demo gifts':'’s wishlist');
 const root=$('#gifts');root.replaceChildren();const list=gifts.filter(g=>person==='all'||g.person===person).filter(g=>{const s=demo?demoStates.get(g.id):statuses.find(s=>s.gift_id===g.id)?.status;return $('#filter').value==='all'||(s||'available')===$('#filter').value;});
 if(!list.length){const e=node('div',null,'empty');e.append(node('div','✧'),node('h3',gifts.length?'No gifts in this view':'Good things are on their way.'),node('p',gifts.length?'Try another person or availability filter.':'We’re gathering ideas for Livia and Luca. Check back soon.'),node('p','No gifts are expected. Your company is the best present.'));root.append(e);return;}
 for(const g of list){const state=demo?{status:demoStates.get(g.id),mine:demoStates.has(g.id)}:statuses.find(s=>s.gift_id===g.id);const card=node('article',null,'card'),art=node('div',null,'art');if(safeURL(g.image)){const img=node('img');img.src=safeURL(g.image);img.alt=g.title;img.loading='lazy';img.referrerPolicy='no-referrer';img.addEventListener('error',()=>art.replaceChildren(node('span',g.symbol||'🎁')));art.append(img);}else art.textContent=g.symbol||'🎁';
 const c=node('div',null,'content');c.append(node('span',(demo?'DEMO · ':'')+data.people.find(p=>p.id===g.person).name,'tag'),node('h3',g.title));const pills=node('div',null,'pills');if(g.match==='exact'||g.match==='similar')pills.append(node('span',g.match==='exact'?'Exact item please':'Similar is lovely'));if(typeof g.used==='boolean')pills.append(node('span',g.used?'Gently used welcome':'New please'));c.append(pills,node('p',g.notes));if(safeURL(g.url)){const a=node('a',demo?'Example product link ↗':'View gift ↗','product');a.href=safeURL(g.url);a.target='_blank';a.rel='noopener noreferrer';c.append(a);}
 c.append(node('b',demo?(state.status||'available')+' · demo only':(!connected()||!session||!state?'Availability unavailable':state.status)));
 const actions=node('div',null,'actions');const enabled=demo||connected()&&session&&Boolean(state);for(const [label,value] of ((!state?.status||state.status==='available')?[['Reserve','reserved'],['Purchased','purchased']]:state.mine?[...(state.status==='reserved'?[['Mark purchased','purchased']]:[]),['Undo my selection','available']]:[])){const b=node('button',label);b.disabled=busy||!enabled;b.addEventListener('click',()=>change(g.id,value));actions.append(b);}c.append(actions);card.append(art,c);root.append(card);}}
async function change(id,status){busy=true;render();try{if(demo){status==='available'?demoStates.delete(id):demoStates.set(id,status);notice('DEMO PREVIEW · These examples and selections are only in this tab. Nothing is reserved for real.');}else{await request('/rest/v1/rpc/set_gift_status',{p_gift_id:id,p_status:status});await refresh();}}catch(e){notice('Selection not saved: '+e.message);await refresh();$('#auth-message').textContent='Selection not saved: '+e.message;}finally{busy=false;render();}}
async function start(){try{[data,config]=await Promise.all(['data/wishlist.json','config.json'].map(async p=>{const r=await fetch(p,{cache:'no-store'});if(!r.ok)throw Error('Unable to load wishlist');return r.json();}));if(config.supabaseUrl&&!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(config.supabaseUrl))throw Error('Invalid backend URL');
 const hash=new URLSearchParams(location.hash.slice(1));if(hash.has('access_token')){saveSession({access_token:hash.get('access_token'),refresh_token:hash.get('refresh_token'),expires_at:Date.now()/1000+Number(hash.get('expires_in')||3600)});history.replaceState(null,'',location.pathname+location.search);}else if(hash.has('error_description')){authFeedback('Sign-in link failed: '+hash.get('error_description'));history.replaceState(null,'',location.pathname);}
 for(const p of [{id:'all',name:'Everyone',symbol:'🎁'},...data.people]){const b=node('button',p.symbol+' '+p.name);b.setAttribute('aria-pressed',p.id===person);b.onclick=()=>{person=p.id;$('#people').querySelectorAll('button').forEach(n=>n.setAttribute('aria-pressed',n===b));render();};$('#people').append(b);}
 $('#filter').onchange=render;$('#demo').onclick=async()=>{try{if(!data.examples){const r=await fetch('data/examples.json');if(!r.ok)throw Error('Demo unavailable');data.examples=await r.json();}demo=!demo;$('#filter').value='all';$('#demo').textContent=demo?'Back to real wishlist':'Explore demo gifts';if(demo){notice('DEMO PREVIEW · Example gifts only. Selections stay in this tab and are not shared.');render();}else await refresh();}catch(e){notice(e.message);}};

 $('#login').onsubmit=async e=>{
 e.preventDefault();
 if(!connected()){authFeedback('Sign-in is unavailable because the connection settings have not loaded. Refresh and try again.');return;}
 const button=e.target.querySelector('button');button.disabled=true;button.textContent='Sending…';authFeedback('Sending your sign-in link…',false);
 try {
 await request('/auth/v1/otp?redirect_to='+encodeURIComponent(location.origin+location.pathname),{email:$('#email').value.trim()},false);
 authFeedback('Email sent. Check your inbox for the sign-in link.',false);
 }catch(error){authFeedback('Could not send the sign-in link: '+error.message);}
 finally{button.disabled=false;button.textContent='Send sign-in link';}
 };

 if(session){try{const user=await request('/auth/v1/user',undefined,true,'GET');saveSession({...session,user:{email:user.email}});}catch(e){authFeedback('Could not confirm your account: '+e.message);}}
 $('#logout').onclick=async()=>{try{if(session)await request('/auth/v1/logout',{});}catch{}saveSession(null);await refresh();};await refresh();setInterval(()=>{if(!document.hidden&&!busy)refresh();},20000);
 }catch(e){notice('The wishlist could not load. Please refresh in a moment.');authFeedback('Sign-in could not initialize: '+e.message);}}
start();
