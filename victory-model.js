'use strict';
const VictoryModel = (() => {
  const specs = [
    ['Most Wanted Gift','Apparently everyone wanted this!','steals'],
    ['Most Robbed',"Can’t have anything nice!",'times robbed'],
    ['Master Gift Thief','Absolute menace.','successful steals'],
    ['Longest Stealing Chain','This turn got out of hand!','consecutive steals']
  ];
  function results(board) {
    const people=board.revealed.map((name,index)=>({name,index,art:board.portraits?.find(p=>p.title===name),robbed:0,stole:0}));
    const gifts=Object.entries(board.gifts).sort(([a],[b])=>Number(a)-Number(b)).map(([key,g])=>({
      name:g.title,art:g,owner:people[g.owner-1]?.name,score:g.steals,key
    }));
    const chains=[]; let chain=null, steals=0;
    for(const m of board.moves) {
      if(m.kind!=='steal'){chain=null;continue;}
      steals++;
      const final=m.phase!=='regular', key=(final?'final-':'turn-')+m.turn;
      if(!chain || chain.key!==key){
        chain={key,name:final?'Final opportunity · Turn '+m.turn:'Turn '+m.turn,score:0,members:new Set()};
        chains.push(chain);
      }
      chain.score++;
      if(people[m.actor-1]){people[m.actor-1].stole++;chain.members.add(people[m.actor-1].name);}
      if(people[m.displaced-1]){people[m.displaced-1].robbed++;chain.members.add(people[m.displaced-1].name);}
    }
    const sets=[gifts,people.map(p=>({...p,score:p.robbed})),people.map(p=>({...p,score:p.stole})),chains];
    const awards=specs.map(([title,caption,unit],i)=>{
      const score=sets[i].reduce((best,row)=>Math.max(best,row.score),0);
      return {title,caption,unit,score,winners:sets[i].filter(w=>score>0 && w.score===score)};
    });
    return {awards,gifts,totals:[[people.length,'Participants'],[gifts.length,'Gifts opened'],[steals,'Successful steals'],[gifts.filter(g=>g.score>=3).length,'Locked gifts'],[chains.length,'Stealing chains']]};
  }
  function scenes(result){
    return [{kind:'opening',segment:-1,duration:4000},...result.awards.flatMap((a,segment)=>{
      const pages=[];
      for(let i=0;i<a.winners.length;i+=6)pages.push({kind:'award',segment,offset:i,duration:a.winners.length>6?4500:6000});
      return pages;
    }),{kind:'finale',segment:4,duration:4000}];
  }
  function position(scenes,start,next,now){
    let index=0, time=start;
    function advance(until){
      while(index<scenes.length && time+scenes[index].duration<=until)time+=scenes[index++].duration;
    }
    for(const stamp of next){
      const at=Date.parse(stamp);
      if(at>now)break;
      advance(at);
      const group=scenes[index]?.segment;
      while(index<scenes.length && scenes[index].segment===group)index++;
      time=at;
    }
    advance(now);return index;
  }
  return {results,scenes,position};
})();
if(typeof module!=='undefined')module.exports=VictoryModel;
