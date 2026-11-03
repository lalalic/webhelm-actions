import test from 'node:test';
import assert from 'node:assert/strict';
import metadata, { validateSeriesPair } from '../actions/_metadata.mjs';
const config = {
  provider_url: 'https://cps.reelshort.com/resource-square/detail/6ae3078ebd64a138960b78f8?app=reelshort&book_type=0',
  official_url: 'https://www.reelshort.com/movie/done-being-his-backup-i-chose-my-stepbrother-6ae3078ebd64a138960b78f8',
  expected_title: 'Done Being His Backup: I Chose My Stepbrother',
};
test('requires paired official provider and movie series IDs', () => {
  assert.equal(validateSeriesPair(config).series_id, '6ae3078ebd64a138960b78f8');
  assert.throws(() => validateSeriesPair({...config, official_url: config.official_url.replace('6ae3078ebd64a138960b78f8', '67f790bf2e5020721707e329')}), /series_id_mismatch/);
  assert.throws(() => validateSeriesPair({...config, official_url: 'https://evil.com/movie/fake-6ae3078ebd64a138960b78f8'}), /invalid_official/);
  assert.throws(() => validateSeriesPair({...config, provider_url: 'http://cps.reelshort.com/resource-square/detail/6ae3078ebd64a138960b78f8'}), /invalid_provider/);
});
test('metadata action uses official page only and preserves source', async () => {
  const urls = [];
  const helpers = {
    goto_url: async url => {urls.push(url);},
    js: async () => ({title: config.expected_title, synopsis: 'The official public synopsis describes the main relationships in enough detail to be useful.', episode_count: 28, cast: ['Actor One']}),
  };
  const result = await metadata({config, helpers});
  assert.equal(result.ok, true);
  assert.deepEqual(urls, [config.official_url]);
  assert.equal(result.provenance.kind, 'official_web');
  assert.equal(result.provider_metadata_api, 'not_verified');
  assert.equal(result.speaker_identity, 'not_inferred');
  assert.equal(result.episode_count, 28);
  assert.deepEqual(result.cast_actors_unmapped, ['Actor One']);
});
test('action fails on title mismatch and missing plot', async () => {
  const helpers = {goto_url:async()=>{},js:async()=>({title:'Wrong Drama',synopsis:'This is another official plot but it should not be used for the selected title.'.repeat(2)})};
  const mismatch = await metadata({config,helpers});
  assert.equal(mismatch.ok,false); assert.equal(mismatch.error,'title_mismatch');
});
