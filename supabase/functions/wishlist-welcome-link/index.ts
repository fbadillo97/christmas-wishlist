// Public capability endpoint: the unguessable welcome token reveals only its account greeting.
const origin='https://fbadillo97.github.io';
const headers={'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Headers':'content-type, apikey','Access-Control-Allow-Methods':'POST, OPTIONS','Content-Type':'application/json','Cache-Control':'no-store','Vary':'Origin'};
const reply=(status,data)=>new Response(JSON.stringify(data),{status,headers});
export async function handle(req){
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers});
 if(req.method!=='POST')return reply(405,{message:'Use POST.'});
 if(req.headers.get('origin')&&req.headers.get('origin')!==origin)return reply(403,{message:'Origin is not allowed.'});
 try{
  const text=await req.text();if(text.length>1024)return reply(400,{message:'Invalid welcome link.'});
  let body;try{body=JSON.parse(text);}catch{return reply(400,{message:'Invalid welcome link.'});}
  if(typeof body?.token!=='string'||!/^[0-9a-f]{64}$/.test(body.token))return reply(404,{message:'This welcome link is unavailable. You can still use regular sign-in.'});
  const url=Deno.env.get('SUPABASE_URL'),key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if(!url||!key)return reply(503,{message:'The welcome page is temporarily unavailable. Use regular sign-in.'});
  const result=await fetch(url+'/rest/v1/rpc/wishlist_resolve_welcome_link',{method:'POST',headers:{apikey:key,Authorization:'Bearer '+key,'Content-Type':'application/json'},body:JSON.stringify({p_token:body.token}),signal:AbortSignal.timeout(8000)});
  if(!result.ok)throw Error('Lookup unavailable');const profile=await result.json();
  if(!profile)return reply(404,{message:'This welcome link is unavailable. You can still use regular sign-in.'});
  return reply(200,{email:profile.email,first_name:profile.first_name});
 }catch{return reply(503,{message:'The welcome page could not load. You can still use regular sign-in.'});}
}
Deno.serve(handle);
