(function(){
// Room client over WebSocket. Same interface the quiz game uses: presence(), peers(), onPeers(), connected(), leave().
var ws=null,handlers=[],errHandlers=[],snap=[],mine={},myId=null,skew=0,ka=null,closing=false,retry=0,openWaiters=[],timer=null;
function url(){return (location.protocol==="https:"?"wss://":"ws://")+location.host+"/ws"}
function fire(){var s=snap.slice();handlers.forEach(function(h){try{h({peers:s,joined:[],left:[],updated:[]})}catch(e){}})}
function selfEntry(){return{peer:myId||"me",isMe:true,sameTab:true,kind:"viewer",presence:Object.freeze(Object.assign({},mine))}}
function connect(){
  try{ws=new WebSocket(url())}catch(e){schedule();return}
  ws.onopen=function(){retry=0;
    if(Object.keys(mine).length)ws.send(JSON.stringify({type:"presence",patch:mine}))};
  ws.onmessage=function(e){var m;try{m=JSON.parse(e.data)}catch(x){return}
    if(m.type==="hello"){myId=m.id;if(typeof m.now==="number")skew=m.now-Date.now();var w=openWaiters;openWaiters=[];w.forEach(function(f){f(true)})}
    else if(m.type==="peers"){snap=m.peers.map(function(p){if(p.isMe){p.presence=Object.freeze(Object.assign({},mine))}return p});fire()}
    else if(m.type==="error"){errHandlers.forEach(function(h){h({code:m.code})})}};
  ws.onclose=function(){ws=null;if(!closing)schedule()};
  ws.onerror=function(){};
}
function schedule(){retry++;clearTimeout(timer);timer=setTimeout(connect,Math.min(1000*retry,5000))}
function waitOpen(ms){return new Promise(function(res){
  if(ws&&ws.readyState===1&&myId)return res(true);
  var done=false;function f(v){if(!done){done=true;res(v)}}
  openWaiters.push(f);setTimeout(function(){f(false)},ms)})}
var room={
  peers:function(){return snap.length?snap.slice():[selfEntry()]},
  presence:function(p){for(var k in p){if(p[k]===null)delete mine[k];else mine[k]=p[k]}
    snap=snap.filter(function(x){return!x.isMe});snap.unshift(selfEntry());fire();
    if(ws&&ws.readyState===1)ws.send(JSON.stringify({type:"presence",patch:p}));
    return Promise.resolve()},
  onPeers:function(h,eh){handlers.push(h);if(eh)errHandlers.push(eh);
    setTimeout(fire,0);
    return function(){handlers=handlers.filter(function(x){return x!==h});if(eh)errHandlers=errHandlers.filter(function(x){return x!==eh})}},
  now:function(){return Date.now()+skew},  // server-synced clock, so every phone agrees who joined first
  connected:function(){return!!ws&&ws.readyState===1},
  leave:function(){mine={};snap=[]}
};
window.claude={use:async function(n){
  if(n!=="room")return null;
  if(!ws){closing=false;connect()}
  // keep free hosting awake while people are playing
  if(!ka)ka=setInterval(function(){if(Object.keys(mine).length)fetch("/healthz",{cache:"no-store"}).catch(function(){})},240000);
  var ok=await waitOpen(70000);   // free hosting can take ~1 minute to wake up
  return ok?room:null}};
})();
