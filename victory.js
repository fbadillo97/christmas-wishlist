'use strict';
const victory=(()=>{
  const root=document.getElementById('victory');
  let previous,run,playing=false,timer,signature,last,model,sequence,control,photo,offset=0,dashboardSince=null;
  function el(tag,cls,value){const n=document.createElement(tag);n.className=cls;if(value!=null)n.textContent=value;return n;}
  function title(text){root.append(el('h1','victory-title',text));}
  function mascot(scene){const img=el('img','victory-mascot');img.src=scene.kind==='award'?(scene.segment<2?'assets/mascot/open.png':'assets/mascot/steal.png'):'assets/mascot/lock.png';img.alt='';root.append(img);}
  function meter(count){
    const bar=el('span','victory-meter');bar.setAttribute('aria-label',count+' of 3 steals');
    for(let i=0;i<3;i++)bar.append(el('i',i<count?'filled':''));
    return bar;
  }
  function card(w,unit){
    const box=el('article','victory-card'),art=el('div','victory-art');
    art.textContent=w.members?'★':w.owner?'◆':w.name.split(/\s+/).map(s=>s[0]).slice(0,2).join('');
    if(w.art?.photo){art.replaceChildren();photo(art,w.art);}
    box.append(art,el('strong','',w.name));
    if(w.owner)box.append(el('span','',w.owner),meter(w.score));
    if(w.members)box.append(el('span','chain-members',[...w.members].join(' · ')));
    if(w.owner && w.score>=3)box.append(el('small','','Locked'));
    return box;
  }
  function scoreText(a){return a.score+' '+(a.score===1?a.unit.replace(/steals$/,'steal').replace('times robbed','time robbed'):a.unit);}
  function totals(){
    const row=el('div','victory-totals');
    for(const [value,label] of model.totals){const stat=el('div','');stat.append(el('b','',value),el('span','',label));row.append(stat);}
    return row;
  }
  function dashboard(page){
    title('Final results');root.append(totals());
    const section=el('section','results-awards');
    for(const a of model.awards){
      const box=el('div','summary'),n=a.winners.length;
      box.append(el('h2','',a.title),el('b','score',n?(n>1?n+'-WAY TIE · ':'')+scoreText(a):'No qualifying steals'));
      if(n){const start=(page%Math.ceil(n/2))*2;
        for(const w of a.winners.slice(start,start+2))box.append(card(w,a.unit));
        if(n>2)box.append(el('small','','Winners '+(start+1)+'–'+Math.min(n,start+2)+' of '+n));}
      section.append(box);
    }
    root.append(section,el('h2','ownership-title','Final gift ownership'));
    const grid=el('div','victory-grid ownership'),start=page%Math.max(1,Math.ceil(model.gifts.length/6))*6;
    for(const g of model.gifts.slice(start,start+6))grid.append(card(g));
    root.append(grid,el('small','page-count','Gifts '+(start+1)+'–'+Math.min(start+6,model.gifts.length)+' of '+model.gifts.length));
  }
  function draw(){
    const now=Date.now()+offset, start=Date.parse(control.start);
    const idx=playing?VictoryModel.position(sequence,start,control.next||[],now):sequence.length;
    const scene=sequence[idx];
    if(scene)dashboardSince=null;
    else dashboardSince ??= now;
    const page=Math.max(0,Math.floor((now-(dashboardSince??now))/4500));
    const key=scene?'scene'+idx:'dashboard'+[Math.floor((page%Math.max(1,Math.ceil(model.gifts.length/6)))),...model.awards.map(a=>page%Math.max(1,Math.ceil(a.winners.length/2)))].join('-');
    if(last===key)return;last=key;root.replaceChildren();root.hidden=false;
    root.dataset.scene=scene?.kind||'dashboard';
    if(!scene){dashboard(Math.max(0,page));return;}
    mascot(scene);
    if(scene.kind==='opening'||scene.kind==='finale'){
      const confetti=el('div','victory-confetti');confetti.setAttribute('aria-hidden','true');
      for(let i=0;i<24;i++){const star=el('i','',i%4?'▪':'✦');star.style.setProperty('--x',(i*41%100)+'%');star.style.setProperty('--delay',(-i*.31)+'s');confetti.append(star);}
      root.append(confetti);
    }
    root.append(el('p','victory-eyebrow','WHITE ELEPHANT  /  AWARDS NIGHT'));
    if(scene.kind==='opening'){title('GAME COMPLETE!');root.append(el('div','victory-stars','✦ ★ ✦'));return;}
    if(scene.kind==='finale'){title('TOTAL CHAOS!');root.append(totals());return;}
    const a=model.awards[scene.segment],n=a.winners.length,i=scene.offset;
    const trophy=el('img','victory-trophy');trophy.src='assets/mascot/award-cup.svg';trophy.alt='';root.append(trophy);
    title(a.title);root.append(el('p','victory-score',(n>1?n+'-WAY TIE!  ·  ':'')+scoreText(a)));
    const grid=el('div','victory-grid');for(const w of a.winners.slice(i,i+6))grid.append(card(w,a.unit));
    root.append(grid,el('p','victory-caption',a.caption));
    if(n>6)root.append(el('small','page-count','Winners '+(i+1)+'–'+Math.min(n,i+6)+' of '+n));
  }
  function disconnect(){clearInterval(timer);timer=null;root.hidden=true;last=null;}
  function update(b,showPhoto){
    if(b.phase!=='done'||!Array.isArray(b.moves)){previous=b.phase;disconnect();signature=null;return false;}
    photo=showPhoto;control=b.ceremony||{};offset=Date.parse(b.clock)-Date.now()||0;
    if(previous!=='done'||run!==control.start){playing=!!previous && !!control.start;last=null;}
    if(control.skip)playing=false;
    previous='done';run=control.start;
    const sig=JSON.stringify([b.gifts,b.moves,b.portraits,b.revealed]);
    if(sig!==signature){model=VictoryModel.results(b);sequence=VictoryModel.scenes(model);signature=sig;last=null;}
    draw();timer ||= setInterval(draw,200);return true;
  }
  return {update,disconnect};
})();
