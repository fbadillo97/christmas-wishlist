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
    const data = await response.json();
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
      if (!snapshot || latest.revision > snapshot.revision) render(latest);
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
      feedback = e.code === '40001' ? 'Another host acted first. The board has been refreshed.' :
        'Check the current board before trying again. ' + e.message;
      clear('Checking the latest game state…');
    } finally {
      writing = false;
      if (snapshot) el('controls').disabled = false;
      else void read();
    }
  }

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
    void read();
  });
  document.addEventListener('visibilitychange', read);
  window.addEventListener('online', read);
  window.addEventListener('offline', () => {
    ++generation;
    clear('Offline. Reconnecting…');
  });
  async function start() {
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
  void start();
})();
