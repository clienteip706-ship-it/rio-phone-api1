# Spotify oficial Deluxe
Esta versão remove a reprodução por YouTube. Usa login individual PKCE e Web Playback SDK; não entrega MP3 para playSound/3D do MTA.

1. Envie server.js, Dockerfile, package.json, package-lock.json e a pasta public para a raiz do repositório GitHub conectado ao Railway. Não envie .env ou node_modules.
2. No Spotify Developer Dashboard > aplicação > Settings > Redirect URIs adicione exatamente:
https://rio-phone-api1-production.up.railway.app/callback
3. Mantenha SPOTIFY_CLIENT_ID nas Variables do serviço Railway. O player PKCE não utiliza o Client Secret.
4. Aplique o deploy e abra https://rio-phone-api1-production.up.railway.app/player no Chrome ou Edge.
5. Clique Entrar com Spotify e autorize sua conta Premium. Em Development Mode, autorize o usuário nas permissões da aplicação, se necessário.
6. Busque uma música e clique nela. Ative mídia protegida no navegador se houver erro de DRM.

O áudio é individual no navegador. Integração com o navegador interno do MTA depende da compatibilidade com mídia protegida, ainda não verificada. Não transmite para jogadores próximos. Rotas antigas /search /resolve /play retornam 409 indicando que login no player é necessário.
Tokens ficam apenas na sessão da aba do navegador. Sair apaga a sessão local. O usuário pode revogar autorização no Spotify.
