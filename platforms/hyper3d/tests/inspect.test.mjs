import assert from 'node:assert/strict';
import test from 'node:test';
import inspect from '../actions/_inspect.mjs';

test('requires rodin workspace, no site interactions when unavailable', async () => {
  let called = false;
  const res = await inspect({helpers:{page_info: async () => ({url:'https://hyper3d.ai/login'}),js:async()=>{called=true}}});
  assert.equal(res.status,'blocked');assert.equal(called,false);
});
test('returns only site status, not authenticated user details',async()=>{
  const fake={has_image:true,selected_effort:'Select Effort High',statuses:['Task queued'],generate_visible:false,credit_balance_hint:null};
  const res=await inspect({helpers:{page_info:async()=>({url:'https://hyper3d.ai/workspace/rodin'}),js:async()=>fake}});
  assert.equal(res.status,'ready');assert.equal(res.selected_effort,'Select Effort High');
  assert.deepEqual(res.statuses,['Task queued']);
  assert.equal('email' in res,false);
});
