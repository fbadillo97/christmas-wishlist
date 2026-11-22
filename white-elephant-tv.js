(() => {
  'use strict';
  const el = id => document.getElementById(id);
  const params = new URLSearchParams(location.hash.slice(1));
  const game = params.get('game'), token = params.get('token');
  const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
  let config, loading = false, revision = null;
  let giftState='';
  function node(tag, cls, value) {
    const n = document.createElement(tag);
    n.className = cls;
    if (value != null) n.textContent = value;
    return n;
  }
  function reset(message) {
    revision = null;
    el('board').hidden = true;
    for (const id of ['turn','phase','number','player','instruction','count','gifts','wrapped']) el(id).replaceChildren();
    el('status').textContent = message;
  }
  function render(b) {
    const gifts = Object.values(b.gifts);
    el('board').hidden = false;
    el('turn').textContent = 'Turn ' + b.turn + ' of ' + b.player_count;
    el('phase').textContent = b.paused ? 'Paused' : b.phase === 'regular' ? 'Now playing' :
      b.phase === 'done' ? 'Final gifts' : 'Final exchange';
    el('number').textContent = b.active ? b.revealed[b.active-1].split(/\s+/).slice(0,2).map(n=>Array.from(n)[0]).join('').toUpperCase() : '✓';
    el('player').textContent = b.revealed[b.active - 1] || 'Game complete';
    const portrait=b.portraits?.[0];
    if(portrait?.photo){el('number').replaceChildren();giftPhotos.show(el('number'),portrait,config,game,null,token);}
    el('instruction').textContent = b.paused ? 'Waiting for the hosts to resume.' :
      ({regular:'Open a gift or steal an eligible gift.',final:'Keep your gift or make a final steal.',
        replacement:'Take the available gift or steal an eligible gift.',done:'Everyone has a gift.'})[b.phase];
    el('wrapped').textContent = (b.player_count - gifts.length) + ' still wrapped';
    el('count').textContent = gifts.length;
    const grid = el('gifts');
    const looping = gifts.length > 6;
    grid.classList.toggle('is-scrollable',looping);
    const group = node('div','gift-grid-group');
    for (const g of gifts) {
      const card = node('article','gift-card');
      const info = node('div','gift-info');
      info.append(node('h4','gift-name',g.title),node('p','gift-owner',b.revealed[g.owner-1] || 'Available'),
        node('p','gift-stat',g.steals >= 3 ? 'Locked · 3 steals' : g.steals + '/3 steals'));
      const art=node('div','gift-art',g.photo?'':g.steals>=3?'🔒':'🎁');
      giftPhotos.show(art,g,config,game,null,token);
      card.append(art,info);
      group.append(card);
    }
    if (looping) {
      const track = node('div','gift-scroll-track is-looping');
      const copy = group.cloneNode(true);
      [...copy.querySelectorAll('img')].forEach(img=>{
        const gift=gifts.find(g=>g.photo===img.dataset.photo), parent=img.parentNode;
        img.remove();giftPhotos.show(parent,gift,config,game,null,token);
      });
      copy.setAttribute('aria-hidden','true');
      track.append(group,copy);
      grid.replaceChildren(track);
    } else grid.replaceChildren(...group.children);
    revision = b.revision;
  }
  async function refresh() {
    if (loading || document.hidden) return;
    loading = true;
    try {
      config ||= await (await fetch('./config.json',{cache:'no-store'})).json();
      const response = await fetch(config.supabaseUrl + '/rest/v1/rpc/we_tv_board',{
        method:'POST',cache:'no-store',credentials:'omit',signal:AbortSignal.timeout(8000),
        headers:{apikey:config.publishableKey,'Content-Type':'application/json'},body:JSON.stringify({game,token})
      });
      if (!response.ok) {
        reset([401,403].includes(response.status) ? 'TV link unavailable. Ask a host for a new link.' : 'Display disconnected. Reconnecting…');
        return;
      }
      const b = await response.json();
      if (b.phase === 'cancelled') {
        reset('Game cancelled.');
        return;
      }
      const state=JSON.stringify([b.gifts,b.portraits]);
      if(revision!==b.revision || state!==giftState) render(b);
      giftState=state;
      el('status').textContent = '';
    } catch { reset('Display disconnected. Reconnecting…'); }
    finally { loading = false; }
  }
  if (uuid.test(game || '') && uuid.test(token || '')) {
    refresh();
    setInterval(refresh,2000);
    document.addEventListener('visibilitychange',refresh);
    window.addEventListener('online',refresh);
  } else reset('Open a TV link from the host console.');
})();
