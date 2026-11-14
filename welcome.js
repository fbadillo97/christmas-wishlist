(() => {
 const $=s=>document.querySelector(s);
 let api,profile=null,authorized=false,currentEmail='',loading=false,busy=false,operation=0;
 const token=location.hash.slice(1);
 const message=(value,error=false)=>{$('#welcome-message').textContent=value;$('#welcome-message').classList.toggle('error',error);};
 function sync(state){
  authorized=state.authorized;currentEmail=state.email||'';
  if(authorized&&!loading&&!profile){location.replace('./');return;}
  if(authorized&&profile&&currentEmail.toLowerCase()===profile.email.toLowerCase()){location.replace('./');return;}
  $('#welcome-account-warning').hidden=!(authorized&&profile&&currentEmail.toLowerCase()!==profile.email.toLowerCase());
  $('#welcome-send').disabled=busy||loading||!profile||authorized;
 }
 async function ready(){
  const id=++operation;loading=true;$('#welcome-login').hidden=true;message('Opening your personal welcome page…');
  if(!/^[0-9a-f]{64}$/.test(token)){loading=false;message('Open the personal link from your welcome email, or use Sign in at the top right.',true);return;}
  try{
   const result=await api.request('/functions/v1/wishlist-welcome-link',{token},false);
   if(id!==operation)return;
   if(typeof result.email!=='string'||result.email.length>254)throw Error('The welcome page returned an invalid account.');
   profile=result;$('#welcome-title').textContent=result.first_name?'Welcome, '+result.first_name+'!':'Welcome to our family wishlist!';
   $('#welcome-email').value=result.email;$('#email').value=result.email;$('#welcome-login').hidden=false;message('');
  }catch(error){if(id===operation)message(error.message,true);}
  finally{if(id===operation){loading=false;sync({authorized,email:currentEmail});}}
 }
 async function send(event){
  event.preventDefault();if(!profile||busy||authorized)return;
  const id=operation,version=api.getGeneration();busy=true;$('#welcome-send').textContent='Sending…';sync({authorized,email:currentEmail});message('Sending your sign-in link…');
  try{
   await api.request('/auth/v1/otp?redirect_to='+encodeURIComponent(location.origin+'/christmas-wishlist/'),{email:profile.email},false);
   if(id!==operation||version!==api.getGeneration())return;
   message('Check your inbox! Open the new sign-in email on this device and choose the sign-in link to enter the wishlist.');
  }catch(error){if(id===operation&&version===api.getGeneration())message('Could not send your sign-in link: '+error.message,true);}
  finally{if(id===operation){busy=false;$('#welcome-send').textContent='Email me a sign-in link';sync({authorized,email:currentEmail});}}
 }
 function init(bridge){api=bridge;$('#welcome-login').onsubmit=send;$('#welcome-passkey').onclick=()=>$('#passkey-signin').click();$('#welcome-switch').onclick=async()=>{await api.signOut();sync({authorized:false,email:''});};}
 window.wishlistWelcome={init,ready,sync};
})();
