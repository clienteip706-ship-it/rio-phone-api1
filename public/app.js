"use strict";
const $=id=>document.getElementById(id);
let clientId,credentials,deviceId,player,refreshing;
const redirectUri=location.origin+"/callback";
const status=message=>$("status").textContent=message;
const random=()=>Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,"0")).join("");
const store=()=>sessionStorage.setItem("deluxe_spotify_token",JSON.stringify(credentials));
async function tokenRequest(body){
 const r=await fetch("https://accounts.spotify.com/api/token",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams(body),signal:AbortSignal.timeout(15000)});
 const data=await r.json();if(!r.ok)throw Error(data.error_description||data.error||"Falha ao autorizar Spotify.");
 credentials={access_token:data.access_token,refresh_token:data.refresh_token||(credentials&&credentials.refresh_token),expires:Date.now()+data.expires_in*1000};store();return credentials.access_token;
}
async function token(){
 if(!credentials)throw Error("Entre com Spotify novamente.");
 if(Date.now()<credentials.expires-60000)return credentials.access_token;
 if(!refreshing)refreshing=tokenRequest({grant_type:"refresh_token",refresh_token:credentials.refresh_token,client_id:clientId}).finally(()=>refreshing=null);
 return refreshing;
}
async function api(route,options={},retry=true){
 const r=await fetch("https://api.spotify.com/v1"+route,{...options,headers:{Authorization:"Bearer "+await token(),"Content-Type":"application/json",...(options.headers||{})},signal:AbortSignal.timeout(15000)});
 if(r.status===401&&retry){credentials.expires=0;return api(route,options,false);}
 if(r.status===204)return null;
 const d=await r.json();if(!r.ok)throw Error(d.error?.message||"Spotify retornou erro "+r.status);return d;
}
async function login(){
 const verifier=random(),state=random();
 const hash=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(verifier));
 const challenge=btoa(String.fromCharCode(...new Uint8Array(hash))).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/g,"");
 sessionStorage.setItem("deluxe_spotify_login",JSON.stringify({verifier,state,created:Date.now()}));
 location.assign("https://accounts.spotify.com/authorize?"+new URLSearchParams({client_id:clientId,response_type:"code",redirect_uri:redirectUri,code_challenge_method:"S256",code_challenge:challenge,state,scope:"streaming user-read-email user-read-private user-read-playback-state user-modify-playback-state"}));
}
function action(fn){return async()=>{try{await fn();}catch(e){status(e.message);}};}
async function play(uri){
 if(!deviceId)throw Error("Aguarde o player conectar.");
 await api("/me/player/play?device_id="+encodeURIComponent(deviceId),{method:"PUT",body:JSON.stringify({uris:[uri]})});status("Reproduzindo pelo Spotify.");
}
function connect(){
 window.onSpotifyWebPlaybackSDKReady=()=>{
 player=new Spotify.Player({name:"Deluxe Spotify",getOAuthToken:cb=>token().then(cb).catch(e=>status(e.message)),volume:.5});
 for(const name of ["initialization_error","authentication_error","account_error","playback_error"])player.addListener(name,({message})=>status(message));
 player.addListener("ready",({device_id})=>{deviceId=device_id;$("player").hidden=false;status("Conectado. Busque e escolha uma música.");});
 player.addListener("not_ready",()=>{deviceId=null;status("Player desconectado. Recarregue a página.");});
 player.addListener("player_state_changed",state=>{if(state){$("now").textContent=state.track_window.current_track.name;$("toggle").textContent=state.paused?"Reproduzir":"Pausar";}});
 player.addListener("autoplay_failed",()=>status("Clique em Reproduzir para liberar o áudio do navegador."));
 player.connect().then(ok=>{if(!ok)status("Não foi possível conectar o player. Confira mídia protegida no navegador.");});
 };
 const script=document.createElement("script");script.src="https://sdk.scdn.co/spotify-player.js";script.onerror=()=>status("Não foi possível carregar o player oficial.");document.head.appendChild(script);
}
$("login").onclick=action(login);
$("logout").onclick=()=>{if(player)player.disconnect();sessionStorage.removeItem("deluxe_spotify_token");sessionStorage.removeItem("deluxe_spotify_login");location.replace("/player");};
$("toggle").onclick=action(async()=>{if(!player)throw Error("Player indisponível.");await player.activateElement();await player.togglePlay();});
$("previous").onclick=action(()=>player.previousTrack());$("next").onclick=action(()=>player.nextTrack());
$("volume").oninput=action(()=>player.setVolume(Number($("volume").value)/100));
$("search").onsubmit=async event=>{
 event.preventDefault();const button=event.submitter;button.disabled=true;
 try{
  status("Buscando no Spotify…");const d=await api("/search?"+new URLSearchParams({q:$("query").value.trim(),type:"track",limit:"10"}));$("tracks").replaceChildren();
  for(const track of d.tracks.items){const row=document.createElement("button");row.className="track";const cover=track.album.images.at(-1);if(cover){const img=document.createElement("img");img.src=cover.url;img.alt="";row.append(img);}const label=document.createElement("span");label.textContent=track.name;const artist=document.createElement("span");artist.className="artist";artist.textContent=track.artists.map(a=>a.name).join(", ");label.append(artist);row.append(label);row.onclick=action(async()=>{await player.activateElement();await play(track.uri);});$("tracks").append(row);}
  status(d.tracks.items.length?"Escolha uma música.":"Nenhuma música encontrada.");
 }catch(e){status(e.message);}finally{button.disabled=false;}
};
(async()=>{
 try{
  ({clientId}=await (await fetch("/config")).json());if(!clientId)throw Error("Configure SPOTIFY_CLIENT_ID na hospedagem.");
  if(!crypto.subtle||!navigator.requestMediaKeySystemAccess)throw Error("Este navegador não oferece os recursos necessários. Abra no Chrome ou Edge com mídia protegida habilitada.");
  const params=new URLSearchParams(location.search);
  if(params.has("error")){history.replaceState({},"","/player");throw Error("Autorização não concluída: "+params.get("error"));}
  if(params.has("code")){
   const saved=JSON.parse(sessionStorage.getItem("deluxe_spotify_login")||"null");
   if(!saved||saved.state!==params.get("state")||Date.now()-saved.created>600000)throw Error("A autorização expirou. Inicie o login novamente.");
   history.replaceState({},"","/player");sessionStorage.removeItem("deluxe_spotify_login");
   await tokenRequest({grant_type:"authorization_code",code:params.get("code"),redirect_uri:redirectUri,client_id:clientId,code_verifier:saved.verifier});
  }else{try{credentials=JSON.parse(sessionStorage.getItem("deluxe_spotify_token")||"null");}catch{credentials=null;}}
  if(credentials){$("login").hidden=true;$("logout").hidden=false;const profile=await api("/me");if(profile.product!=="premium")throw Error("Esta conta precisa de Spotify Premium.");status("Conectando player oficial…");connect();}
  else{$("login").disabled=false;status("Entre com sua conta Spotify Premium para começar.");}
 }catch(e){status(e.message);$("login").hidden=false;$("login").disabled=!clientId;}
})();
