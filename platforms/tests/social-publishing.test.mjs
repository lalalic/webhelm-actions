import test from "node:test";
import assert from "node:assert/strict";
import inspectTikTok from "../tiktok/actions/_inspect.mjs";
import inspectYoutube from "../youtube/actions/_inspect.mjs";
import monitorTikTok from "../tiktok/actions/_monitor.mjs";
import monitorYoutube from "../youtube/actions/_monitor.mjs";
import postTikTok from "../tiktok/actions/_post.mjs";
import postYoutube from "../youtube/actions/_post.mjs";

function ui(initial, response, scriptCheck = false) {
  let page = initial;
  const navigations = [];
  let writes = 0;
  const helpers = {
    goto_url: async url => { navigations.push(url); page = typeof response.url === "function" ? response.url(url) : response.url || url; },
    page_info: async () => ({ url: page, title: "" }),
    js: async src => {
      if (scriptCheck) assert.doesNotThrow(() => new Function("document", "return (" + src + ")"));
      return typeof response.data === "function" ? response.data(src) : response.data;
    },
    new_tab: async () => { writes++; },
    upload_file: async () => { writes++; },
    click: async () => { writes++; },
  };
  return { helpers, navigations, writes: () => writes };
}

test("TikTok inspect fails closed at sign-in redirect", async () => {
  const v = ui("about:blank", { url: "https://www.tiktok.com/login?redirect_url=tiktokstudio" });
  const out = await inspectTikTok({ helpers:v.helpers });
  assert.equal(out.reason, "login_required");
  assert.equal(out.upload_ready, false);
  assert.equal(v.writes(),0);
});

test("TikTok inspect checks exact account and upload availability", async () => {
  const v = ui("about:blank", { data: { handle:"@lalalic001", upload:true } });
  const ok = await inspectTikTok({ helpers:v.helpers,config:{expected_handle:"lalalic001"} });
  assert.equal(ok.status,"ready");
  assert.equal(ok.published_tested,false);
  assert.equal(v.writes(),0);
  const mismatch = await inspectTikTok({ helpers:v.helpers,config:{expected_handle:"someone-else"} });
  assert.equal(mismatch.reason,"account_mismatch");
});

test("YouTube inspect fails closed on Chrome error and channel mismatch", async () => {
  const b = ui("about:blank",{url:"chrome-error://chromewebdata/"});
  assert.equal((await inspectYoutube({helpers:b.helpers})).reason,"browser_navigation_error");
  const y = ui("about:blank",{url:"https://studio.youtube.com/channel/UC123/dashboard",data:{upload:true}});
  assert.equal((await inspectYoutube({helpers:y.helpers,config:{expected_channel_id:"OTHER"}})).reason,"account_mismatch");
  assert.equal((await inspectYoutube({helpers:y.helpers,config:{expected_channel_id:"UC123"}})).status,"ready");
  assert.equal(y.writes(),0);
});

test("TikTok monitor lists only observed posts, never fabricates zero counts", async () => {
  const sample = [{url:"https://www.tiktok.com/@lalalic001/video/123",summary:"Demo posted\n4 views"}];
  const v = ui("about:blank",{data: sample},true);
  const out = await monitorTikTok({helpers:v.helpers,config:{mode:"posts"}});
  assert.equal(out.status,"ok");
  assert.deepEqual(out.posts,sample);
  const empty = ui("about:blank",{data:[]});
  assert.equal((await monitorTikTok({helpers:empty.helpers})).status,"unverified");
  assert.equal(v.writes(),0);
});

test("TikTok comments report unverified when UI rows absent", async () => {
  const v=ui("about:blank",{data:[]});
  const out=await monitorTikTok({helpers:v.helpers,config:{mode:"comments"}});
  assert.equal(out.reason,"comment_rows_not_found");
  assert.deepEqual(out.comments,[]);
});

test("YouTube monitor keeps channel identity and reads observed posts/comments", async () => {
  const v=ui("about:blank",{
    url:url=>url==="https://studio.youtube.com/"?"https://studio.youtube.com/channel/UC123":url,
    data:[{title:"Story",url:"https://www.youtube.com/watch?v=abc",summary:"Story 3 views"}]
  },true);
  const out=await monitorYoutube({helpers:v.helpers,config:{mode:"posts",expected_channel_id:"UC123"}});
  assert.equal(out.status,"ok");
  assert.equal(out.channel_id,"UC123");
  assert.equal(out.content_type,"shorts");
  assert.ok(v.navigations.some(x => x.includes("/videos/short")));
  assert.equal(out.posts.length,1);
  assert.equal(v.writes(),0);
});
test("YouTube monitor refuses different channel and login failure", async () => {
  const v=ui("about:blank",{url:url=>"https://studio.youtube.com/channel/UC123"});
  assert.equal((await monitorYoutube({helpers:v.helpers,config:{expected_channel_id:"different"}})).reason,"account_mismatch");
  const login=ui("about:blank",{url:"https://accounts.google.com/signin"});
  assert.equal((await monitorYoutube({helpers:login.helpers})).reason,"login_required");
});
test("Publishing Actions require explicit authorization before any browser operation",async () => {
  for(const post of [postTikTok,postYoutube]){
    const v=ui("about:blank",{data:null});
    await assert.rejects(post({helpers:v.helpers,config:{video:"/tmp/none.mp4"},log:()=>{}}),/confirm_publish/);
    assert.equal(v.navigations.length,0);
    assert.equal(v.writes(),0);
  }
});
test("Monitor invalid mode fails before navigation",async () => {
  for(const monitor of [monitorTikTok,monitorYoutube]){
    const v=ui("about:blank",{data:[]});
    await assert.rejects(monitor({helpers:v.helpers,config:{mode:"delete"}}),/Unsupported/);
    assert.equal(v.navigations.length,0);
  }
});
