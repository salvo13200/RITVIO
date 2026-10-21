import test from 'node:test';
import assert from 'node:assert/strict';
import {parseTrackReference,ritvioTrackLink,sharedTrackMessage,shareLabel,ritvioSite} from '../packages/domain/track-sharing';

test('shared references round-trip encoded metadata without exposing private track fields',()=>{
 const track={videoId:'abcdefghijk',title:'After the rain',artist:'Luna Vale',thumbnail:'file:///private/cover',streamUrl:'https://signed.invalid?secret=x',lyrics:'private verses',profile:'private-user'};
 const link=ritvioTrackLink(track),url=new URL(link);
 assert.equal(link,ritvioSite+'#track=abcdefghijk&title=After+the+rain&artist=Luna+Vale');
 assert.equal(url.search,'');assert.deepEqual([...new URLSearchParams(url.hash.slice(1)).keys()],['track','title','artist']);
 assert.deepEqual(parseTrackReference(url.hash),{kind:'track',track:{videoId:track.videoId,title:track.title,artist:track.artist}});
 assert.equal(sharedTrackMessage(track),`After the rain — Luna Vale\nShared with RITVIO\n${link}`);
 for(const privateValue of [track.thumbnail,track.streamUrl,track.lyrics,track.profile])assert(!link.includes(privateValue));
});
test('metadata handles accents, literal markup, long titles and missing fields safely',()=>{
 const track={videoId:'abcdefghijk',title:'L’été & <script>🎵</script> #1',artist:'A + B / C'};
 assert.deepEqual(parseTrackReference(new URL(ritvioTrackLink(track)).hash),{kind:'track',track});
 assert.equal(shareLabel(' one\n\u202etwo\u00a0three ',160),'one two three');
 assert.equal(shareLabel('🎵'.repeat(500),160),'🎵'.repeat(160));
 assert.equal(ritvioTrackLink({videoId:'abcdefghijk'}),ritvioSite+'#track=abcdefghijk');
 assert.equal(sharedTrackMessage({videoId:'abcdefghijk'}).split('\n').length,2);
});
test('malformed references never become redirects or provider URLs',()=>{
 for(const hash of ['#track=../bad','#track=https://evil.invalid','#track=abcdefghijk&track=12345678901','#track=abcdefghijk&redirect=https://evil.invalid','#track=abcdefghijk&title=a&title=b','#track=abcdefghijk&token=secret','#track=abcdefghijk&title=%x1','#track=abcdefghijk&title='+ 'x'.repeat(4000)])assert.equal(parseTrackReference(hash).kind,'invalid',hash.slice(0,90));
 for(const hash of ['','#sharing','#downloads'])assert.equal(parseTrackReference(hash).kind,'none');
 for(const videoId of ['', '../bad','https://evil.invalid'])assert.throws(()=>ritvioTrackLink({videoId}));
});
