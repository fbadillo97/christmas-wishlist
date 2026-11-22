(() => {
  'use strict';
  const el = id => document.getElementById(id);
  const game = new URLSearchParams(location.search).get('game');
  const sessionKey = 'badillo-session';
  let config, snapshot, verifiedToken, generation = 0, writing = false, polling = false;
  let feedback = '';
  const session = () => JSON.parse(localStorage.getItem(sessionKey) || 'null');
  const stale = () => new Error('Session changed. Reconnecting…');

  function clear(message) {
    snapshot = null;
    el('resume').hidden=true;
    el('resume-list').replaceChildren();
    el('return-setup').hidden = true;
    el('setup').hidden=true;
    el('choices').replaceChildren();el('recipients').replaceChildren();el('portraits').replaceChildren();
    el('names').value='';
    el('photo-status').textContent='';
    el('tv-link').removeAttribute('href');
    el('tv-link').hidden = true;
    el('tv-message').textContent = '';
    el('console').hidden = true;
    el('controls').disabled = true;
    for (const id of ['turn','player','instruction','gifts','moves','pending','title']) {
      if (id === 'title') el(id).value = '';
      else el(id).replaceChildren();
    }
    el('status').textContent = message;
  }

  async function request(path, token, body) {
    const response = await fetch(config.supabaseUrl + path, {
      method: body ? 'POST' : 'GET', cache: 'no-store', signal: AbortSignal.timeout(10000),
      headers: {apikey: config.publishableKey, 'Content-Type':'application/json',
        ...(token ? {Authorization:'Bearer ' + token} : {})},
      ...(body ? {body: JSON.stringify(body)} : {})
    });
    const data = await response.json().catch(()=>({}));
    if (!response.ok) {
      const error = new Error(response.status === 401 ? 'Sign in again from the family page.' :
        response.status === 403 ? 'This account does not have host access.' :
        data.message || 'Could not load the game.');
      error.code = data.code;
      throw error;
    }
    return data;
  }

  async function getToken() {
    const current = session();
    if (!current?.access_token) throw new Error('Sign in on the family page, then reopen your game link.');
    if (current.expires_at > Date.now()/1000 + 30) return current.access_token;
    const refresh = async () => {
      const original = session();
      if (!original) throw stale();
      if (original.expires_at > Date.now()/1000 + 30) return original.access_token;
      const next = await request('/auth/v1/token?grant_type=refresh_token', null, {refresh_token: original.refresh_token});
      if (session()?.refresh_token !== original.refresh_token) throw stale();
      localStorage.setItem(sessionKey, JSON.stringify({...next, expires_at: Date.now()/1000 + next.expires_in}));
      return next.access_token;
    };
    return navigator.locks ? navigator.locks.request('white-elephant-session', refresh) : refresh();
  }

  function render(s) {
    const state = s.state, gifts = state.gifts, phase = state.phase;
    if (phase === 'cancelled') {
      clear('Game cancelled.');
      el('return-setup').hidden = false;
      return;
    }
    el('cancel-game').hidden = phase === 'done';
    el('return-setup').hidden = phase !== 'done';
    const name = n => s.revealed[n - 1];
    const actor = name(state.active);
    if (snapshot?.revision !== s.revision) el('title').value = '';
    snapshot = s;
    el('console').hidden = false;
    el('turn').textContent = phase === 'regular' ? 'Turn ' + state.turn + ' of ' + s.player_count :
      phase === 'done' ? 'Final gifts' : 'Final exchange';
    el('player').textContent = actor || 'Game complete';
    el('instruction').textContent = s.paused ? 'Game paused' : phase === 'replacement' ?
      'Take the available gift or steal an eligible gift.' : phase === 'final' ?
      'Keep your gift or start the final exchange.' : phase === 'done' ?
      'Everyone has a gift.' : 'Open a wrapped gift or steal an eligible gift.';
    el('portraits').replaceChildren();
    for(const person of s.portraits || []){
      const row=document.createElement('div'),label=document.createElement('label'),input=document.createElement('input');
      label.textContent=person.title;input.type='file';input.accept='image/*';
      input.setAttribute('aria-label','Portrait for '+person.title);
      input.onchange=()=>{if(input.files[0])upload(person,input.files[0]);};
      label.append(input);row.append(label);giftPhotos.show(row,person,config,game,verifiedToken);
      el('portraits').append(row);
    }
    el('gifts').replaceChildren();
    el('moves').replaceChildren();
    const canPropose = !s.paused && !s.pending;
    const addMove = (label, type, target) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'control-button';
      button.textContent = label;
      button.onclick = () => write('propose',type,target);
      el('moves').append(button);
    };
    const ownLocked = phase === 'final' && Object.values(gifts).some(g => g.owner === 1 && g.steals >= 3);
    for (const [key,g] of Object.entries(gifts)) {
      const card = document.createElement('div');
      card.className = 'gift-card';
      card.textContent = g.title + ' · ' + (name(g.owner) || 'Available') + ' · ' +
        (g.steals >= 3 ? 'Locked' : g.steals + '/3 steals');
      giftPhotos.show(card,g,config,game,verifiedToken);
      for(const camera of [true,false]){
        const label=document.createElement('label'), input=document.createElement('input');
        input.type='file'; input.accept='image/*';
        if(camera)input.setAttribute('capture','environment');
        label.textContent=camera?(g.photo?'Retake photo':'Take photo'):(g.photo?'Replace photo':'Choose photo');
        input.setAttribute('aria-label',label.textContent+' for '+g.title);
        input.onchange=()=>{if(input.files[0]) upload(g,input.files[0]);input.value='';};
        label.append(input);card.append(label);
      }
      el('gifts').append(card);
      if (!canPropose || phase === 'done') continue;
      if (phase === 'replacement' && g.owner === null) addMove('Take ' + g.title,'take',key);
      else if (g.owner && g.owner !== state.active && g.steals < 3 && key !== state.blocked && !ownLocked)
        addMove('Steal ' + g.title,'steal',key);
    }
    if (canPropose && phase === 'final') addMove('Keep current gift','keep',null);
    el('open-group').hidden = !canPropose || phase !== 'regular';
    el('pending-group').hidden = !s.pending;
    if (s.pending) {
      const {type,target} = s.pending;
      const detail = type === 'open' ? 'open ' + (target || 'a wrapped gift') :
        type === 'keep' ? 'keep their gift' : type + ' ' + gifts[target].title;
      el('pending').textContent = 'Pending: ' + actor + ' to ' + detail;
    }
    el('confirm').disabled = s.paused;
    el('pause').textContent = s.paused ? 'Resume game' : 'Pause game';
    el('pause').hidden = phase === 'done';
    el('undo').disabled = !!s.pending || !Object.keys(gifts).length;
    el('controls').disabled = writing;
  }

  async function sendPhoto(game,g,file,auth){
      const blob=await giftPhotos.compress(file), photo=crypto.randomUUID();
      if(session()?.access_token!==auth)throw stale();
      const result=await fetch(config.supabaseUrl+'/storage/v1/object/we-gift-photos/'+game+'/'+g.id+'/'+photo+'.jpg',{
        method:'POST',headers:{apikey:config.publishableKey,Authorization:'Bearer '+auth,'Content-Type':'image/jpeg'},body:blob,signal:AbortSignal.timeout(30000)});
      if(!result.ok)throw Error('Upload failed. Try again.');
      if(session()?.access_token!==auth)throw stale();
      await request('/rest/v1/rpc/we_attach_photo',auth,{game,gift:g.id,photo,previous:g.photo||null});
  }
  async function upload(g,file){
    const auth=await getToken().catch(()=>null);
    if(!auth || !snapshot)return;
    el('photo-status').textContent='Uploading photo…';
    try {
      await sendPhoto(game,g,file,auth);
      if(snapshot && session()?.access_token===auth)el('photo-status').textContent='Photo saved.';
      void read();
    } catch(e){if(snapshot && session()?.access_token===auth)el('photo-status').textContent=e.message;}
  }

  async function rpc(body, version) {
    const token = await getToken();
    if (version !== generation) throw stale();
    if (verifiedToken !== token) {
      await request('/auth/v1/user',token);
      if (version !== generation || token !== session()?.access_token) throw stale();
      verifiedToken = token;
    }
    const data = await request('/rest/v1/rpc/we_host_action',token,{game,...body});
    if (version !== generation || token !== session()?.access_token) throw stale();
    return data;
  }

  async function read() {
    if (!game || !config || polling || writing || document.hidden) return;
    const version = generation;
    polling = true;
    try {
      const latest = await rpc({expected:null,command:'read'},version);
      if (version !== generation || writing) return;
      if (!snapshot || latest.revision > snapshot.revision || JSON.stringify(latest.state.gifts)!==JSON.stringify(snapshot.state.gifts) || JSON.stringify(latest.portraits)!==JSON.stringify(snapshot.portraits)) render(latest);
      if (latest.state.phase !== 'cancelled') el('status').textContent = feedback || 'Connected';
    } catch (e) {
      if (version === generation && !writing) clear(e.message || 'Disconnected. Reconnecting…');
    } finally { polling = false; }
  }

  async function write(command, move_type = null, target = null) {
    if (!snapshot || writing) return;
    const version = ++generation;
    writing = true;
    el('controls').disabled = true;
    feedback = '';
    try {
      const latest = await rpc({expected:snapshot.revision,command,move_type,target}, version);
      if (version !== generation) return;
      if (command === 'cancel_game') {
        location.replace('./white-elephant-host.html');
        return;
      }
      render(latest);
      el('status').textContent = 'Connected';
    } catch (e) {
      if (version !== generation) return;
      feedback = e.code === 'PT409' ? 'Another host acted first. The board has been refreshed.' :
        'Check the current board before trying again. ' + e.message;
      clear('Checking the latest game state…');
    } finally {
      writing = false;
      if (snapshot) el('controls').disabled = false;
      else void read();
    }
  }

  async function pairTV(enable) {
    const version = generation;
    el('pair-tv').disabled = el('revoke-tv').disabled = true;
    try {
      const token = await getToken();
      if (version !== generation) return;
      const pairing = await request('/rest/v1/rpc/we_pair_tv', token, {game, enable});
      if (version !== generation || token !== session()?.access_token) return;
      const link = el('tv-link');
      link.hidden = !pairing;
      link.removeAttribute('href');
      if (pairing) link.href = './white-elephant-tv.html#' + new URLSearchParams({game, token:pairing});
      el('tv-message').textContent = pairing ? 'Open or copy this link for the TV.' : 'TV disconnected.';
    } catch (e) {
      if (version === generation) el('tv-message').textContent = e.message;
    } finally {
      el('pair-tv').disabled = el('revoke-tv').disabled = false;
    }
  }
  el('pair-tv').onclick = () => pairTV(true);
  el('revoke-tv').onclick = () => pairTV(false);
  el('open').onclick = () => write('propose','open',el('title').value.trim() || null);
  el('confirm').onclick = () => write('confirm');
  el('cancel-game').onclick = () => {
    if (window.confirm('Cancel this game for everyone and return to setup? This game cannot be resumed.')) {
      void write('cancel_game');
    }
  };
  el('cancel').onclick = () => write('cancel');
  el('pause').onclick = () => write(snapshot.paused ? 'resume' : 'pause');
  el('undo').onclick = () => { if (window.confirm('Undo the last confirmed move?')) void write('undo'); };
  window.addEventListener('storage', event => {
    if (event.key !== sessionKey && event.key !== null) return;
    ++generation;
    verifiedToken = null;
    feedback = '';
    clear('Checking host access…');
    if(!game) location.reload(); else void read();
  });
  document.addEventListener('visibilitychange', read);
  window.addEventListener('online', () => {
    if (game) void read();
    else if (el('setup').hidden) location.reload();
    else el('status').textContent = '';
  });
  window.addEventListener('offline', () => {
    if (!game) {
      el('status').textContent = 'Offline. Reconnect to start the game.';
      return;
    }
    ++generation;
    clear('Offline. Reconnecting…');
  });
  async function start() {
    if (!game) {
      try {
        config=await (await fetch('./config.json',{cache:'no-store'})).json();
        const token=await getToken();
        const games=await request('/rest/v1/rpc/we_active_host_games',token,{});
        if(token!==session()?.access_token)return;
        for(const active of games){
          const row=document.createElement('p'),link=document.createElement('a');
          link.href='?game='+encodeURIComponent(active.id);
          link.textContent='Rejoin game';
          row.append(link,document.createTextNode(' · '+(active.paused?'Paused · ':'')+
            'Turn '+active.turn_no+' of '+active.player_count+' · '+active.player+' · '+active.id.slice(0,6)));
          const remove=document.createElement('button');
          remove.type='button';
          remove.className='remove-game';
          remove.textContent='Delete game';
          remove.onclick=async()=>{
            remove.disabled=true;
            try{
              const auth=await getToken();
              const action=(body)=>request('/rest/v1/rpc/we_host_action',auth,{game:active.id,...body});
              const latest=await action({command:'read',expected:null});
              if(session()?.access_token!==auth)return;
              if(!['done','cancelled'].includes(latest.state.phase)){
                const description='Game '+active.id.slice(0,6)+' · Turn '+latest.state.turn+' of '+latest.player_count;
                if(!window.confirm('Delete '+description+' from active games? This ends the game for all hosts and the TV.'))return;
                await action({command:'cancel_game',expected:latest.revision});
              }
              if(session()?.access_token!==auth)return;
              row.remove();
              el('resume').hidden=!el('resume-list').childElementCount;
              el('status').textContent='Game removed from active games.';
            }catch(e){el('status').textContent=e.code==='PT409'?'Another host changed the game. Review it and try again.':e.message;}
            finally{remove.disabled=false;}
          };
          row.append(remove);
          el('resume-list').append(row);
        }
        el('resume').hidden=!games.length;
        const choices=await request('/rest/v1/rpc/we_cohost_choices',token,{});
        if(token!==session()?.access_token)return;
        const recipients=await request('/rest/v1/rpc/we_viewer_choices',token,{});
        if(token!==session()?.access_token)return;
        for(const viewer of recipients){
          let name=viewer.name;
          const add=document.createElement('input');
          add.type='checkbox';add.value=name;add.onchange=syncRoster;
          const select=document.createElement('label');select.append(add,document.createTextNode(name));
          const row=document.createElement('div'),label=document.createElement('label'),file=document.createElement('input');
          const use=document.createElement('button');use.type='button';use.textContent='Use saved photo for this game';use.hidden=!viewer.has_photo;
          file.type='file';file.accept='image/*';label.textContent='Account photo';file.setAttribute('aria-label','Save account photo for '+name);
          file.onchange=async()=>{
            try{
              const jpeg=await giftPhotos.compress(file.files[0]),bytes=new Uint8Array(await jpeg.arrayBuffer());
              let binary='';for(const byte of bytes)binary+=String.fromCharCode(byte);
              await request('/rest/v1/rpc/we_account_portrait',await getToken(),{id:viewer.id,image:btoa(binary),write_photo:true});
              use.hidden=false;el('status').textContent='Account photo saved.';
            }catch(e){el('status').textContent=e.message;}
            file.value='';
          };
          use.onclick=async()=>{
            try{
              const auth=await getToken(),encoded=await request('/rest/v1/rpc/we_account_portrait',auth,{id:viewer.id});
              if(!encoded || session()?.access_token!==auth)return;
              add.checked=true;syncRoster();setupPhotos.set(name,new Blob([Uint8Array.from(atob(encoded),c=>c.charCodeAt(0))],{type:'image/jpeg'}));
              editPortraits();el('status').textContent='Portrait selected for '+name+'.';
            }catch(e){el('status').textContent=e.message;}
          };
          const photos=document.createElement('details'),summary=document.createElement('summary');
          summary.textContent='Account photo';photos.append(summary,file,use);row.append(select,photos);
          if(/^Family member [0-9a-f]{6}$/.test(name)){
            const edit=document.createElement('button');
            edit.type='button';edit.textContent='Add account name';row.insertBefore(edit,photos);
            edit.onclick=async()=>{
              edit.disabled=true;
              try{
                const auth=await getToken();
                const members=await request('/rest/v1/rpc/editor_list_members',auth,{});
                const member=members.find(item=>item.account_id===viewer.id && item.active);
                if(!member || member.first_name?.trim() || member.last_name?.trim())throw Error('Account changed. Refresh the roster.');
                const fields=document.createElement('fieldset'),legend=document.createElement('legend');
                legend.textContent=member.email;fields.append(legend);
                function nameField(title){
                  const label=document.createElement('label'),input=document.createElement('input');
                  input.type='text';input.maxLength=80;label.textContent=title;label.append(input);fields.append(label);return input;
                }
                const first=nameField('First name'),last=nameField('Last name'),save=document.createElement('button');
                save.type='button';save.textContent='Save name';fields.append(save);edit.replaceWith(fields);first.focus();
                save.onclick=async()=>{
                  if(!first.value.trim()){first.focus();el('status').textContent='Enter a first name.';return;}
                  save.disabled=true;
                  const next=[first.value.trim(),last.value.trim()].filter(Boolean).join(' ');
                  try{
                    await request('/rest/v1/rpc/admin_save_account',await getToken(),{p_email:member.email,p_first_name:first.value.trim(),p_last_name:last.value.trim(),p_role:member.role,p_active:member.active,p_revision:member.revision});
                    if(setupPhotos.has(name)){setupPhotos.set(next,setupPhotos.get(name));setupPhotos.delete(name);}
                    name=next;add.value=name;select.lastChild.textContent=name;
                    file.setAttribute('aria-label','Save account photo for '+name);
                    fields.remove();syncRoster();el('status').textContent='Account name saved.';
                  }catch(e){el('status').textContent=e.message;save.disabled=false;}
                };
              }catch(e){el('status').textContent=e.message;edit.disabled=false;}
            };
          }
          el('recipients').append(row);
        }
        for(const person of choices){
          const label=document.createElement('label'), box=document.createElement('input');
          box.type='checkbox'; box.value=person.account;
          label.append(box,document.createTextNode(person.email));el('choices').append(label);
        }
        el('setup').hidden=false;el('status').textContent='';
      } catch(e){
        if(el('resume').hidden)clear(e.message);
        else el('status').textContent='Choose a game to resume.';
      }
      return;
    }
    if (!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(game || '')) {
      clear('Open the host link for your game.');
      return;
    }
    try {
      config = await (await fetch('./config.json',{cache:'no-store'})).json();
      await read();
      setInterval(read,2000);
    } catch { clear('Could not load game settings. Refresh to reconnect.'); }
  }
  const setupPhotos=new Map();
  function editPortraits(){
    const names=new Set(el('names').value.split('\n').map(n=>n.trim().replace(/\s+/g,' ')).filter(Boolean));
    for(const name of setupPhotos.keys())if(!names.has(name))setupPhotos.delete(name);
    el('setup-photos').replaceChildren();
    for(const name of names){
      const label=document.createElement('label'),input=document.createElement('input');
      label.textContent=name+(setupPhotos.has(name)?' (selected)':'');
      input.type='file'; input.accept='image/*'; input.setAttribute('aria-label','Setup portrait for '+name);
      input.onchange=()=>{if(input.files[0])setupPhotos.set(name,input.files[0]);};
      label.append(input);el('setup-photos').append(label);
    }
  }
  el('setup-portraits').ontoggle=()=>{if(el('setup-portraits').open)editPortraits();};
  function syncRoster(){
    const selected=[...el('recipients').querySelectorAll(':checked')].map(box=>box.value);
    const guests=el('guests').value.split('\n').map(name=>name.trim().replace(/\s+/g,' ')).filter(Boolean);
    const roster=[...selected,...guests];
    el('names').value=roster.join('\n');
    el('roster-count').textContent=roster.length+' contestant'+(roster.length===1?'':'s')+' selected';
    editPortraits();
  }
  el('guests').oninput=syncRoster;
  let attempt;
  el('setup').onsubmit=async event=>{
    event.preventDefault();
    const button=el('setup').querySelector('[type=submit]');
    if(button.disabled)return;
    button.disabled=true;
    try {
      const names=el('names').value.split(/\r?\n/).map(n=>n.trim()).filter(Boolean);
      const cohosts=[...el('choices').querySelectorAll(':checked')].map(n=>n.value);
      const payload=JSON.stringify({names,cohosts});
      if(attempt?.payload!==payload)attempt={payload,id:crypto.randomUUID()};
      const token=await getToken();
      const result=await request('/rest/v1/rpc/we_start_game',token,{names,cohosts,request_id:attempt.id});
      const failed=[];
      for(const person of result.portraits || []){
        const file=setupPhotos.get(person.title);
        if(!file)continue;
        if(token!==session()?.access_token)return;
        try{await sendPhoto(result.id,person,file,token);}catch{failed.push(person.title);}
      }
      if(token===session()?.access_token){
        if(failed.length)window.alert('Game started. Retry these portraits in Game controls: '+failed.join(', '));
        location.replace('?game='+encodeURIComponent(result.id));
      }
    } catch(e){el('status').textContent=e.message;}
    finally{button.disabled=false;}
  };
  el('share-host').onclick=async()=>{
    try{await navigator.clipboard.writeText(location.href);el('status').textContent='Host link copied.';}
    catch{el('status').textContent='Copy the address from your browser to share with a co-host.';}
  };
  void start();
})();
