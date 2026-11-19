import test from 'node:test';
import assert from 'node:assert/strict';
import research,{parseMetric} from '../actions/_research.mjs';
const profile='https://www.xiaohongshu.com/user/profile/60d93722000000000101ff82';
const id1='6af52fac000000001803a731';
const id2='6afdaa6b000000002b01be7f';
const cards=[
 {note_id:id1,title:'First saved post',author:'A',collected:true,likes_display:'2.4万',source_url:`https://www.xiaohongshu.com/explore/${id1}`},
 {note_id:id2,title:'Second saved post',author:'B',collected:true,likes_display:'99',source_url:`https://www.xiaohongshu.com/explore/${id2}`},
];
function harness(details={}){
 const calls=[];let url='https://www.xiaohongshu.com/explore',active=null;
 const h={
   calls,
   goto_url:async u=>{calls.push(['goto',u]);url=u;active=null;},
   wait_for_load:async()=>{},
   page_info:async()=>({url,title:'XHS',readyState:'complete'}),
   js:async source=>{
    calls.push(['js',source.slice(0,90)]);
    if(source.includes('window.scrollTo'))return true;
    if(source.includes("const a=[...document.querySelectorAll('a[href*="))return profile;
    if(source.includes("section.note-item[data-note-id]"))return cards;
    if(source.includes('a.click();return true;')){
      const match=source.match(/c\.getAttribute\('data-note-id'\)===\"([a-f0-9]+)\"/);
      if(!match)return false;
      active=match[1];url=`https://www.xiaohongshu.com/explore/${active}?xsec_token=PRIVATE`;
      return true;
    }
    if(source.includes("const mask=document.querySelector('.note-detail-mask')")){
      return details[active]??{found:true,ready:false,loading:true,likes_display:'99',saves_display:'',comments_display:null,sample:[]};
    }
    throw Error('Unexpected browser script '+source.slice(0,110));
   }
 };
 return {h,calls};
}
const detail=(comments,likes='3.4万',saves='1.1万')=>({found:true,ready:true,heading:'Selected',body:'An original note',
 likes_display:likes,saves_display:saves,comments_display:comments,comments_header:`共 ${comments} 条评论`,
 comment_button_display:comments,media:{type:'video',video_source_available:true,
 video_source_host:'sns-video-v28.xhscdn.com',video_source_url:'https://sns-video-v28.xhscdn.com/private-signed-token',
 duration_seconds:72,embedded_caption_tracks:0},sample:[{dom_index:0,comment_id:'sample-1',text:'这是我的看法',time:'刚刚',is_reply:false,reply_label:''},
 {dom_index:1,comment_id:'sample-2',text:'我不同意',time:'昨天',is_reply:true,reply_label:''}],visible_comment_count:2});

test('metric parser preserves literal counts and identifies abbreviations without conflating likes',()=>{
 assert.deepEqual(parseMetric('1.2万'),{raw:'1.2万',value:12000,approximate:true});
 assert.deepEqual(parseMetric('3.5k'),{raw:'3.5k',value:3500,approximate:true});
 assert.deepEqual(parseMetric('1,200'),{raw:'1,200',value:1200,approximate:false});
 assert.equal(parseMetric('赞').value,null);
 assert.equal(parseMetric('').value,null);
});
test('invalid configuration rejects before any browser action',async()=>{
 const {h,calls}=harness();
 for(const c of [
  {operation:'other'}, {operation:'post'}, {operation:'post',note_url:'https://evil.example/explore/'+id1},
  {operation:'post',note_url:'https://www.xiaohongshu.com/explore/'+id1+'/?secret=x'},
  {scan_limit:61}, {comment_limit:0},{detail_wait_ms:500}, {min_comments_exclusive:0.5},
 ])await assert.rejects(research({config:c,helpers:h}),/must|requires|invalid/i);
 assert.equal(calls.length,0);
});
test('saved-post research verifies labelled comment total, stops at first >1000, and samples only displayed DOM',async()=>{
 const {h,calls}=harness({[id1]:detail('9','2.4万','500'),[id2]:detail('1.3万','99','5000')});
 const r=await research({config:{operation:'collections',scan_limit:2,min_comments_exclusive:1000,comment_limit:1},helpers:h});
 assert.equal(r.ok,true);assert.equal(r.status,'complete');assert.equal(r.attempted_detail_count,2);
 assert.equal(r.inspected[0].metrics.comments.value,9);
 assert.equal(r.inspected[0].metrics.likes.value,24000);
 assert.equal(r.selected.note_id,id2);assert.equal(r.selected.metrics.comments.value,13000);
 assert.equal(r.selected.metrics.saves.value,5000);
 assert.equal(r.selected.sampled_count,1);
 assert.equal(r.selected.comments_sample[0].text,'这是我的看法');
 assert.equal(r.selected.qualifies_comment_threshold,true);
 assert.equal(r.selected.media.type,'video');
 assert.equal(r.selected.media.duration_seconds,72);
 assert.equal(r.selected.media.stt.status,'not_transcribed');
 assert.equal(r.selected.media.video_source_available,true);
 assert.equal(r.selected.media.video_source_url,undefined,'do not expose potentially signed video URL by default');
 assert.equal(r.source,'signed_in_xhs_browser_visible_dom');
 assert.equal(r.publication_allowed,false);
 assert.equal(calls.some(([verb,u])=>verb==='goto' && /evil/.test(u)),false);
 assert.equal(calls.some(([verb,u])=>verb==='goto' && u.includes('xsec_token')),false);
});
test('video URL requires explicit private STT handoff flag',async()=>{
 const {h}=harness({[id1]:detail('1101')});
 const r=await research({config:{operation:'post',note_id:id1,include_media_url:true},helpers:h});
 assert.equal(r.selected.media.video_source_url,'https://sns-video-v28.xhscdn.com/private-signed-token');
 assert.equal(r.selected.media.stt.status,'not_transcribed');
 assert.equal(r.selected.qualifies_comment_threshold,true);
});
test('loading comments never qualifies a post from likes, nor fabricates comment count',async()=>{
 const {h}=harness({[id1]:{found:true,ready:false,loading:true,likes_display:'2.4万',comments_display:null}});
 const r=await research({config:{operation:'collections',scan_limit:1,detail_wait_ms:1000},helpers:h});
 assert.equal(r.ok,false);assert.equal(r.status,'partial');assert.equal(r.selected,null);
 assert.equal(r.blockers[0].reason,'comment_detail_not_loaded');
 assert.equal(r.attempted_detail_count,1);
 assert.equal(r.inspected.length,0);
});
test('post lookup requires an observed saved card and does not infer other personal posts are saved',async()=>{
 const {h}=harness({[id2]:detail('1000')});
 const r=await research({config:{operation:'post',note_id:id2,scan_limit:1},helpers:h});
 assert.equal(r.status,'complete');assert.equal(r.selected.note_id,id2);
 assert.equal(r.selected.qualifies_comment_threshold,false);
 const miss=await research({config:{operation:'post',note_id:'abcdef123456abcdef123456'},helpers:h});
 assert.equal(miss.status,'not_found');assert.equal(miss.ok,false);
});
