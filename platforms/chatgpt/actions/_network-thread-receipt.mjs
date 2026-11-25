// Exact, scoped ChatGPT creation response correlation. Do not match titles,
// sidebar entries, arbitrary WebSocket IDs, or inspect rendered message text.
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const normalize=s=>s.replace(/\r\n/g,'\n').trim();
function requestMatches(raw,prompt){
  if(typeof raw!=='string')return false;
  try{
    const p=JSON.parse(raw);
    if(p.conversation_id||p.conversationId||p.action!=='next'||!Array.isArray(p.messages))return false;
    const users=p.messages.filter(m=>m?.author?.role==='user');
    if(users.length!==1)return false;
    const parts=users[0].content?.parts;
    return Array.isArray(parts)&&parts.filter(x=>typeof x==='string').length===1&&
      normalize(parts.find(x=>typeof x==='string'))===normalize(prompt);
  }catch{return false}
}
function idsFromStream(body){
  const ids=new Set();
  // The actual HTTP stream emits JSON data records. Accept explicit ID fields
  // only; ignore text embedded in model/user content. Require complete lines.
  const lines=String(body||'').split(/\r?\n/);
  if(!/\n$/.test(body||''))lines.pop();
  for(const line of lines){
    if(!line.startsWith('data:'))continue;
    let p;try{p=JSON.parse(line.slice(5).trim())}catch{continue}
    if(!p||typeof p!=='object')continue;
    for(const value of [p.conversation_id,p.conversationId,p.v?.conversation_id,p.v?.conversationId,p.message?.conversation_id]){
      if(typeof value==='string'&&uuid.test(value))ids.add(value);
    }
    if(typeof p.p==='string'&&/(?:^|\/)conversation_id$/.test(p.p)&&typeof p.v==='string'&&uuid.test(p.v))ids.add(p.v);
  }
  return ids;
}
export function networkThreadReceipt(snapshot,prompt){
  if(!snapshot||snapshot.overflow||snapshot.requests?.length!==1)return null;
  const r=snapshot.requests[0];
  if(r.ambiguous||r.truncated||!Number.isFinite(r.status)||r.status<200||r.status>=300||
    !/text\/event-stream/i.test(r.mime||'')||!requestMatches(r.post_data,prompt))return null;
  const ids=idsFromStream(r.body);
  if(ids.size!==1)return null;
  const thread_id=[...ids][0];
  return {thread_id,thread_url:'https://chatgpt.com/c/'+thread_id};
}
