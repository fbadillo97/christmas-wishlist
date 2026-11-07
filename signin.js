// Keep sign-in usable even if wishlist loading fails.
(() => {
 const $ = selector => document.querySelector(selector);
 const message = value => String(value || 'Unknown error').replace(/https?:\/\/[^\s]+/g,'[address omitted]').replace(/[A-Za-z0-9_=-]{40,}/g,'[details omitted]').slice(0,240);
 const feedback = (text, isError = true) => {
  const safe=message(text);
  for(const selector of ['#signin-error','#auth-message']) {
   const target=$(selector);
   if(target){target.textContent=text?safe:'';target.classList.toggle('error',isError);}
  }
 };
 window.wishlistAuthFeedback=feedback;
 $('#login').onsubmit=event=>{event.preventDefault();feedback('Sign-in is still loading. Please wait a moment, or refresh if this message persists.');};
 const dialog=$('#signin-dialog');
 $('#signin').addEventListener('click',() => {
  try {
   if(typeof dialog.showModal==='function'){if(!dialog.open)dialog.showModal();}
   else {dialog.setAttribute('open','');dialog.scrollIntoView({block:'center'});}
   $('#email').focus();
  } catch(error){feedback('Could not open sign-in: '+error.message);}
 });
 $('#close-signin').addEventListener('click',() => {
  if(typeof dialog.close==='function')dialog.close();else dialog.removeAttribute('open');
 });
 window.addEventListener('error',event => {
  if(event.error)feedback('A page error stopped sign-in: '+event.error.message);
  else if(event.target?.tagName==='SCRIPT')feedback('The sign-in code could not load. Refresh the page and try again.');
 },true);
 window.addEventListener('unhandledrejection',event=>feedback('Sign-in could not finish: '+(event.reason?.message||'Unexpected page error.')));
})();
