(() => {
 const $=s=>document.querySelector(s),make=(tag,text,cls)=>{const el=document.createElement(tag);if(text)el.textContent=text;if(cls)el.className=cls;return el;};
 let api,role=null,members=[],editing=null,busy=false,signature='',dirty=false,tracking=[],trackingSignature='',activeSection=location.hash==='#gift-tracking'?'tracking':'accounts';
 const allowed=()=>['owner','editor'].includes(role);
 const message=(text,error=false)=>{const el=$('#admin-message');el.textContent=text;el.classList.toggle('error',error);};
 function reset(){$('#account-editor').open=false;editing=null;dirty=false;$('#member-form').reset();$('#member-id').textContent='Assigned when saved';$('#member-email').readOnly=false;$('#member-form-title').textContent='Add account';$('#cancel-member').hidden=true;$('#member-active').checked=true;$('#member-role').value='viewer';$('#member-role').disabled=role!=='owner';$('#member-active').disabled=false;$('#owner-option').hidden=true;}
 function clear(){clearTracking();window.wishlistRoadmap?.clear();$('#roadmap-link').hidden=true;role=null;members=[];signature='';busy=false;reset();for(const id of ['member-name','member-last-name','member-email','save-member','cancel-member','refresh-members'])$('#'+id).disabled=false;$('#member-list').replaceChildren();$('#member-count').textContent='';$('#member-search').value='';$('#administration').hidden=true;message('');}
 function sync(data,authorized){
  const nextRole=authorized?data.account?.role:null;
  if(!['owner','editor'].includes(nextRole)){clear();return;}
  const changed=role!==nextRole;role=nextRole;members=data.members||[];$('#administration').hidden=false;
  if(changed){reset();signature='';}
  syncTracking(data);syncRoadmap(data);
  const next=JSON.stringify(members);if(signature!==next){signature=next;render();}
 }

 function showSection(section){
  activeSection=section==='tracking'&&role==='owner'?'tracking':section==='roadmap'&&role==='owner'?'roadmap':'accounts';
  $('#accounts').hidden=activeSection!=='accounts';$('#gift-tracking').hidden=activeSection!=='tracking'||role!=='owner';$('#platform-roadmap').hidden=activeSection!=='roadmap'||role!=='owner';
  $('#accounts-link').setAttribute('aria-pressed',activeSection==='accounts');$('#tracking-link').setAttribute('aria-pressed',activeSection==='tracking');$('#roadmap-link').setAttribute('aria-pressed',activeSection==='roadmap');
 }
 function clearTracking(){
  tracking=[];trackingSignature='';$('#gift-tracking').hidden=true;$('#tracking-link').hidden=false;$('#tracking-link').disabled=true;$('#tracking-link').title='Reservation tracking is available to the owner account.';showSection('accounts');
  $('#tracking-rows').replaceChildren();$('#tracking-summary').textContent='';
  $('#tracking-status').value='all';
  for(const id of ['tracking-recipient','tracking-person']){$('#'+id).replaceChildren();const option=make('option','All');option.value='all';$('#'+id).append(option);}
 }
 function updateChoices(id,choices,label){
  const select=$('#'+id),previous=select.value;select.replaceChildren();
  const all=make('option',label);all.value='all';select.append(all);
  for(const [key,name] of choices){const option=make('option',name);option.value=key;select.append(option);}
  select.value=choices.has(previous)?previous:'all';
 }
 function syncTracking(data){
  if(role!=='owner'){clearTracking();return;}
  $('#tracking-link').hidden=false;$('#tracking-link').disabled=false;$('#tracking-link').title='View reservations and purchases';showSection(activeSection);tracking=data.gift_tracking||[];
  const next=JSON.stringify(tracking);if(next===trackingSignature)return;trackingSignature=next;
  const recipients=new Map(),people=new Map();
  for(const row of tracking){recipients.set(row.recipient_id||'',row.recipient);people.set(row.selected_by_email||'',row.selected_by_name?row.selected_by_name+' · '+(row.selected_by_email||'Account unavailable'):row.selected_by_email||'Account unavailable');}
  updateChoices('tracking-recipient',recipients,'All recipients');updateChoices('tracking-person',people,'All people');renderTracking();
 }
 function syncRoadmap(data){
  $('#roadmap-link').hidden=role!=='owner';
  window.wishlistRoadmap?.sync(role==='owner'?(data.platform_roadmap||[]):[],role==='owner');
  if(role!=='owner'&&activeSection==='roadmap')showSection('accounts');
 }
 function renderTracking(){
  const body=$('#tracking-rows');body.replaceChildren();if(role!=='owner')return;
  const status=$('#tracking-status').value,recipient=$('#tracking-recipient').value,person=$('#tracking-person').value;
  const rows=tracking.filter(r=>(status==='all'||r.status===status)&&(recipient==='all'||(r.recipient_id||'')===recipient)&&(person==='all'||(r.selected_by_email||'')===person));
  const reserved=rows.filter(r=>r.status==='reserved').length;
  $('#tracking-summary').textContent=rows.length+' selected item'+(rows.length===1?'':'s')+' · '+reserved+' reserved · '+(rows.length-reserved)+' purchased';
  for(const row of rows){
   const tr=make('tr');
   const title=make('td',row.title||'Untitled gift');if(row.archived)title.append(make('span','Archived','tracking-archived'));
   const who=make('td',row.selected_by_name||row.selected_by_email||'Account unavailable');
   if(row.selected_by_name&&row.selected_by_email)who.append(make('small',row.selected_by_email));
   const when=make('td');
   if(row.updated_at){const time=make('time',new Date(row.updated_at).toLocaleString());time.dateTime=row.updated_at;when.append(time);}else when.textContent='Not recorded';
   tr.append(title,make('td',row.recipient),make('td',row.reservation_mode==='open-ended'?'—':String(row.unit_no)),make('td',row.status==='reserved'?(row.reservation_mode==='open-ended'?"Getting something":'Reserved'):'Purchased'),who,when);body.append(tr);
  }
  if(!rows.length){const tr=make('tr'),td=make('td',tracking.length?'No selections match these filters.':'No reserved or purchased gifts yet.');td.colSpan=6;tr.append(td);body.append(tr);}
 }

 function edit(member){
  if(busy)return;if(dirty&&!window.confirm('Discard your unsaved account changes?'))return;
  $('#account-editor').open=true;editing={...member};dirty=false;$('#member-form-title').textContent='Edit account';$('#member-name').value=member.first_name||'';$('#member-last-name').value=member.last_name||'';$('#member-id').textContent=member.account_id||'Assigned when saved';$('#member-email').value=member.email;$('#member-email').readOnly=true;
  $('#owner-option').hidden=member.role!=='owner';$('#member-role').value=member.role;$('#member-role').disabled=role!=='owner'||member.role==='owner';$('#member-active').checked=member.active;$('#member-active').disabled=member.role==='owner';$('#cancel-member').hidden=false;message('');$('#member-name').focus();
 }
 function render(){
  const list=$('#member-list');list.replaceChildren();const query=$('#member-search').value.trim().toLowerCase();
  const filtered=members.filter(m=>(m.email+' '+(m.first_name||'')+' '+(m.last_name||'')+' '+(m.account_id||'')).toLowerCase().includes(query));
  $('#member-count').textContent=filtered.length+' / '+members.length+' accounts';
  const states={not_sent:['Not sent','No welcome email recorded'],sending:['Sending…','Send in progress'],sent:['Sent','Accepted by the email service; inbox delivery is not confirmed'],failed:['Failed','Last send failed'],unknown:['Uncertain','Check with the recipient before resending']};
  for(const member of filtered){
   const row=make('tr'),name=make('td',member.first_name||'—'),lastName=make('td',member.last_name||'—'),email=make('td',member.email,'account-email-cell');
   const status=states[member.invitation_status]||states.not_sent,invitation=make('td'),badge=make('span',status[0],'admin-status status-'+(member.invitation_status||'not_sent'));badge.title=status[1];invitation.append(badge);
   const access=make('td'),accessBadge=make('span',member.active?'Active':'Removed','admin-status '+(member.active?'access-active':'access-removed'));access.append(accessBadge);
   const when=make('td','—','account-date-cell');if(member.invitation_sent_at){const date=new Date(member.invitation_sent_at);when.textContent=date.toLocaleDateString(undefined,{month:'short',day:'numeric'})+' '+date.toLocaleTimeString(undefined,{hour:'2-digit',minute:'2-digit'});when.title=date.toLocaleString();}
   const actions=make('td'),controls=make('div',null,'account-row-actions'),editable=role==='owner'||member.role==='viewer';
   if(editable){const button=make('button','Edit');button.type='button';button.disabled=busy;button.setAttribute('aria-label','Edit account '+member.email);button.onclick=()=>edit(member);controls.append(button);}
   if(editable&&member.role!=='owner'&&member.active){const invite=make('button',member.invitation_attempted_at?'Resend welcome':'Send welcome');invite.type='button';invite.disabled=busy;invite.setAttribute('aria-label',invite.textContent+' email to '+member.email);invite.onclick=()=>send(member);controls.append(invite);}
   actions.append(controls);const idCell=make('td'),id=make('button',member.account_id?member.account_id.slice(0,8):'—','account-id');id.type='button';id.title=member.account_id||'Not assigned';id.setAttribute('aria-label','Copy account ID for '+member.email);id.disabled=!member.account_id;id.onclick=async()=>{try{await navigator.clipboard.writeText(member.account_id);message('Account ID copied.');}catch{message('Account ID: '+member.account_id);}};idCell.append(id);
   const signed=make('td',member.has_signed_in?'Yes':'Never');if(member.last_sign_in_at){signed.title='Last sign-in: '+new Date(member.last_sign_in_at).toLocaleString();}
   const passkey=make('td',member.has_passkey?'Set up ('+member.passkey_count+')':'Not set up');
   row.append(idCell,name,lastName,email,make('td',member.role==='owner'?'Owner':member.role==='editor'?'Editor':'Viewer'),access,signed,passkey,invitation,when,actions);list.append(row);
  }
  if(!filtered.length){const row=make('tr'),cell=make('td','No accounts match your search.');cell.colSpan=11;row.append(cell);list.append(row);}
 }
 function pending(value){busy=value;for(const id of ['member-name','member-last-name','member-email','save-member','cancel-member','refresh-members'])$('#'+id).disabled=value;$('#member-role').disabled=value||role!=='owner'||editing?.role==='owner';$('#member-active').disabled=value||editing?.role==='owner';render();}
 async function reload(){await api.refresh();}
 async function save(event){
  event.preventDefault();if(!allowed()||busy)return;const version=api.getGeneration();
  const payload={p_email:$('#member-email').value.trim(),p_first_name:$('#member-name').value.trim(),p_last_name:$('#member-last-name').value.trim(),p_role:$('#member-role').value,p_active:$('#member-active').checked,p_revision:editing?.revision??null};
  if(editing?.active&&!payload.p_active&&!window.confirm('Remove wishlist access for '+editing.email+'? Existing selections will be preserved.'))return;
  pending(true);message('Saving account…');
  try{await api.request('/rest/v1/rpc/admin_save_account',payload);if(version!==api.getGeneration()||!allowed())return;reset();await reload();if(version===api.getGeneration()&&allowed())message('Account saved. No email was sent.');}
  catch(error){if(version===api.getGeneration()&&allowed())message(error.message,true);}
  finally{if(version===api.getGeneration()&&allowed())pending(false);}
 }
 async function send(member){
  if(!allowed()||busy)return;if(dirty){message('Save or cancel your account changes before sending a welcome email.',true);return;}
  if(!window.confirm('Send a welcome email with the permanent wishlist link to '+member.email+' now?'))return;
  const version=api.getGeneration();pending(true);message('Sending welcome email…');
  try{const result=await api.request('/functions/v1/wishlist-welcome',{email:member.email,revision:member.revision});if(version!==api.getGeneration()||!allowed())return;await reload();if(version===api.getGeneration()&&allowed())message(result.message);}
  catch(error){if(version===api.getGeneration()&&allowed()){await reload();if(version===api.getGeneration()&&allowed())message(error.message,true);}}
  finally{if(version===api.getGeneration()&&allowed())pending(false);}
 }
 function init(bridge){api=bridge;$('#accounts-link').onclick=()=>showSection('accounts');$('#tracking-link').onclick=()=>showSection('tracking');$('#roadmap-link').onclick=()=>showSection('roadmap');window.wishlistRoadmap?.init({request:api.request,refresh:api.refresh,getGeneration:api.getGeneration,getRole:()=>role});for(const id of ['tracking-status','tracking-recipient','tracking-person'])$('#'+id).onchange=renderTracking;$('#refresh-tracking').onclick=reload;$('#member-form').onsubmit=save;$('#member-form').oninput=()=>{dirty=true;};$('#member-form').onchange=()=>{dirty=true;};$('#cancel-member').onclick=()=>{if(!busy){reset();message('');}};$('#member-search').oninput=render;$('#refresh-members').onclick=reload;window.addEventListener('beforeunload',event=>{if(dirty){event.preventDefault();event.returnValue='';}});}
 window.wishlistAdmin={init,sync,clear};
})();

