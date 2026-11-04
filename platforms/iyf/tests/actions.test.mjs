import test from 'node:test';
import assert from 'node:assert/strict';
import search,{validateIyfQuery} from '../actions/_search.mjs';
import episodes,{validateShowId} from '../actions/_episodes.mjs';

test('IYF search rejects empty/oversized search queries',()=>{
  assert.equal(validateIyfQuery('  沙丘 '),'沙丘');
  assert.throws(()=>validateIyfQuery(' '));
  assert.throws(()=>validateIyfQuery('x'.repeat(81)));
});
test('IYF title search discards unrelated recommendations, verifies website IDs',async()=>{
  const opened=[];
  const h={
    goto_url:async u=>opened.push(u),wait_for_load:async()=>{},
    js:async()=>[
      {title:'沙丘2',show_id:'E9ic51wfB93',url:'https://www.iyf.tv/play/E9ic51wfB93'},
      {title:'沙丘：预言',show_id:'xKLAIe7Zrp6',url:'https://www.iyf.tv/play/xKLAIe7Zrp6'},
    ]
  };
  const result=await search({config:{query:'沙丘'},helpers:h});
  assert.equal(result.ok,true);assert.equal(result.matches.length,2);
  assert.deepEqual(opened,['https://www.iyf.tv/search/%E6%B2%99%E4%B8%98']);
});
test('IYF episode ID must be a show key, not a guessed slug',()=>{
  assert.equal(validateShowId('xKLAIe7Zrp6'),'xKLAIe7Zrp6');
  assert.throws(()=>validateShowId('bad?x=1'));
  assert.throws(()=>validateShowId('../../other'));
});
test('IYF episode Action extracts and deduplicates verified links',async()=>{
  const links=[
    {title:'01',episode_id:'fcQyIHpDEL0',show_id:'xKLAIe7Zrp6',url:'https://www.iyf.tv/play/xKLAIe7Zrp6?id=fcQyIHpDEL0'},
    {title:'02',episode_id:'3WnKPQ33ME6',show_id:'xKLAIe7Zrp6',url:'https://www.iyf.tv/play/xKLAIe7Zrp6?id=3WnKPQ33ME6'},
    {title:'02',episode_id:'3WnKPQ33ME6',show_id:'xKLAIe7Zrp6',url:'https://www.iyf.tv/play/xKLAIe7Zrp6?id=3WnKPQ33ME6'}
  ];
  const h={goto_url:async()=>{},wait_for_load:async()=>{},js:async()=>links};
  const result=await episodes({config:{show_id:'xKLAIe7Zrp6'},helpers:h});
  assert.equal(result.episodes.length,2);
  assert.equal(result.episodes[1].episode_id,'3WnKPQ33ME6');
});
