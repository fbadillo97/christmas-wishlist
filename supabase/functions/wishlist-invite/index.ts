// No client-supplied redirect, role, actor identity, or email template is trusted.
const origin = 'https://fbadillo97.github.io';
const redirect = origin + '/christmas-wishlist/';
const cors = { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Vary': 'Origin' };
const reply = (status, message) => new Response(JSON.stringify({message}), {status, headers:{...cors,'Content-Type':'application/json','Cache-Control':'no-store'}});
export async function handle(req) {
 if (req.method === 'OPTIONS') return new Response(null,{status:204,headers:cors});
 if (req.method !== 'POST') return reply(405,'Use POST.');
 if (req.headers.get('origin') && req.headers.get('origin') !== origin) return reply(403,'Origin is not allowed.');
 const url = Deno.env.get('SUPABASE_URL'), key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
 if (!url || !key) return reply(503,'Invitation service is unavailable.');
 const authorization = req.headers.get('authorization');
 if (!authorization?.startsWith('Bearer ')) return reply(401,'Please sign in again.');
 const call = (path, body, token = 'Bearer '+key) => fetch(url+path,{method:body===undefined?'GET':'POST',headers:{apikey:key,Authorization:token,'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(8000)});
 let attempt;
 try {
  const auth = await call('/auth/v1/user',undefined,authorization);
  if (!auth.ok) return reply(401,'Please sign in again.');
  const user = await auth.json();
  if (!user.id || !user.email_confirmed_at) return reply(403,'A verified account is required.');
  let body; try { body=await req.json(); } catch { return reply(400,'Invalid request.'); }
  if (typeof body?.email!=='string' || body.email.length>254 || !Number.isInteger(body.revision)) return reply(400,'Choose a saved account and refresh before sending.');
  const claim = await call('/rest/v1/rpc/wishlist_begin_invitation',{p_actor:user.id,p_email:body.email,p_revision:body.revision});
  if (!claim.ok) {const error=await claim.json(); return reply(error.code==='42501'?403:409,error.message || 'Invitation is not allowed.');}
  const target = await claim.json(); attempt=target.attempt;
  // Existing accounts get a fresh sign-in link; new accounts get the Auth invitation.
  // Never fall back to another send after an ambiguous response.
  const sent = await call((target.existing_user?'/auth/v1/otp':'/auth/v1/invite')+'?redirect_to='+encodeURIComponent(redirect),{email:target.email,...(target.existing_user?{create_user:false}:{})});
  const status=sent.ok?'sent':sent.status>=500?'unknown':'failed';
  const recorded=await call('/rest/v1/rpc/wishlist_finish_invitation',{p_attempt:attempt,p_status:status});
  if (!recorded.ok) return reply(502,'Email result could not be recorded. Delivery may have occurred; refresh before resending.');
  if (!sent.ok) return reply(sent.status===429?429:502,status==='unknown'?'Delivery is uncertain. Check with the recipient before resending.':'Email was not sent. Check the email service settings or rate limit before retrying.');
  return reply(200,'Invitation email accepted by the email service. Delivery is not confirmed.');
 } catch {
  if (attempt) { try { await call('/rest/v1/rpc/wishlist_finish_invitation',{p_attempt:attempt,p_status:'unknown'}); } catch {} }
  return reply(502,attempt?'Delivery is uncertain. Refresh and check with the recipient before resending.':'Invitation service could not be reached. Try again later.');
 }
}
Deno.serve(handle);
