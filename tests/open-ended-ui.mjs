// Run: node tests/open-ended-ui.mjs (requires jsdom in a separate test environment).
import {JSDOM} from 'jsdom';
import fs from 'node:fs';
import assert from 'node:assert/strict';
const base=new URL('../',import.meta.url);
const html=fs.readFileSync(new URL('index.html',base),'utf8');
const app=fs.readFileSync(new URL('app.js',base),'utf8');
const editor=fs.readFileSync(new URL('editor.js',base),'utf8');
const tick=()=>new Promise(r=>setTimeout(r,0));
const fixtures={account:{role:'viewer'},people:[{id:'p',name:'Test recipient',symbol:'*'}],gifts:[
 {id:'open',person:'p',title:'Synthetic idea',kind:'idea',reservation_mode:'open-ended',quantity:1},
 {id:'product',person:'p',title:'Synthetic product',kind:'product',reservation_mode:'limited',quantity:1},
 {id:'inspire',person:'p',title:'Synthetic inspiration',kind:'idea',reservation_mode:'inspiration-only',quantity:1}]};
let productUnits=[{gift_id:'product',unit_no:1,status:'reserved',mine:false}];
let units=[],requests=[];
function setup({signedIn=true,approved=true,role='viewer'}={}){
 const dom=new JSDOM(html,{url:'https://example.invalid/christmas-wishlist/',runScripts:'outside-only'}),w=dom.window;
 w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;};
 w.AbortController=globalThis.AbortController;w.setInterval=()=>0;
 if(signedIn)w.localStorage.setItem('badillo-session',JSON.stringify({access_token:'synthetic',refresh_token:'synthetic',expires_at:Date.now()/1000+3600}));
 w.fetch=async(url,opts={})=>{
  requests.push([url,opts.body]);
  if(url==='config.json')return {ok:true,json:async()=>({supabaseUrl:'https://example.supabase.co',publishableKey:'test'})};
  let value;
  if(url.endsWith('/auth/v1/user'))value={email:'test@example.invalid'};
  else if(!approved)return {ok:false,status:403,json:async()=>({message:'Family access required'})};
  else if(url.endsWith('get_wishlist'))value={...fixtures,account:{role}};
  else if(url.endsWith('list_gift_units'))value=productUnits;
  else if(url.endsWith('get_my_selections'))value={gifts:units.length?[fixtures.gifts[0]]:[],units};
  else if(url.endsWith('set_idea_selection')){const b=JSON.parse(opts.body);units=b.p_status==='available'?[]:[{gift_id:b.p_gift_id,unit_no:0,mine:true,status:b.p_status,private_note:b.p_private_note}];value=null;}
  else if(url.endsWith('get_family_photo'))value=null;
  else if(url.endsWith('/auth/v1/logout'))value=null;
  else throw Error('Unexpected request: '+url);
  return {ok:true,json:async()=>value};
 };
 w.eval(editor);w.eval(app);return dom;
}
let d=setup();await tick();await tick();let w=d.window;
const picker = w.document.querySelector('#mobile-person');
picker.value = 'p';
picker.dispatchEvent(new w.Event('change'));
assert.match(w.document.querySelector('#list-title').textContent, /Test recipient/);
assert.equal(w.document.querySelector('#people button[aria-pressed=true]').textContent, '* Test recipient');
w.document.querySelector('#people button').click();
assert.equal(picker.value, 'all');
let cards=[...w.document.querySelectorAll('.card')];
assert.equal(cards.length,3);assert.match(cards[0].textContent,/Open to everyone/);assert.doesNotMatch(cards[0].textContent,/wanted|reserved|unavailable/i);
assert.equal(cards[0].querySelector('button').textContent,'I’m getting something');assert.equal(cards[0].querySelector('button').disabled,false);
assert.equal(cards[1].querySelectorAll('button:enabled').length,0);assert.match(cards[1].querySelector('button:disabled').textContent,/Reserved/);assert.equal(cards[2].querySelectorAll('button').length,0);
cards[0].querySelector('button').click();assert.equal(w.document.querySelector('#idea-dialog').open,true);
w.document.querySelector('#idea-note').value='<img src=x onerror=alert(1)> private note';
await w.document.querySelector('#idea-form').onsubmit({preventDefault(){}});await tick();
assert.equal(w.document.querySelector('#idea-dialog').open,false);
cards=[...w.document.querySelectorAll('.card')];assert.match(cards[0].textContent,/You’re getting something/);assert.equal(cards[0].querySelectorAll('img').length,0);
await [...cards[0].querySelectorAll('button')].find(b=>b.textContent==='Mark purchased').onclick();await tick();
assert.match(w.document.querySelector('.card').textContent,/You purchased something/);assert.match(w.document.querySelector('.card').textContent,/Open to everyone/);
w.document.querySelector('#filter').value='available';w.document.querySelector('#filter').onchange();assert.equal(w.document.querySelectorAll('.card').length,2);
w.document.querySelector('#filter').value='all';w.document.querySelector('#filter').onchange();
w.document.querySelector('.card button').click();w.document.querySelector('#idea-note').value='unsaved private draft';
await w.document.querySelector('#logout').onclick();assert.equal(picker.options.length,0);assert.equal(w.document.querySelector('#idea-note').value,'');assert.equal(w.document.querySelector('#idea-dialog').open,false);assert.equal(w.document.querySelectorAll('.card').length,0);d.window.close();
for(const params of [{signedIn:false},{approved:false}]){d=setup(params);await tick();await tick();assert.equal(d.window.document.querySelectorAll('.card').length,0);d.window.close();}
units=[];d=setup({role:'editor'});await tick();await tick();w=d.window;w.document.querySelector('#add-gift').click();assert.equal(w.document.querySelector('#gift-reservation_mode').value,'limited');
w.document.querySelector('#gift-kind').value='idea';w.document.querySelector('#gift-kind').onchange();assert.equal(w.document.querySelector('#gift-reservation_mode').value,'open-ended');assert.equal(w.document.querySelector('#quantity-field').hidden,true);d.window.close();
assert.ok(!requests.some(([url])=>/otp|invite/.test(url)));
console.log('UI checks passed: open availability, notes, purchased, filters, sign-out clearing, signed-out/unapproved, editor defaults, no emails.');

fixtures.people.push({id:'q',name:'Second test recipient'});
fixtures.gifts = [
 {id:'note',person:'p',title:'Game Set',notes:'Includes a floor puzzle',reservation_mode:'open-ended'},
 {id:'product',person:'p',title:'Floor Puzzle',reservation_mode:'limited'},
 {id:'other',person:'q',title:'Wooden Puzzle',reservation_mode:'open-ended'},
 {id:'typo',person:'p',title:'Floor Puzzel',reservation_mode:'open-ended'}
];
d=setup();await tick();await tick();w=d.window;
const field=w.document.querySelector('#gift-search');
const search=query=>{
 field.value=query;
 field.dispatchEvent(new w.Event('input'));
 return [...w.document.querySelectorAll('.card h3')].map(el=>el.textContent);
};
const before=requests.length;
assert.deepEqual(search('Floor Puzzle'),['Floor Puzzle','Game Set','Floor Puzzel']);
assert.ok(search('puzz').includes('Floor Puzzle'));
assert.deepEqual(search('puzzel').slice(0,2),['Floor Puzzel','Floor Puzzle']);
const select=w.document.querySelector('#mobile-person');
select.value='p';select.dispatchEvent(new w.Event('change'));
w.document.querySelector('#filter').value='available';w.document.querySelector('#filter').onchange();
assert.deepEqual(search('puzzle'),['Game Set','Floor Puzzel']);
assert.deepEqual(search('missing term'),[]);
assert.match(w.document.querySelector('#gifts').textContent,/No matching gifts/);
w.document.querySelector('#clear-search').click();
assert.equal(field.value,'');
assert.equal(select.value,'p');
assert.equal(w.document.querySelector('#filter').value,'available');
assert.equal(requests.length,before);
search('puzzle');await w.document.querySelector('#logout').onclick();
assert.equal(field.value,'');assert.equal(w.document.querySelector('#search-count').textContent,'');
d.window.close();
console.log('Gift search ranking, typing, combined filters, clearing, and sign-out passed.');

fixtures.gifts.find(g=>g.id==='product').quantity=3;
productUnits=['purchased','reserved','available'].map((status,i)=>({gift_id:'product',unit_no:i+1,status,mine:false}));
for(const lastStatus of ['available','reserved','available']){
 productUnits[2].status=lastStatus;
 d=setup();await tick();await tick();w=d.window;
 const card=()=>[...w.document.querySelectorAll('.card')].find(c=>c.querySelector('h3').textContent==='Floor Puzzle');
 const remaining=Number(lastStatus==='available');
 assert.equal(card().querySelector('.gift-status-notice strong').textContent,remaining+' of 3 available');
 assert.equal(card().querySelector('.availability-detail').textContent,(2-remaining)+' reserved · 1 purchased');
 const filter=w.document.querySelector('#filter');filter.value='available';filter.onchange();
 assert.equal(Boolean(card()),Boolean(remaining));
 d.window.close();
}
console.log('Partial availability, last claim, and release passed.');
