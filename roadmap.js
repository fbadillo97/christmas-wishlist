(() => {
 const $=s=>document.querySelector(s),make=(tag,text,cls)=>{const el=document.createElement(tag);if(text!==undefined&&text!==null)el.textContent=text;if(cls)el.className=cls;return el;};
 let api,features=[],selectedId=null,signature='',busy=false,authorized=false,dirty=false;
 const labels={idea:'Idea',planned:'Planned',in_progress:'In Progress',testing:'Testing',completed:'Completed',on_hold:'On Hold',archived:'Archived'};
 const status=(id)=>labels[id]||id;
 const msg=(text,error=false)=>{const el=$('#roadmap-message');el.textContent=text;el.classList.toggle('error',error);};
 const slug=s=>s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,70);
 function clear(){features=[];selectedId=null;signature='';busy=false;authorized=false;dirty=false;$('#roadmap-rows').replaceChildren();$('#roadmap-detail').replaceChildren(make('div','Roadmap data cleared.','roadmap-detail-empty'));$('#roadmap-summary').textContent='';msg('');}
 function sync(items,canView){
  if(!canView){clear();return;}
  authorized=true;const incoming=Array.isArray(items)?items:[];const next=JSON.stringify(incoming);if(next===signature)return;if(dirty){msg('The roadmap changed on the server. Your unsaved edits remain open; saving will check for conflicts.',true);return;}features=incoming;signature=next;
  if(!features.some(f=>f.feature_id===selectedId))selectedId=null;render();
 }
 function filtered(){
  const query=$('#roadmap-search').value.trim().toLowerCase(),priority=$('#roadmap-priority').value,complexity=$('#roadmap-complexity').value,phase=$('#roadmap-phase').value,statusFilter=$('#roadmap-status').value,quick=$('#roadmap-quick-wins').checked;
  const rows=features.filter(f=>{
   if(statusFilter==='active'&&['completed','archived'].includes(f.status))return false;
   if(statusFilter!=='all'&&statusFilter!=='active'&&f.status!==statusFilter)return false;
   if(priority!=='all'&&f.priority!==priority)return false;if(complexity!=='all'&&f.complexity!==complexity)return false;if(phase!=='all'&&String(f.phase)!==phase)return false;
   if(quick&&(f.priority!=='high'||f.complexity!=='low'))return false;
   return !query||(f.title+' '+f.description+' '+f.feature_id).toLowerCase().includes(query);
  });
  const order={high:0,medium:1,low:2};const sort=$('#roadmap-sort').value;
  rows.sort((a,b)=>sort==='priority'?(order[a.priority]-order[b.priority]||a.phase-b.phase||a.title.localeCompare(b.title)):sort==='complexity'?(order[a.complexity]-order[b.complexity]||a.phase-b.phase||a.title.localeCompare(b.title)):sort==='updated'?String(b.updated_at||'').localeCompare(String(a.updated_at||'')):a.phase-b.phase||order[a.priority]-order[b.priority]||a.title.localeCompare(b.title));return rows;
 }
 function render(){
  const body=$('#roadmap-rows');body.replaceChildren();if(!authorized)return;const rows=filtered();
  $('#roadmap-summary').textContent=rows.length+' of '+features.length+' roadmap feature'+(features.length===1?'':'s')+(rows.length?'':' · No matches');
  for(const f of rows){const tr=make('tr',null,selectedId===f.feature_id?'roadmap-selected':'');tr.tabIndex=0;tr.setAttribute('aria-selected',String(selectedId===f.feature_id));tr.setAttribute('aria-label',`${f.title}, ${f.priority} priority, ${f.complexity} complexity, phase ${f.phase}, ${status(f.status)}`);tr.onclick=()=>select(f.feature_id);tr.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();select(f.feature_id);}};
   tr.append(make('td',f.title),make('td',capitalize(f.priority)),make('td',capitalize(f.complexity)),make('td','Phase '+f.phase),make('td',status(f.status)));body.append(tr);}
  if(!rows.length){const tr=make('tr'),td=make('td','No features match these filters.');td.colSpan=5;tr.append(td);body.append(tr);}
  if(selectedId&&!dirty){const f=features.find(x=>x.feature_id===selectedId);if(f)renderDetail(f);}
 }
 const capitalize=s=>s?s[0].toUpperCase()+s.slice(1):'';
 function select(id){if(dirty&&!window.confirm('Discard your unsaved roadmap changes?'))return;dirty=false;selectedId=id;render();}
 function detailText(parent,label,value){const block=make('div',null,'roadmap-detail-block');block.append(make('h4',label));block.append(make('p',value||'Not recorded'));parent.append(block);}
 function docsURL(path){return 'https://github.com/fbadillo97/christmas-wishlist/blob/main/'+String(path||'').split('/').map(encodeURIComponent).join('/');}
 function renderDetail(f){
  const panel=$('#roadmap-detail');panel.replaceChildren();panel.append(make('p',`FEATURE · ${f.feature_id}`,'roadmap-feature-id'),make('h3',f.title),make('p',f.description,'roadmap-feature-description'));
  const chips=make('div',null,'roadmap-chips');chips.append(make('span','Priority · '+capitalize(f.priority)),make('span','Complexity · '+capitalize(f.complexity)),make('span','Phase '+f.phase),make('span',status(f.status)));panel.append(chips);
  detailText(panel,'Effort estimate',f.effort_estimate);detailText(panel,'Dependencies',(f.dependencies||[]).map(id=>features.find(x=>x.feature_id===id)?.title||id).join(', '));detailText(panel,'Parent initiative',features.find(x=>x.feature_id===f.parent_feature_id)?.title||f.parent_feature_id);
  detailText(panel,'Technical notes',f.technical_notes);detailText(panel,'Decisions made',f.decision_notes);detailText(panel,'Open questions',f.open_questions);
  const d=make('p',null,'roadmap-doc-link');const a=make('a',f.documentation_path);a.href=docsURL(f.documentation_path);a.target='_blank';a.rel='noopener noreferrer';d.append(make('strong','Specification: '),a);panel.append(d);
  if(f.implementation_refs?.length){const links=make('div',null,'roadmap-detail-block');links.append(make('h4','Implementation references'));for(const url of f.implementation_refs){const safe=validHTTPS(url);if(safe){const link=make('a',url);link.href=safe;link.target='_blank';link.rel='noopener noreferrer';links.append(link);}else links.append(make('p',url));}panel.append(links);}
  if(f.status==='completed'&&f.completion_date)detailText(panel,'Completed on',f.completion_date);
  const actions=make('div',null,'roadmap-actions');if(f.status!=='archived'){const edit=make('button','Edit feature');edit.type='button';edit.onclick=()=>renderForm(f);actions.append(edit);}else actions.append(make('span','Archived records are read-only.','field-hint'));const copy=make('button','Copy context for ChatGPT');copy.type='button';copy.onclick=()=>copyContext(f);actions.append(copy);
  if(f.status!=='archived'){const archive=make('button','Archive');archive.type='button';archive.onclick=()=>archiveFeature(f);actions.append(archive);}panel.append(actions);
  if(f.history?.length){const history=make('details',null,'roadmap-history');history.append(make('summary','Change and release history ('+f.history.length+')'));const list=make('ol');for(const entry of f.history){const li=make('li');li.append(make('strong',capitalize(entry.action.replaceAll('_',' '))),make('span',' · '+new Date(entry.created_at).toLocaleString()));if(entry.after_state?.status==='completed'&&entry.after_state?.completion_date)li.append(make('p','Completion date: '+entry.after_state.completion_date));list.append(li);}history.append(list);panel.append(history);}
 }
 function validHTTPS(value){try{const u=new URL(value);return u.protocol==='https:'?u.href:null;}catch{return null;}}
 async function copyContext(f){
  const context=[`Continue planning the Christmas Wishlist platform feature below. Read the linked specification before proposing changes. Do not implement unless I explicitly ask.`,``,`Feature ID: ${f.feature_id}`,`Title: ${f.title}`,`Description: ${f.description}`,`Priority: ${f.priority}`,`Complexity: ${f.complexity}`,`Phase: ${f.phase}`,`Status: ${status(f.status)}`,`Effort estimate: ${f.effort_estimate||'Not estimated'}`,`Dependencies: ${(f.dependencies||[]).join(', ')||'None recorded'}`,`Parent: ${f.parent_feature_id||'None'}`,`Specification: ${docsURL(f.documentation_path)}`,``,`Decisions made:`,`${f.decision_notes||'None recorded'}`,``,`Open questions:`,`${f.open_questions||'None recorded'}`,``,`Technical notes:`,`${f.technical_notes||'None recorded'}`,``,`Implementation references:`,`${(f.implementation_refs||[]).join('\n')||'None recorded'}`,``,`Change history:`,`${(f.history||[]).map(h=>`${h.action} · ${h.created_at}`).join('\n')||'No changes recorded'}`].join('\n');
  try{await navigator.clipboard.writeText(context);msg('Feature context copied. Paste it into a new ChatGPT conversation.');}
  catch{const area=make('textarea');area.value=context;area.setAttribute('aria-label','Feature context for copying');document.body.append(area);area.select();try{document.execCommand('copy');msg('Feature context copied. Paste it into a new ChatGPT conversation.');}catch{msg('Clipboard access failed. Try again from a secure browser context.',true);}area.remove();}
 }
 function addField(form,label,id,type='text',value='',options=null){const wrap=make('label',label);if(type==='textarea')wrap.className='roadmap-wide';let input;if(options){input=document.createElement('select');for(const [v,t] of options){const o=make('option',t);o.value=v;input.append(o);}}else if(type==='textarea'){input=document.createElement('textarea');input.rows=id.includes('notes')||id==='open_questions'?3:2;}else{input=document.createElement('input');input.type=type;}input.id=id;input.name=id;wrap.append(input);form.append(wrap);if(!options)input.value=value||'';else input.value=value||options[0][0];return input;}
 function renderForm(f=null){
  if(!authorized||busy)return;selectedId=f?.feature_id||null;const panel=$('#roadmap-detail');panel.replaceChildren();const form=make('form',null,'roadmap-form');form.noValidate=false;form.append(make('h3',f?'Edit feature':'Add roadmap feature'));
  const fid=addField(form,'Stable feature ID','feature_id','text',f?.feature_id||'');fid.readOnly=!!f;fid.required=true;fid.pattern='[a-z0-9]+(-[a-z0-9]+)*';fid.maxLength=80;fid.autocomplete='off';fid.placeholder='e.g. gift-suggestions';
  const title=addField(form,'Title','title','text',f?.title||'');title.required=true;title.maxLength=120;
  const desc=addField(form,'Short description','description','textarea',f?.description||'');desc.maxLength=2000;
  addField(form,'Priority','priority','',f?.priority||'medium',[['high','High'],['medium','Medium'],['low','Low']]);
  addField(form,'Complexity','complexity','',f?.complexity||'medium',[['low','Low'],['medium','Medium'],['high','High']]);
  const effort=addField(form,'Optional effort estimate','effort_estimate','text',f?.effort_estimate||'');effort.maxLength=120;effort.placeholder='Separate from complexity';
  addField(form,'Phase','phase','',String(f?.phase||1),[['1','Phase 1'],['2','Phase 2'],['3','Phase 3'],['4','Phase 4']]);
  addField(form,'Status','status','',f?.status||'idea',Object.entries(labels).filter(([v])=>v!=='archived').map(([v,t])=>[v,t]));
  const parent=addField(form,'Parent feature ID (optional)','parent_feature_id','text',f?.parent_feature_id||'');parent.placeholder='Stable feature ID';
  const deps=make('label','Dependencies','roadmap-wide');const depSelect=document.createElement('select');depSelect.id='dependencies';depSelect.multiple=true;depSelect.size=Math.min(5,Math.max(3,features.length));depSelect.setAttribute('aria-label','Dependencies');for(const item of features.filter(x=>x.feature_id!==f?.feature_id)){const o=make('option',item.title+' · '+item.feature_id);o.value=item.feature_id;o.selected=(f?.dependencies||[]).includes(item.feature_id);depSelect.append(o);}deps.append(depSelect,make('span','Use Ctrl or Command to select multiple dependencies.','field-hint'));form.append(deps);
  const tech=addField(form,'Technical notes','technical_notes','textarea',f?.technical_notes||'');tech.maxLength=8000;
  const decisions=addField(form,'Decisions made','decision_notes','textarea',f?.decision_notes||'');decisions.maxLength=8000;
  const questions=addField(form,'Open questions','open_questions','textarea',f?.open_questions||'');questions.maxLength=8000;
  const path=addField(form,'GitHub specification path','documentation_path','text',f?.documentation_path||`docs/platform-roadmap/features/${f?.feature_id||'new-feature'}.md`);path.required=true;path.maxLength=240;
  const refs=addField(form,'Implementation references · one URL per line','implementation_refs','textarea',(f?.implementation_refs||[]).join('\n'));refs.placeholder='https://github.com/.../commit/...';
  const actions=make('div',null,'roadmap-actions'),save=make('button','Save feature','primary');save.type='submit';const cancel=make('button','Cancel');cancel.type='button';cancel.onclick=async()=>{dirty=false;if(f){selectedId=f.feature_id;render();await api.refresh();}else{selectedId=null;renderDetailEmpty();}};actions.append(save,cancel);form.append(actions);
  form.oninput=()=>{dirty=true;};form.onchange=()=>{dirty=true;};form.onsubmit=e=>saveFeature(e,form,f);panel.append(form);fid.focus();
 }
 function renderDetailEmpty(){const panel=$('#roadmap-detail');panel.replaceChildren();const box=make('div',null,'roadmap-detail-empty');box.append(make('h3','Select a feature'),make('p','Choose a row to review its requirements, decisions and history, or add a new roadmap entry.'));panel.append(box);}
 async function saveFeature(event,form,existing){
  event.preventDefault();if(!authorized||busy||api.getRole()!=='owner')return;const version=api.getGeneration();const get=id=>form.querySelector('#'+id).value.trim();const chosen=[...form.querySelector('#dependencies').selectedOptions].map(o=>o.value);
  const refs=get('implementation_refs').split(/\r?\n/).map(x=>x.trim()).filter(Boolean);if(refs.some(x=>!validHTTPS(x))){msg('Implementation references must be HTTPS URLs.',true);return;}
  const feature={feature_id:get('feature_id'),title:get('title'),description:get('description'),priority:get('priority'),complexity:get('complexity'),effort_estimate:get('effort_estimate'),phase:Number(get('phase')),status:get('status'),parent_feature_id:get('parent_feature_id'),dependencies:chosen,technical_notes:get('technical_notes'),decision_notes:get('decision_notes'),open_questions:get('open_questions'),documentation_path:get('documentation_path'),implementation_refs:refs};
  busy=true;msg('Saving feature…');form.querySelector('button[type="submit"]').disabled=true;
  try{await api.request('/rest/v1/rpc/save_platform_roadmap_feature',{p_feature:feature,p_revision:existing?.revision??null});if(version!==api.getGeneration()||!authorized)return;dirty=false;selectedId=feature.feature_id;await api.refresh();if(version===api.getGeneration())msg('Roadmap feature saved.');}
  catch(error){if(version===api.getGeneration())msg(error.message,true);}
  finally{busy=false;}
 }
 async function archiveFeature(f){
  if(!authorized||busy||api.getRole()!=='owner')return;if(!window.confirm(`Archive “${f.title}”? This keeps the record and its history.`))return;
  const version=api.getGeneration();busy=true;msg('Archiving feature…');try{await api.request('/rest/v1/rpc/archive_platform_roadmap_feature',{p_feature_id:f.feature_id,p_revision:f.revision});if(version!==api.getGeneration()||!authorized)return;selectedId=null;$('#roadmap-status').value='active';await api.refresh();if(version===api.getGeneration())msg('Feature archived; its history was preserved.');}
  catch(error){if(version===api.getGeneration())msg(error.message,true);}finally{busy=false;}
 }
 function init(bridge){api=bridge;for(const id of ['roadmap-search','roadmap-priority','roadmap-complexity','roadmap-phase','roadmap-status','roadmap-sort','roadmap-quick-wins'])$('#'+id).addEventListener(id==='roadmap-search'?'input':'change',render);$('#roadmap-new').onclick=()=>{if(dirty&&!window.confirm('Discard your unsaved roadmap changes?'))return;dirty=false;renderForm();};window.addEventListener('beforeunload',event=>{if(dirty){event.preventDefault();event.returnValue='';}});}
 window.wishlistRoadmap={init,sync,clear};
})();
