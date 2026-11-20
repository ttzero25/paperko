const json = (data, status = 200) => Response.json(data, {status});
export async function route(request, env) {
  const url = new URL(request.url);
  if (url.pathname === '/health') return json({ok:true, analysisConfigured:false});
  if (!env.API_TOKEN) return json({error:'Server authentication is not configured'},503);
  if (request.headers.get('Authorization') !== `Bearer ${env.API_TOKEN}`) return json({error:'Unauthorized'},401);
  if (url.pathname === '/folders' && request.method === 'GET') return json((await env.DB.prepare('SELECT * FROM folders ORDER BY created_at DESC').all()).results);
  if (url.pathname === '/folders' && request.method === 'POST') {
    const {name} = await request.json();
    if (typeof name !== 'string' || !name.trim() || name.length > 100) return json({error:'Invalid folder name'},400);
    const id = crypto.randomUUID();
    await env.DB.prepare('INSERT INTO folders(id,name) VALUES (?,?)').bind(id,name.trim()).run();
    return json({id,name:name.trim()},201);
  }
  if (url.pathname === '/papers' && request.method === 'GET') return json((await env.DB.prepare('SELECT * FROM papers ORDER BY created_at DESC').all()).results);
  if (url.pathname === '/papers' && request.method === 'POST') {
    const form = await request.formData();
    const file = form.get('file');
    if (!(file instanceof File) || file.size > 50*1024*1024 || file.size < 5) return json({error:'PDF required, maximum 50MB'},400);
    if (await file.slice(0,5).text() !== '%PDF-') return json({error:'Invalid PDF signature'},400);
    const id = crypto.randomUUID(), key = `papers/${id}/original.pdf`;
    await env.FILES.put(key,file.stream(),{httpMetadata:{contentType:'application/pdf'}});
    try { await env.DB.prepare('INSERT INTO papers(id,title,object_key) VALUES (?,?,?)').bind(id,file.name,key).run(); }
    catch(error) { await env.FILES.delete(key); throw error; }
    return json({id,title:file.name,status:'uploaded'},201);
  }
  const match = url.pathname.match(/^\/papers\/([a-f0-9-]+)(\/original)?$/);
  if (match) {
    const paper = await env.DB.prepare('SELECT * FROM papers WHERE id=?').bind(match[1]).first();
    if (!paper) return json({error:'Not found'},404);
    if (request.method === 'PATCH' && !match[2]) {
      const {folder_id} = await request.json();
      if (folder_id !== null && (typeof folder_id !== 'string' || !await env.DB.prepare('SELECT id FROM folders WHERE id=?').bind(folder_id).first())) return json({error:'Folder not found'},400);
      await env.DB.prepare('UPDATE papers SET folder_id=? WHERE id=?').bind(folder_id,paper.id).run();
      return json({...paper,folder_id});
    }
    if (request.method === 'GET' && match[2]) {
      const object = await env.FILES.get(paper.object_key);
      return object ? new Response(object.body,{headers:{'Content-Type':'application/pdf','Cache-Control':'private, no-store'}}) : json({error:'File missing'},404);
    }
    if (request.method === 'GET') return json(paper);
  }
  return json({error:'Not found'},404);
}
export default {
  async fetch(request,env) {
    const origin = request.headers.get('Origin');
    if (origin && origin !== env.WEB_ORIGIN) return json({error:'Origin not allowed'},403);
    let response;
    try { response = request.method === 'OPTIONS' ? new Response(null,{status:204}) : await route(request,env); }
    catch(error) { console.error(error); response = json({error:'Request failed'},500); }
    const headers = new Headers(response.headers);
    headers.set('Cache-Control','no-store');
    if(origin) headers.set('Access-Control-Allow-Origin',origin);
    headers.set('Vary','Origin');
    headers.set('Access-Control-Allow-Headers','Authorization, Content-Type');
    headers.set('Access-Control-Allow-Methods','GET, POST, PATCH, OPTIONS');
    return new Response(response.body,{status:response.status,headers});
  }
};
