(() => {
 const $=s=>document.querySelector(s);
 const make=(tag,text,cls)=>{const el=document.createElement(tag);if(text)el.textContent=text;if(cls)el.className=cls;return el;};
 let api,role=null,editing=null,busy=false,matchTouched=false,archived=[],members=[];
 const canEdit=()=>role==='editor'||role==='owner';
 const open=id=>{const d=$(id);if(!d.open)d.showModal();};
 const close=id=>{const d=$(id);if(d.open)d.close();};
 function message(id,text,error=true){$(id).textContent=text;$(id).classList.toggle('error',error);}
 function fieldError(name,text){const input=$('#gift-'+name);$('#error-'+name).textContent=text;input.setAttribute('aria-invalid',text?'true':'false');input.setAttribute('aria-describedby','error-'+name);}
 function clear(){
  role=null;editing=null;busy=false;archived=[];members=[];giftBusy(false);$('#allow-access').disabled=false;
  for(const id of ['#gift-dialog','#archive-dialog','#access-dialog'])close(id);
  $('#gift-form').reset();$('#access-form').reset();$('#archive-list').replaceChildren();$('#access-list').replaceChildren();$('#gift-person').replaceChildren();
  $('#gift-image-preview').removeAttribute('src');$('#gift-image-preview').hidden=true;
  for(const id of ['#gift-form-message','#archive-message','#access-message','#image-preview-message'])$(id).textContent='';
 }
 function sync(data,authorized){
  role=authorized?data.account?.role:null;
  $('#editor-badge').hidden=!canEdit();$('#family-access').hidden=!canEdit();$('#editor-tools').hidden=!canEdit();
  if(!canEdit())clear();
 }
 function preview(){
  const img=$('#gift-image-preview'),url=api.safeURL($('#gift-image').value.trim());
  img.hidden=true;img.removeAttribute('src');$('#image-preview-message').textContent='';
  if(url){img.src=url;img.hidden=false;}
 }
 function openGift(id=null){
  if(!canEdit())return;
  const data=api.getData();editing=id?data.gifts.find(g=>g.id===id):null;
  if(id&&!editing){api.notify('This gift changed. Refresh and try again.');return;}
  $('#gift-form').reset();$('#archive-confirm').hidden=true;matchTouched=Boolean(editing);
  $('#gift-person').replaceChildren();
  for(const p of data.people){const option=make('option',p.name);option.value=p.id;$('#gift-person').append(option);}
  const g=editing||{person:api.getPerson()==='all'?data.people[0]?.id:api.getPerson(),kind:'product',quantity:1,match:'exact',used:true};
  for(const name of ['person','kind','title','url','image','notes','quantity','match','used']){
   $('#gift-'+name).value=typeof g[name]==='boolean'?String(g[name]):g[name]??'';fieldError(name,'');
  }
  $('#gift-dialog-title').textContent=editing?'Edit gift':'Add gift';$('#archive-gift').hidden=!editing;
  message('#gift-form-message','',false);preview();open('#gift-dialog');$('#gift-title').focus();
 }
 function payload(){
  const p={};for(const name of ['person','kind','title','url','image','notes','quantity','match','used'])p[name]=$('#gift-'+name).value.trim();
  const errors={};
  if(!p.person)errors.person='Choose a recipient.';
  if(!['product','idea'].includes(p.kind))errors.kind='Choose an entry type.';
  if(!p.title||p.title.length>160)errors.title='Enter a title of up to 160 characters.';
  for(const name of ['url','image'])if(p[name]&&(!api.safeURL(p[name])||p[name].length>2048))errors[name]='Enter a valid HTTPS address.';
  if(p.notes.length>4000)errors.notes='Keep notes to 4000 characters.';
  if(!/^\d+$/.test(p.quantity)||Number(p.quantity)<1||Number(p.quantity)>100)errors.quantity='Enter a whole number from 1 to 100.';
  if(!['exact','similar'].includes(p.match))errors.match='Choose a preference.';
  if(!['true','false'].includes(p.used))errors.used='Choose a condition.';
  for(const name of Object.keys(p))fieldError(name,errors[name]||'');
  if(Object.keys(errors).length){$('#gift-'+Object.keys(errors)[0]).focus();return null;}
  p.quantity=Number(p.quantity);p.used=p.used==='true';return p;
 }
 function giftBusy(value){
  busy=value;for(const id of ['#save-gift','#cancel-gift','#close-gift','#archive-gift','#confirm-archive','#cancel-archive'])$(id).disabled=value;
  for(const name of ['person','kind','title','url','image','notes','quantity','match','used'])$('#gift-'+name).disabled=value;$('#quantity-decrease').disabled=value;$('#quantity-increase').disabled=value;
  $('#save-gift').textContent=value?'Saving…':'Save gift';
 }
 async function save(event){
  event.preventDefault();if(!canEdit()||busy)return;
  const data=payload();if(!data){message('#gift-form-message','Please check the highlighted fields.');return;}
  const version=api.getGeneration();giftBusy(true);message('#gift-form-message','Saving…',false);
  try{await api.request('/rest/v1/rpc/editor_save_gift',{p_id:editing?.id||null,p_revision:editing?.revision??null,p_payload:data});
   if(version!==api.getGeneration()||!canEdit())return;close('#gift-dialog');await api.refresh();api.notify('Gift saved.');
  }catch(error){if(version===api.getGeneration())message('#gift-form-message',error.message);}
  finally{if(version===api.getGeneration())giftBusy(false);}
 }
 async function archiveGift(gift,archive){
  if(!canEdit()||busy)return;const version=api.getGeneration();giftBusy(true);
  try{await api.request('/rest/v1/rpc/editor_archive_gift',{p_id:gift.id,p_revision:gift.revision,p_archived:archive});
   if(version!==api.getGeneration()||!canEdit())return;close('#gift-dialog');await api.refresh();
   api.notify(archive?'Gift archived. Existing selections are preserved.':'Gift restored.');
   if($('#archive-dialog').open)await loadArchive();
  }catch(error){if(version===api.getGeneration())message($('#gift-dialog').open?'#gift-form-message':'#archive-message',error.message);}
  finally{if(version===api.getGeneration())giftBusy(false);}
 }
 async function loadArchive(){
  if(!canEdit())return;const version=api.getGeneration();message('#archive-message','Loading…',false);$('#archive-list').replaceChildren();
  try{const result=await api.request('/rest/v1/rpc/editor_list_gifts',{});if(version!==api.getGeneration()||!canEdit())return;
   archived=result.filter(g=>g.archived);message('#archive-message',archived.length?'':'No archived gifts.',false);
   for(const gift of archived){const row=make('div',null,'management-row');row.append(make('span',gift.title));const button=make('button','Restore');
    button.type='button';button.onclick=()=>archiveGift(gift,false);row.append(button);$('#archive-list').append(row);}
  }catch(error){if(version===api.getGeneration())message('#archive-message',error.message);}
 }
 function renderMembers(){
  $('#access-list').replaceChildren();$('#access-role').disabled=role!=='owner';
  if(role!=='owner')$('#access-role').value='viewer';
  for(const member of members){
   const row=make('div',null,'management-row'),info=make('div');
   info.append(make('strong',member.email),make('p',(member.role==='owner'?'Owner · Editor':member.role==='editor'?'Editor':'Viewer')+' · '+(member.active?'Access allowed':'Access removed')));
   const states={not_sent:'No invitation recorded',sending:'Sending…',sent:'Email accepted by email service',failed:'Last send failed',unknown:'Delivery uncertain — check before resending'};
   info.append(make('p',(states[member.invitation_status]||'No invitation recorded')+(member.invitation_sent_at?' · Last sent '+new Date(member.invitation_sent_at).toLocaleString():'')+(member.has_signed_in?' · Has signed in':'')));
   row.append(info);
   const allowed=member.role!=='owner'&&(role==='owner'||member.role==='viewer');
   if(allowed){
    const controls=make('div',null,'management-controls');let select;
    if(role==='owner'){
     select=make('select');select.disabled=busy;select.setAttribute('aria-label','Role for '+member.email);
     for(const r of ['viewer','editor']){const option=make('option',r==='editor'?'Editor':'Viewer');option.value=r;select.append(option);}select.value=member.role;
     const saveRole=make('button','Save role');saveRole.type='button';saveRole.disabled=busy;saveRole.onclick=()=>setMember(member,select.value,member.active);controls.append(select,saveRole);
    }
    const toggle=make('button',member.active?'Remove access':'Restore access');toggle.type='button';toggle.disabled=busy;
    toggle.onclick=()=>{if(member.active&&!window.confirm('Remove wishlist access for '+member.email+'? Existing gift selections will be preserved.'))return;setMember(member,member.role,!member.active);};
    controls.append(toggle);
    if(member.active){const invite=make('button',member.invitation_attempted_at?'Resend welcome email':'Send welcome email');invite.type='button';invite.disabled=busy;invite.onclick=()=>sendInvitation(member);controls.append(invite);}
    row.append(controls);
   }
   $('#access-list').append(row);
  }
 }
 async function loadMembers(){
  if(!canEdit())return;const version=api.getGeneration();message('#access-message','Loading…',false);$('#access-list').replaceChildren();
  try{const result=await api.request('/rest/v1/rpc/editor_list_members',{});if(version!==api.getGeneration()||!canEdit())return;members=result;renderMembers();message('#access-message','',false);}
  catch(error){if(version===api.getGeneration())message('#access-message',error.message);}
 }
 async function sendInvitation(member){
  if(!canEdit()||busy)return;
  if(!window.confirm('Send a welcome email with the permanent wishlist link to '+member.email+' now?'))return;
  const version=api.getGeneration();busy=true;$('#allow-access').disabled=true;renderMembers();message('#access-message','Sending welcome email…',false);
  try{const result=await api.request('/functions/v1/wishlist-welcome',{email:member.email,revision:member.revision});
   if(version!==api.getGeneration()||!canEdit())return;
   await loadMembers();if(version===api.getGeneration()&&canEdit())message('#access-message',result.message,false);
  }catch(error){if(version===api.getGeneration()&&canEdit()){await loadMembers();if(version===api.getGeneration()&&canEdit())message('#access-message',error.message);}}
  finally{if(version===api.getGeneration()&&canEdit()){busy=false;$('#allow-access').disabled=false;renderMembers();}}
 }
 async function setMember(member,nextRole,active){
  if(!canEdit()||busy)return;const version=api.getGeneration();busy=true;$('#allow-access').disabled=true;renderMembers();
  message('#access-message','Saving…',false);
  try{await api.request('/rest/v1/rpc/editor_set_member',{p_email:member.email,p_role:nextRole,p_active:active,p_revision:member.revision??null});
   if(version!==api.getGeneration()||!canEdit())return;$('#access-email').value='';await loadMembers();if(version===api.getGeneration()&&canEdit())message('#access-message','Account saved. No invitation email was sent.',false);
  }catch(error){if(version===api.getGeneration())message('#access-message',error.message);}
  finally{if(version===api.getGeneration()){busy=false;$('#allow-access').disabled=false;if(canEdit())renderMembers();}}
 }
 function init(bridge){
  api=bridge;
  $('#quantity-decrease').onclick=()=>{$('#gift-quantity').value=Math.max(1,(Number($('#gift-quantity').value)||1)-1);};$('#quantity-increase').onclick=()=>{$('#gift-quantity').value=Math.min(100,(Number($('#gift-quantity').value)||1)+1);};
  $('#add-gift').onclick=()=>openGift();$('#gift-form').onsubmit=save;
  $('#close-gift').onclick=$('#cancel-gift').onclick=()=>{if(!busy)close('#gift-dialog');};
  $('#gift-dialog').addEventListener('cancel',event=>{if(busy)event.preventDefault();});
  $('#gift-kind').onchange=()=>{if(!editing&&!matchTouched)$('#gift-match').value=$('#gift-kind').value==='idea'?'similar':'exact';};
  $('#gift-match').onchange=()=>{matchTouched=true;};$('#gift-image').onchange=preview;
  $('#gift-image-preview').onerror=()=>{$('#gift-image-preview').hidden=true;$('#image-preview-message').textContent='Image could not load. You can still save the gift.';};
  $('#archive-gift').onclick=()=>{$('#archive-confirm').hidden=false;};$('#cancel-archive').onclick=()=>{$('#archive-confirm').hidden=true;};
  $('#confirm-archive').onclick=()=>{if(editing)archiveGift(editing,true);};
  $('#view-archive').onclick=()=>{open('#archive-dialog');loadArchive();};$('#close-archive').onclick=()=>close('#archive-dialog');
  $('#family-access').onclick=()=>{location.href='admin.html';};$('#close-access').onclick=()=>close('#access-dialog');
  $('#access-form').onsubmit=event=>{event.preventDefault();setMember({email:$('#access-email').value.trim()},role==='owner'?$('#access-role').value:'viewer',true);};
 }
 window.wishlistEditor={init,sync,clear,openGift};
})();
