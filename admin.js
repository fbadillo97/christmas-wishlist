(() => {
 const $=s=>document.querySelector(s),make=(tag,text,cls)=>{const el=document.createElement(tag);if(text)el.textContent=text;if(cls)el.className=cls;return el;};
 let api,role=null,members=[],editing=null,busy=false,signature='',dirty=false;
 const allowed=()=>['owner','editor'].includes(role);
 const message=(text,error=false)=>{const el=$('#admin-message');el.textContent=text;el.classList.toggle('error',error);};
 function reset(){editing=null;dirty=false;$('#member-form').reset();$('#member-email').readOnly=false;$('#member-form-title').textContent='Add account';$('#cancel-member').hidden=true;$('#member-active').checked=true;$('#member-role').value='viewer';$('#member-role').disabled=role!=='owner';$('#member-active').disabled=false;$('#owner-option').hidden=true;}
 function clear(){role=null;members=[];signature='';busy=false;reset();for(const id of ['member-name','member-email','save-member','cancel-member','refresh-members'])$('#'+id).disabled=false;$('#member-list').replaceChildren();$('#member-search').value='';$('#administration').hidden=true;message('');}
 function sync(data,authorized){
  const nextRole=authorized?data.account?.role:null;
  if(!['owner','editor'].includes(nextRole)){clear();return;}
  const changed=role!==nextRole;role=nextRole;members=data.members||[];$('#administration').hidden=false;
  if(changed){reset();signature='';}
  const next=JSON.stringify(members);if(signature!==next){signature=next;render();}
 }
 function edit(member){
  if(busy)return;if(dirty&&!window.confirm('Discard your unsaved account changes?'))return;
  editing={...member};dirty=false;$('#member-form-title').textContent='Edit account';$('#member-name').value=member.first_name||'';$('#member-email').value=member.email;$('#member-email').readOnly=true;
  $('#owner-option').hidden=member.role!=='owner';$('#member-role').value=member.role;$('#member-role').disabled=role!=='owner'||member.role==='owner';$('#member-active').checked=member.active;$('#member-active').disabled=member.role==='owner';$('#cancel-member').hidden=false;message('');$('#member-name').focus();
 }
 function render(){
  const list=$('#member-list');list.replaceChildren();const query=$('#member-search').value.trim().toLowerCase();
  for(const member of members.filter(m=>(m.email+' '+(m.first_name||'')).toLowerCase().includes(query))){
   const row=make('article',null,'admin-member'),info=make('div');info.append(make('h3',member.first_name||'Name not set'),make('p',member.email,'member-email'),make('p',(member.role==='owner'?'Owner':member.role==='editor'?'Editor':'Viewer')+' · '+(member.active?'Access allowed':'Access removed')));
   const states={not_sent:'No invitation recorded',sending:'Sending…',sent:'Email accepted by email service',failed:'Last send failed',unknown:'Delivery uncertain — check before resending'};
   info.append(make('p',states[member.invitation_status]||states.not_sent));if(member.invitation_sent_at)info.append(make('p','Last sent '+new Date(member.invitation_sent_at).toLocaleString()));
   const controls=make('div',null,'management-controls');const editable=role==='owner'||member.role==='viewer';
   if(editable){const button=make('button','Edit account');button.type='button';button.disabled=busy;button.onclick=()=>edit(member);controls.append(button);}
   if(editable&&member.role!=='owner'&&member.active){const invite=make('button',member.invitation_attempted_at?'Resend invitation':'Send invitation');invite.type='button';invite.disabled=busy;invite.onclick=()=>send(member);controls.append(invite);}
   row.append(info,controls);list.append(row);
  }
  if(!list.children.length)list.append(make('p','No accounts match your search.'));
 }
 function pending(value){busy=value;for(const id of ['member-name','member-email','save-member','cancel-member','refresh-members'])$('#'+id).disabled=value;$('#member-role').disabled=value||role!=='owner'||editing?.role==='owner';$('#member-active').disabled=value||editing?.role==='owner';render();}
 async function reload(){await api.refresh();}
 async function save(event){
  event.preventDefault();if(!allowed()||busy)return;const version=api.getGeneration();
  const payload={p_email:$('#member-email').value.trim(),p_first_name:$('#member-name').value.trim(),p_role:$('#member-role').value,p_active:$('#member-active').checked,p_revision:editing?.revision??null};
  if(editing?.active&&!payload.p_active&&!window.confirm('Remove wishlist access for '+editing.email+'? Existing selections will be preserved.'))return;
  pending(true);message('Saving account…');
  try{await api.request('/rest/v1/rpc/admin_save_member',payload);if(version!==api.getGeneration()||!allowed())return;reset();await reload();if(version===api.getGeneration()&&allowed())message('Account saved. No email was sent.');}
  catch(error){if(version===api.getGeneration()&&allowed())message(error.message,true);}
  finally{if(version===api.getGeneration()&&allowed())pending(false);}
 }
 async function send(member){
  if(!allowed()||busy)return;if(dirty){message('Save or cancel your account changes before sending an invitation.',true);return;}
  if(!window.confirm('Send a wishlist welcome/sign-in email to '+member.email+' now?'))return;
  const version=api.getGeneration();pending(true);message('Sending invitation…');
  try{const result=await api.request('/functions/v1/wishlist-invite',{email:member.email,revision:member.revision});if(version!==api.getGeneration()||!allowed())return;await reload();if(version===api.getGeneration()&&allowed())message(result.message);}
  catch(error){if(version===api.getGeneration()&&allowed()){await reload();if(version===api.getGeneration()&&allowed())message(error.message,true);}}
  finally{if(version===api.getGeneration()&&allowed())pending(false);}
 }
 function init(bridge){api=bridge;$('#member-form').onsubmit=save;$('#member-form').oninput=()=>{dirty=true;};$('#member-form').onchange=()=>{dirty=true;};$('#cancel-member').onclick=()=>{if(!busy){reset();message('');}};$('#member-search').oninput=render;$('#refresh-members').onclick=reload;window.addEventListener('beforeunload',event=>{if(dirty){event.preventDefault();event.returnValue='';}});}
 window.wishlistAdmin={init,sync,clear};
})();
