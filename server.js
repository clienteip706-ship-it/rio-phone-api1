const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
require("dotenv").config();
const host = process.env.RIO_SPOTIFY_HOST || "0.0.0.0";
const port = Number(process.env.PORT || 3030);
const clientId = process.env.SPOTIFY_CLIENT_ID || "";
const routes = {"/": ["index.html", "text/html"], "/player": ["index.html", "text/html"], "/callback": ["index.html", "text/html"], "/app.js": ["app.js", "text/javascript"], "/style.css": ["style.css", "text/css"]};
function json(res,status,data){res.writeHead(status,{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"});res.end(JSON.stringify(data));}
const server = http.createServer((req,res)=>{
  const url = new URL(req.url,"http://localhost");
  if(req.method!=="GET")return json(res,405,{error:"method-not-allowed"});
  if(url.pathname==="/health")return json(res,200,{ok:true,provider:"spotify-official",spotifyConfigured:!!clientId,userLoginRequired:true});
  if(url.pathname==="/config")return json(res,200,{clientId}); // Public application identifier; never exposes the secret.
  if(["/resolve","/play","/search"].includes(url.pathname))return json(res,409,{error:"spotify-login-required",message:"Use /player para autorizar sua conta e reproduzir pelo Spotify."});
  const file=routes[url.pathname];if(!file)return json(res,404,{error:"not-found"});
  res.writeHead(200,{"Content-Type":file[1]+"; charset=utf-8","Cache-Control":"no-store","X-Content-Type-Options":"nosniff","Referrer-Policy":"no-referrer","Content-Security-Policy":"default-src 'self'; script-src 'self' https://sdk.scdn.co; connect-src 'self' https://accounts.spotify.com https://*.spotify.com https://*.scdn.co wss://*.spotify.com; img-src 'self' https://*.scdn.co; style-src 'self'; media-src https: blob:; frame-src https://*.spotify.com"});
  fs.createReadStream(path.join(__dirname,"public",file[0])).pipe(res);
});
server.listen(port,host,()=>console.log(`Deluxe Spotify oficial rodando em http://${host}:${port}`));
