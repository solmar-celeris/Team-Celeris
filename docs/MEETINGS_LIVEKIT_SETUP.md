# Reuniões nativas do Team Celeris

A nova plataforma substitui gradualmente o embed público do Jitsi por uma interface própria com LiveKit SFU e autenticação Supabase. A primeira fase adiciona a persistência das salas e a emissão segura de tokens; a interface WebRTC será conectada em uma etapa seguinte.

## Limite por sala

Cada sala tem limite fixo de 30 participantes. A função `create-meeting-token` consulta os participantes conectados no LiveKit antes de emitir o token. Em cenários de entrada simultânea extrema, o limite deve também ser imposto no servidor SFU/orquestrador, porque uma consulta seguida da emissão de token não é uma operação atômica.

## Infraestrutura necessária

Hospedar uma instância LiveKit própria com HTTPS/WSS público e portas de mídia/UDP configuradas. Para redes restritivas, habilitar TURN/TLS. O endereço informado em `LIVEKIT_URL` deve ser o endereço público `wss://...` usado pelo navegador; a função usa o mesmo host para a API de administração.

Configurar os secrets da Edge Function no Supabase:

- `LIVEKIT_URL`
- `LIVEKIT_API_KEY`
- `LIVEKIT_API_SECRET`

Nunca incluir a chave secreta LiveKit no frontend, no repositório ou em variáveis VITE.

## Publicação da primeira fase

1. Aplicar a migration `20261115150000_native_meetings_livekit.sql`.
2. Publicar a Edge Function `create-meeting-token`.
3. Configurar os três secrets acima.
4. Validar autenticação, sala inexistente/encerrada, membro inativo e bloqueio ao atingir 30 participantes.

## Próximas etapas

- Instalar e fixar `livekit-client` e construir a interface React de pré-entrada, grade de vídeo, microfone, câmera, compartilhamento de tela, chat e lista de participantes.
- Criar e encerrar salas a partir da interface do Team Celeris.
- Testar com 30 clientes reais, redes distintas, mobile e TURN antes de remover qualquer referência ao Jitsi.

O Jitsi permanece ativo no produto até que a nova plataforma esteja implantada e validada.
