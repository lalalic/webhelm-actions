import test from 'node:test';
import assert from 'node:assert/strict';
import {networkThreadReceipt} from '../actions/_network-thread-receipt.mjs';
const id='6b076bbd-2030-83e9-a212-ed07f30ec6b0', other='6b076b36-363c-83ea-8fb8-9c59c6d1105e';
const prompt='fresh task';
const make=(patch={})=>({overflow:false,requests:[{status:200,mime:'text/event-stream',post_data:JSON.stringify({action:'next',messages:[{author:{role:'user'},content:{parts:[prompt]}}]}),body:'data: '+JSON.stringify({conversation_id:id})+'\n\n',...patch}]});
test('correlated SSE yields canonical durable thread receipt without URL',()=>{
  assert.deepEqual(networkThreadReceipt(make(),prompt),{thread_id:id,thread_url:'https://chatgpt.com/c/'+id});
  assert.equal(networkThreadReceipt(make({body:'data: '+JSON.stringify({v:{conversation_id:id}})+'\n\n'}),prompt).thread_id,id);
});
test('reject mismatched input, existing thread, ambiguous request, partial SSE, conflicting IDs and untrusted content',()=>{
  for(const patch of [
    {status:500},{mime:'application/json'},{ambiguous:true},{truncated:true},
    {post_data:'{}'},{post_data:JSON.stringify({action:'next',conversation_id:other,messages:[{author:{role:'user'},content:{parts:[prompt]}}]})},
    {body:'data: '+JSON.stringify({conversation_id:id})},
    {body:'data: '+JSON.stringify({conversation_id:id})+'\n\ndata: '+JSON.stringify({conversation_id:other})+'\n\n'},
    {body:'data: '+JSON.stringify({message:{content:{parts:['conversation_id '+id]}}})+'\n\n'}
  ])assert.equal(networkThreadReceipt(make(patch),prompt),null);
  assert.equal(networkThreadReceipt(make(),'different task'),null);
  const multiple=make();multiple.requests.push(multiple.requests[0]);assert.equal(networkThreadReceipt(multiple,prompt),null);
  assert.equal(networkThreadReceipt({...make(),overflow:true},prompt),null);
});
