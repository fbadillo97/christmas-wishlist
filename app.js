const $ = s => document.querySelector(s);
const authFeedback=(text,isError=true)=>window.wishlistAuthFeedback?.(text,isError);
const node = (tag, text, cls) => { const n=document.createElement(tag); if(text)n.textContent=text;if(cls)n.className=cls;return n; };
const safeURL = value => {try{const u=new URL(value);return u.protocol==='https:'?u.href:null;}catch{return null;}};
let data={people:[],gifts:[]},config,person='all',busy=false,statuses=[],session=null,authorized=false,generation=0,refreshing=false,tokenRefreshPromise=null;
let view='all',mySelections={gifts:[],units:[]};const actionMessages=new Map();
let familyPhotoURL=null,photoLoading=false,photoVersion=0,photoRetryAt=0;

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
function confirmAction(text,isError=false){const toast=$('#action-toast');toast.hidden=false;toast.classList.toggle('error',isError);$('#action-toast-text').textContent=text;}
function lockWishlist(cancelPasskeys=true){clearFamilyPhoto();if(cancelPasskeys)window.wishlistPasskeys?.clear();window.wishlistEditor?.clear();authorized=false;data={people:[],gifts:[]};statuses=[];person='all';view='all';mySelections={gifts:[],units:[]};actionMessages.clear();$('#action-toast').hidden=true;$('#action-toast-text').textContent='';}

function clearFamilyPhoto(){
 photoVersion++;photoLoading=false;photoRetryAt=0;
 if(familyPhotoURL)URL.revokeObjectURL(familyPhotoURL);
 familyPhotoURL=null;$('#family-photo').removeAttribute('src');$('#family-photo-section').hidden=true;
}
async function loadFamilyPhoto(){
 if(!authorized||!session||familyPhotoURL||photoLoading||Date.now()<photoRetryAt)return;
 const version=generation,operation=++photoVersion;photoLoading=true;
 try{
  const photo=await request('/rest/v1/rpc/get_family_photo',{});
  if(operation!==photoVersion||version!==generation||!authorized||!session)return;
  if(!photo){photoRetryAt=Date.now()+60000;return;}
  if(photo.content_type!=='image/jpeg'||typeof photo.base64!=='string'||photo.base64.length>350000)throw Error('Invalid family photo');
  const bytes=Uint8Array.from(atob(photo.base64),c=>c.charCodeAt(0));
  familyPhotoURL=URL.createObjectURL(new Blob([bytes],{type:'image/jpeg'}));
  $('#family-photo').src=familyPhotoURL;$('#family-photo-section').hidden=false;
 }catch{if(operation===photoVersion)photoRetryAt=Date.now()+60000;}
 finally{if(operation===photoVersion)photoLoading=false;}
}

async function refresh(){
 if(refreshing)return;
 if(!connected()||!session){lockWishlist();notice('Sign in to view our family wishlists. Access is limited to approved family email addresses.');render();return;}
 const version=generation;refreshing=true;statuses=[];render();
 try{
  const nextData=await request('/rest/v1/rpc/get_wishlist',{});
  const nextStatuses=await request('/rest/v1/rpc/list_gift_units',{});
  const nextSelections=await request('/rest/v1/rpc/get_my_selections',{});
  if(version!==generation||!session)return;
  data=nextData;statuses=nextStatuses;mySelections=nextSelections;authorized=true;loadFamilyPhoto();
  if(person!=='all'&&!data.people.some(p=>p.id===person))person='all';
  notice('Family wishlists · Reserve a gift before shopping to avoid duplicates.');
 }catch(error){if(version===generation){lockWishlist();notice('Unable to open the private wishlists: '+error.message);}}
 finally{refreshing=false;if(version===generation)render();}
}
function render(){
 window.wishlistPasskeys?.sync(authorized);
 window.wishlistEditor?.sync(data,authorized);
 $('#logout').hidden=!session;$('#signin').hidden=!!session;$('#account-email').hidden=!session;
 $('#account-email').textContent=session?.user?.email||(session?'Account unavailable':'');$('#login').hidden=!!session;
 $('#wishlist').hidden=!authorized;$('#welcome').hidden=authorized;$('#gifts').replaceChildren();$('#people').replaceChildren();
 if(!authorized)return;
 for(const p of [{id:'all',name:'Everyone',symbol:'🎁'},...data.people]){
  const button=node('button',p.symbol+' '+p.name);button.setAttribute('aria-pressed',p.id===person);
  button.onclick=()=>{person=p.id;render();};$('#people').append(button);
 }
 $('#filter').disabled=!authorized;
 $('#view-all').setAttribute('aria-pressed',view==='all');$('#view-mine').setAttribute('aria-pressed',view==='mine');$('#view-mine').textContent='My selections ('+mySelections.units.length+')';
 $('#list-title').textContent=view==='mine'?'My selections':(person==='all'?'Everyone':data.people.find(p=>p.id===person).name)+'’s wishlist';
 const filter=$('#filter').value;
 const source=view==='mine'?mySelections.gifts:data.gifts,viewUnits=view==='mine'?mySelections.units:statuses;
 const gifts=source.filter(g=>person==='all'||g.person===person).filter(g=>filter==='all'||viewUnits.some(s=>s.gift_id===g.id&&s.status===filter));
 if(!gifts.length){
  const empty=node('div',null,'empty');
  empty.append(node('div','✧'),node('h3',view==='mine'?'No selections in this view':data.gifts.length?'No gifts in this view':'Good things are on their way.'),node('p',view==='mine'?'Your reserved and purchased gifts appear here. Try Everyone’s wishlist to choose a gift, or change the filters.':data.gifts.length?'Try another person or availability filter.':'We’re gathering gift ideas. Check back soon.'),node('p','No gifts are expected. Your company is the best present.'));
  $('#gifts').append(empty);return;
 }
 for(const g of gifts){
  const quantity=g.quantity||1,units=viewUnits.filter(s=>s.gift_id===g.id);
  const card=node('article',null,'card'),art=node('div',null,'art');
  if(safeURL(g.image)){
   const img=node('img');img.src=safeURL(g.image);img.alt=g.title;img.loading='lazy';img.referrerPolicy='no-referrer';
   img.addEventListener('error',()=>art.replaceChildren(node('span',g.symbol||'🎁')));art.append(img);
  }else art.textContent=g.symbol||'🎁';
  const content=node('div',null,'content');
  content.append(node('span',data.people.find(p=>p.id===g.person)?.name||'Family','tag'),node('h3',g.title));
  const pills=node('div',null,'pills');
  pills.append(node('span',g.kind==='idea'?'General idea':'Specific product'));
  if(g.match==='exact'||g.match==='similar')pills.append(node('span',g.match==='exact'?'Exact item please':'Similar is lovely'));
  if(typeof g.used==='boolean')pills.append(node('span',g.used?'Gently used welcome':'New please'));
  if(g.archived)pills.append(node('span','Archived · undo available'));content.append(pills);
  if(g.notes){content.append(node('b','Notes','notes-label'),node('p',g.notes,'gift-notes'));}
  if(safeURL(g.url)){
   const link=node('a','View gift ↗','product');link.href=safeURL(g.url);link.target='_blank';link.rel='noopener noreferrer';content.append(link);
  }
  const counts={available:0,reserved:0,purchased:0};units.forEach(u=>{if(u.status in counts)counts[u.status]++;});
  content.append(node('p',view==='mine'?units.length+' selected by you · '+counts.reserved+' reserved · '+counts.purchased+' purchased':units.length===quantity?quantity+' wanted · '+counts.available+' available'+(counts.reserved?' · '+counts.reserved+' reserved':'')+(counts.purchased?' · '+counts.purchased+' purchased':''):quantity+' wanted · Checking availability…','quantity-summary'));
  const selections=node('div',null,'unit-list');
  for(let number=1;number<=quantity;number++){
   const state=units.find(u=>u.unit_no===number);if(view==='mine'&&!state)continue;const row=node('div',null,'unit-row');
   const status=state?(state.status[0].toUpperCase()+state.status.slice(1))+(state.mine?' by you':''):'Availability unavailable';
   row.append(node('b',(quantity>1?'Item '+number+' · ':'')+status));
   const actions=node('div',null,'actions');
   const choices=!state||state.status==='available'?[['Reserve','reserved'],['Mark purchased','purchased']]:state.mine?[...(state.status==='reserved'&&!g.archived?[['Mark purchased','purchased']]:[]),['Undo my selection','available']]:[];
   for(const [label,value] of choices){
    const button=node('button',label);button.disabled=busy||refreshing||!state||!session;
    button.setAttribute('aria-label',label+' · '+g.title+(quantity>1?' · item '+number:''));
    button.addEventListener('click',()=>change(g.id,number,value));actions.append(button);
   }
   row.append(actions);const feedback=actionMessages.get(g.id+':'+number);if(feedback){const message=node('p',feedback.text,'action-feedback'+(feedback.error?' error':''));message.setAttribute('role','status');row.append(message);}selections.append(row);
  }
  content.append(selections);if(!g.archived&&['editor','owner'].includes(data.account?.role)){const edit=node('button','Edit gift','edit-gift');edit.type='button';edit.onclick=()=>window.wishlistEditor.openGift(g.id);content.append(edit);}card.append(art,content);$('#gifts').append(card);
 }
}
async function change(id,unitNo,status){
 if(!authorized||busy||refreshing)return;
 const version=generation,key=id+':'+unitNo;busy=true;actionMessages.set(key,{text:'Saving…'});render();
 try{
  await request('/rest/v1/rpc/set_gift_unit_status',{p_gift_id:id,p_unit_no:unitNo,p_status:status});
  if(version!==generation)return;
  await refresh();
  if(version===generation&&authorized){const text=status==='reserved'?'Reserved for you.':status==='purchased'?'Marked as purchased.':'Your selection was undone.';actionMessages.set(key,{text});confirmAction(text);}
 }catch(error){if(version===generation){await refresh();if(authorized){const text='Selection not saved: '+error.message;actionMessages.set(key,{text,error:true});confirmAction(text,true);}}}
 finally{busy=false;if(version===generation)render();}
}
async function acceptPasskeySession(result){
 const value=result?.session||result;
 if(typeof value?.access_token!=='string'||typeof value?.refresh_token!=='string')throw Error('The passkey service did not return a complete sign-in session.');
 generation++;const version=generation;lockWishlist(false);
 saveSession({...value,expires_at:Number(value.expires_at)||(Date.now()/1000+Number(value.expires_in||3600))});render();
 try{
  const user=await request('/auth/v1/user',undefined,true,'GET');
  if(version!==generation||!session)return false;
  saveSession({...session,user:{email:user.email}});
  await refresh();return authorized&&version===generation;
 }catch(error){
  if(version===generation){saveSession(null);lockWishlist();render();}
  throw error;
 }
}
async function signOut(){
 const token=session?.access_token;generation++;saveSession(null);lockWishlist();authFeedback('',false);
 notice('You’re signed out. Sign in to view our family wishlists.');render();
 if(token&&connected()){try{await fetch(config.supabaseUrl+'/auth/v1/logout',{method:'POST',headers:{apikey:config.publishableKey,Authorization:'Bearer '+token}});}catch{authFeedback('Signed out on this device. The server could not be reached to revoke the session.');}}
}
async function start(){try{
 window.wishlistPasskeys?.init({request,acceptSession:acceptPasskeySession,notify:confirmAction,ready:connected,getGeneration:()=>generation});
 window.wishlistEditor?.init({request,refresh,notify:confirmAction,safeURL,getData:()=>data,getPerson:()=>person,getGeneration:()=>generation});
 $('#family-photo').onerror=()=>{clearFamilyPhoto();photoRetryAt=Date.now()+60000;};$('#logout').onclick=signOut;$('#dismiss-toast').onclick=()=>{$('#action-toast').hidden=true;};for(const name of ['all','mine'])$('#view-'+name).onclick=()=>{view=name;$('#filter').value='all';render();};render();
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
