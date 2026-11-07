const $ = s => document.querySelector(s);
const authFeedback=(text,isError=true)=>window.wishlistAuthFeedback?.(text,isError);
const node = (tag, text, cls) => { const n=document.createElement(tag); if(text)n.textContent=text;if(cls)n.className=cls;return n; };
const safeURL = value => {try{const u=new URL(value);return u.protocol==='https:'?u.href:null;}catch{return null;}};
let data={people:[],gifts:[]},config,person='all',busy=false,statuses=[],session=null,authorized=false,generation=0,refreshing=false,tokenRefreshPromise=null;

try{session=JSON.parse(localStorage.getItem('badillo-session'));}catch{}
const connected=()=>Boolean(config?.supabaseUrl&&config?.publishableKey);
function saveSession(s){session=s;try{s?localStorage.setItem('badillo-session',JSON.stringify(s)):localStorage.removeItem('badillo-session');}catch{}}
async function request(path,body,authenticated=true,method='POST'){
 if(authenticated&&!session)throw Error('Please sign in to continue.');
 if(authenticated&&Date.now()/1000>session.expires_at-60){
  if(!tokenRefreshPromise){const original=session;tokenRefreshPromise=request('/auth/v1/token?grant_type=refresh_token',{refresh_token:original.refresh_token},false).then(s=>{if(session!==original)throw Error('Your session changed. Please sign in again.');saveSession({...s,expires_at:Date.now()/1000+s.expires_in});}).finally(()=>{tokenRefreshPromise=null;});}
  await tokenRefreshPromise;
 }

 const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),15000);let response;try{response=await fetch(config.supabaseUrl+path,{method,cache:'no-store',headers:{'Content-Type':'application/json',apikey:config.publishableKey,...(authenticated&&session?{Authorization:'Bearer '+session.access_token}:{})},...(method==='GET'?{}:{body:JSON.stringify(body)}),signal:controller.signal});}catch(e){throw Error(e.name==='AbortError'?'The request timed out. Check your connection and try again.':'Could not reach sign-in. Check your connection or browser blocking settings.');}finally{clearTimeout(timer);}
 const result=await response.json().catch(()=>null);if(!response.ok)throw Error((result?.message||result?.msg||result?.error_description||'The request was rejected.')+' (HTTP '+response.status+(result?.error_code?', '+result.error_code:'')+')');return result;
}
function notice(text){$('#connection').textContent=text;}
function lockWishlist(){authorized=false;data={people:[],gifts:[]};statuses=[];person='all';}
async function refresh(){
 if(refreshing)return;
 if(!connected()||!session){lockWishlist();notice('Sign in to view our family wishlists. Access is limited to approved family email addresses.');render();return;}
 const version=generation;refreshing=true;statuses=[];render();
 try{
  const nextData=await request('/rest/v1/rpc/get_wishlist',{});
  const nextStatuses=await request('/rest/v1/rpc/list_gift_statuses',{});
  if(version!==generation||!session)return;
  data=nextData;statuses=nextStatuses;authorized=true;
  if(person!=='all'&&!data.people.some(p=>p.id===person))person='all';
  notice('Family wishlists · Reserve a gift before shopping to avoid duplicates.');
 }catch(error){if(version===generation){lockWishlist();notice('Unable to open the private wishlists: '+error.message);}}
 finally{refreshing=false;if(version===generation)render();}
}
function render(){ $('#logout').hidden=!session;$('#signin').hidden=!!session;$('#account-email').hidden=!session;$('#account-email').textContent=session?.user?.email|| (session?'Account unavailable':'');$('#login').hidden=!!session;$('#wishlist').hidden=!authorized;$('#welcome').hidden=authorized;$('#gifts').replaceChildren();$('#people').replaceChildren();if(!authorized)return;
 for(const p of [{id:'all',name:'Everyone',symbol:'🎁'},...data.people]){const b=node('button',p.symbol+' '+p.name);b.setAttribute('aria-pressed',p.id===person);b.onclick=()=>{person=p.id;render();};$('#people').append(b);}
 $('#filter').disabled=!authorized;const gifts=data.gifts;
 $('#list-title').textContent=(person==='all'?'Everyone':data.people.find(p=>p.id===person).name)+'’s wishlist';
 const root=$('#gifts');root.replaceChildren();const list=gifts.filter(g=>person==='all'||g.person===person).filter(g=>{const s=statuses.find(s=>s.gift_id===g.id)?.status;return $('#filter').value==='all'||(s||'available')===$('#filter').value;});
 if(!list.length){const e=node('div',null,'empty');e.append(node('div','✧'),node('h3',gifts.length?'No gifts in this view':'Good things are on their way.'),node('p',gifts.length?'Try another person or availability filter.':'We’re gathering gift ideas. Check back soon.'),node('p','No gifts are expected. Your company is the best present.'));root.append(e);return;}
 for(const g of list){const state=statuses.find(s=>s.gift_id===g.id);const card=node('article',null,'card'),art=node('div',null,'art');if(safeURL(g.image)){const img=node('img');img.src=safeURL(g.image);img.alt=g.title;img.loading='lazy';img.referrerPolicy='no-referrer';img.addEventListener('error',()=>art.replaceChildren(node('span',g.symbol||'🎁')));art.append(img);}else art.textContent=g.symbol||'🎁';
 const c=node('div',null,'content');c.append(node('span',data.people.find(p=>p.id===g.person)?.name||'Family','tag'),node('h3',g.title));const pills=node('div',null,'pills');if(g.match==='exact'||g.match==='similar')pills.append(node('span',g.match==='exact'?'Exact item please':'Similar is lovely'));if(typeof g.used==='boolean')pills.append(node('span',g.used?'Gently used welcome':'New please'));c.append(pills,node('p',g.notes));if(safeURL(g.url)){const a=node('a','View gift ↗','product');a.href=safeURL(g.url);a.target='_blank';a.rel='noopener noreferrer';c.append(a);}
 c.append(node('b',!state?'Availability unavailable':state.status));
 const actions=node('div',null,'actions');const enabled=authorized&&session&&!refreshing&&Boolean(state);for(const [label,value] of ((!state?.status||state.status==='available')?[['Reserve','reserved'],['Purchased','purchased']]:state.mine?[...(state.status==='reserved'?[['Mark purchased','purchased']]:[]),['Undo my selection','available']]:[])){const b=node('button',label);b.disabled=busy||!enabled;b.addEventListener('click',()=>change(g.id,value));actions.append(b);}c.append(actions);card.append(art,c);root.append(card);}}
async function change(id,status){
 if(!authorized||busy||refreshing)return;
 const version=generation;busy=true;render();
 try{await request('/rest/v1/rpc/set_gift_status',{p_gift_id:id,p_status:status});if(version===generation)await refresh();}
 catch(error){if(version===generation){await refresh();notice('Selection not saved: '+error.message);}}
 finally{busy=false;if(version===generation)render();}
}
async function signOut(){
 const token=session?.access_token;generation++;saveSession(null);lockWishlist();authFeedback('',false);
 notice('You’re signed out. Sign in to view our family wishlists.');render();
 if(token&&connected()){try{await fetch(config.supabaseUrl+'/auth/v1/logout',{method:'POST',headers:{apikey:config.publishableKey,Authorization:'Bearer '+token}});}catch{authFeedback('Signed out on this device. The server could not be reached to revoke the session.');}}
}
async function start(){try{
 $('#logout').onclick=signOut;render();
 const result=await fetch('config.json',{cache:'no-store'});if(!result.ok)throw Error('Unable to load connection settings');config=await result.json();
 if(config.supabaseUrl&&!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(config.supabaseUrl))throw Error('Invalid backend URL');
 const hash=new URLSearchParams(location.hash.slice(1));if(hash.has('access_token')){saveSession({access_token:hash.get('access_token'),refresh_token:hash.get('refresh_token'),expires_at:Date.now()/1000+Number(hash.get('expires_in')||3600)});history.replaceState(null,'',location.pathname+location.search);}else if(hash.has('error_description')){authFeedback('Sign-in link failed: '+hash.get('error_description'));history.replaceState(null,'',location.pathname);}
 $('#filter').onchange=render;
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

 if(session){const version=generation;try{const user=await request('/auth/v1/user',undefined,true,'GET');if(version===generation&&session)saveSession({...session,user:{email:user.email}});}catch(error){if(version===generation){saveSession(null);lockWishlist();authFeedback('Your sign-in could not be confirmed: '+error.message);}}}
 await refresh();setInterval(()=>{if(!document.hidden&&!busy&&session)refresh();},20000);

 }catch(e){notice('The wishlist could not load. Please refresh in a moment.');authFeedback('Sign-in could not initialize: '+e.message);}}
start();
