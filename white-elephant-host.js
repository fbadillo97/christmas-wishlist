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

  async function upload(g,file){
    const auth=await getToken().catch(()=>null);
    if(!auth || !snapshot)return;
    el('photo-status').textContent='Uploading photo…';
    try {
      const blob=await giftPhotos.compress(file), photo=crypto.randomUUID();
      if(session()?.access_token!==auth)return;
      const result=await fetch(config.supabaseUrl+'/storage/v1/object/we-gift-photos/'+game+'/'+g.id+'/'+photo+'.jpg',{
        method:'POST',headers:{apikey:config.publishableKey,Authorization:'Bearer '+auth,'Content-Type':'image/jpeg'},body:blob,signal:AbortSignal.timeout(30000)});
      if(!result.ok)throw Error('Upload failed. Try again.');
      if(session()?.access_token!==auth)return;
      await request('/rest/v1/rpc/we_attach_photo',auth,{game,gift:g.id,photo,previous:g.photo||null});
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
    if (!config || polling || writing || document.hidden) return;
    const version = generation;
    polling = true;
    try {
      const latest = await rpc({expected:null,command:'read'},version);
      if (version !== generation || writing) return;
      if (!snapshot || latest.revision > snapshot.revision || JSON.stringify(latest.state.gifts)!==JSON.stringify(snapshot.state.gifts) || JSON.stringify(latest.portraits)!==JSON.stringify(snapshot.portraits)) render(latest);
      el('status').textContent = feedback || 'Connected';
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
  window.addEventListener('online', read);
  window.addEventListener('offline', () => {
    ++generation;
    clear('Offline. Reconnecting…');
  });
  async function start() {
    if (!game) {
      try {
        config=await (await fetch('./config.json',{cache:'no-store'})).json();
        const token=await getToken();
        const choices=await request('/rest/v1/rpc/we_cohost_choices',token,{});
        if(token!==session()?.access_token)return;
        const recipients=await request('/rest/v1/rpc/we_recipient_names',token,{});
        if(token!==session()?.access_token)return;
        for(const name of recipients){
          const add=document.createElement('button');add.type='button';add.textContent=name;
          add.onclick=()=>{const names=el('names');const list=names.value.split('\n').map(n=>n.trim()).filter(Boolean);
            if(!list.some(n=>n.toLowerCase()===name.toLowerCase()))names.value=[...list,name].join('\n');};
          el('recipients').append(add);
        }
        for(const person of choices){
          const label=document.createElement('label'), box=document.createElement('input');
          box.type='checkbox'; box.value=person.account;
          label.append(box,document.createTextNode(person.email));el('choices').append(label,document.createElement('br'));
        }
        el('setup').hidden=false;el('status').textContent='';
      } catch(e){clear(e.message);}
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
  let attempt;
  el('setup').onsubmit=async event=>{
    event.preventDefault();
    const button=el('setup').querySelector('button');
    if(button.disabled)return;
    button.disabled=true;
    try {
      const names=el('names').value.split(/\r?\n/).map(n=>n.trim()).filter(Boolean);
      const cohosts=[...el('choices').querySelectorAll(':checked')].map(n=>n.value);
      const payload=JSON.stringify({names,cohosts});
      if(attempt?.payload!==payload)attempt={payload,id:crypto.randomUUID()};
      const token=await getToken();
      const result=await request('/rest/v1/rpc/we_start_game',token,{names,cohosts,request_id:attempt.id});
      if(token===session()?.access_token)location.replace('?game='+encodeURIComponent(result.id));
    } catch(e){el('status').textContent=e.message;}
    finally{button.disabled=false;}
  };
  el('share-host').onclick=async()=>{
    try{await navigator.clipboard.writeText(location.href);el('status').textContent='Host link copied.';}
    catch{el('status').textContent='Copy the address from your browser to share with a co-host.';}
  };
  void start();
})();
