const tvAnnouncements = (() => {
  const duration = {open:2500, steal:3000, lock:4000};
  const panel = document.getElementById('announcement');
  let timer, playing, openingGift;
  function clear() {
    clearTimeout(timer);
    playing = openingGift = null;
    panel.hidden = true;
    delete panel.dataset.kind;
    panel.replaceChildren();
    document.querySelectorAll('.opening-surprise').forEach(card=>card.classList.remove('opening-surprise'));
  }
  function maskOpening() {
    if (openingGift) document.querySelectorAll('.gift-card').forEach(card=>{
      card.classList.toggle('opening-surprise',card.dataset.gift===openingGift);
    });
  }
  function part(parent,tag,cls,text) {
    const node=document.createElement(tag);
    node.className=cls;
    if(text) node.textContent=text;
    parent.append(node);
    return node;
  }
  function update(board,previous,showPhoto) {
    const move=board.last_move;
    if(previous===null || board.paused || !move){clear();return;}
    if(playing && playing!==move.revision) clear();
    if(move.revision<=previous || !['open','steal'].includes(move.kind)) return;
    const gift=board.gifts[move.gift], actor=board.revealed[move.actor-1];
    if(!gift || !actor) return;
    clear();
    playing=move.revision;
    const opening=move.kind==='open', lock=!opening && gift.steals>=3;
    const kind=opening?'open':lock?'lock':'steal';
    panel.dataset.kind=kind;
    panel.hidden=false;
    const scene=part(panel,'div','show-scene');
    const headline=opening?'A New Gift Is Being Opened!':actor+' Stole '+gift.title+'!';
    part(scene,'h3','show-headline',headline);
    const stage=part(scene,'div','show-stage');
    const parcel=part(stage,'div','show-parcel');
    if(!opening && gift.photo) showPhoto(parcel,gift);
    if(!opening) part(stage,'strong','show-stamp','SNATCHED!');
    if(lock) part(stage,'span','show-padlock').setAttribute('aria-hidden','true');
    const caption=part(scene,'div','show-caption');
    if(opening){
      openingGift=gift.id;
      const current=document.getElementById('player');
      const portrait=document.querySelector('#number img');
      if(portrait && current.textContent===actor) caption.append(portrait);
      part(caption,'span','show-name',actor);
    } else {
      if(lock) part(caption,'strong','show-lock-title','LOCKED IN WITH '+actor.toUpperCase()+'!');
      part(caption,'span','show-next',board.revealed[board.active-1]+", you’re up.");
    }
    timer=setTimeout(clear,duration[kind]);
  }
  return {clear,update,maskOpening};
})();
