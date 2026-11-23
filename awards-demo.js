'use strict';
const names=['Francesco','Sandra','Teresa','Lauren','Fabiana','Anthony','Marina','Manuel','Anna Maria','Artur','Riley','Casey','Robin','Morgan','Avery','Taylor','Jamie','Sam'];
const titles=['Coffee Maker','Pizza Stone','Electric Blanket','Milk Frother','Waffle Iron','Bluetooth Speaker','Board Game','Cast Iron Pan','Movie Projector','Espresso Cups','Reading Lamp','Travel Mug','Snack Hamper','Tea Sampler','Cocktail Shaker','Pasta Roller','Hot Sauce Kit','Popcorn Maker'];
const count=document.querySelector('#count');
for(const n of [1,2,3,6,8,18,24,0])count.add(new Option(n===0?'Zero steals':n===1?'Single winner':n+'-way tie',n));
let board;
function send(){board.clock=new Date().toISOString();victory.update(board,(box,item)=>{const img=document.createElement('img');img.alt=item.title;img.src=item.photo;box.append(img);});}
function replay(){
 const n=Number(count.value),size=Math.max(3,n);
 const roster=Array.from({length:size},(_,i)=>names[i]||'Contestant '+(i+1));
 const gifts={},moves=[];
 for(let i=0;i<size;i++){
   gifts[i+1]={title:titles[i]||'Gift '+(i+1),owner:i+1,steals:i<n?1:0};
   if(i===0)gifts[i+1].photo='assets/mascot/demo-coffee.svg';
   if(i<n)moves.push({kind:'steal',turn:i+1,phase:'regular',actor:i+1,displaced:(i+1)%size+1});
   moves.push({kind:'open',turn:i+1});
 }
 board={phase:'done',revealed:roster,gifts,moves,ceremony:{start:new Date().toISOString(),next:[]}};
 victory.update({phase:'regular'});send();
}
count.onchange=replay;document.querySelector('#replay').onclick=replay;
document.querySelector('#next').onclick=()=>{board.ceremony.next.push(new Date().toISOString());send();};
document.querySelector('#skip').onclick=()=>{board.ceremony.skip=true;send();};
replay();
