# Cache offline

## Escolha e limites

O worker pequeno em `offline/worker.js` recebe uma lista de arquivos gerada
por `build/offline.ts`, sem dependência de runtime adicional. A decisão usou
o build local existente: 9 arquivos e 2.568.210 bytes fora da Library.
Os arquivos públicos desta branch somavam 797.003 bytes fora da Library.
O catálogo de áudio pode chegar a aproximadamente 48 MB; não entra na
instalação. Essa separação permite manter a política de cache explícita.

O build gera `/sw.js` com os chunks (inclusive os carregados sob demanda),
HTML, CSS, fontes locais, ícones, manifesto e WASM. Os 156 samples dos seis
presets e os três samples de bateria também são baixados na instalação,
usando as URLs CORS já usadas pelo app. Uma falha nesse download impede a
instalação: o worker anterior continua ativo. É necessário terminar essa
primeira instalação online antes de contar com o modo offline.

Cada arquivo da Library, inclusive o índice e as análises, entra no cache
quando solicitado. Áudio solicitado com Range é baixado inteiro uma vez;
HEAD e novos intervalos podem então ser respondidos offline. Apenas respostas
200 completas, sem redirecionamento e sem HTML entram nesse cache. Erros ou
falta de espaço não impedem o uso online. Arquivos nunca abertos não ficam
disponíveis offline. O cache não cria arquivos de áudio ausentes do deploy.

O worker não intercepta `/api` ou `/intake`, não guarda respostas de sync
e não acessa IndexedDB. Músicas salvas, progressões e estruturas continuam
no banco existente. Cache Storage é separado desse banco. O navegador ainda
pode remover os caches por pressão de armazenamento.

O registro ocorre somente em produção, com escopo `/` e `updateViaCache:
'none'`. O app é publicado na raiz do domínio. `npm run dev` não registra
worker; use outra origem/porta para desenvolvimento se ela já tiver recebido
um worker de produção.

## Atualização

O nome `music-theory-lab-offline-<hash>` depende dos bytes do build, arquivos
públicos, lista de samples e código do worker. Uma versão nova termina sua
instalação e espera as abas da versão anterior fecharem. Na ativação, apaga
somente caches antigos com esse prefixo. Os arquivos da Library precisam ser
abertos novamente após a atualização. Não há reload forçado durante playback.

## Rollback com o kill switch

O responsável pelo deploy executa estes passos; o worker pronto para revisão
está em `offline/kill-switch.js`.

1. Prepare a versão anterior do app, sem o registro do cache offline. Preserve
   `offline/kill-switch.js` deste commit para a operação. Gere o build dessa
   versão pelo processo normal do repositório.
2. **Depois do último build**, copie o kill switch para a mesma URL do worker.
   No diretório que contém o artefato de rollback e o `dist` preparado:

   ```powershell
   Copy-Item -LiteralPath 'offline/kill-switch.js' -Destination 'dist/sw.js' -Force
   ```

3. Publique esse `dist` pelo caminho habitual. Não rode outro build depois da
   cópia. Confirme que `/sw.js` retorna JavaScript com o conteúdo do kill switch,
   status 200, sem redirect, com revalidação HTTP (por exemplo,
   `Cache-Control: no-cache`), nunca a página HTML ou um 404.
4. Em um dispositivo online com a versão defeituosa, abra o app novamente.
   Para uma verificação imediata no console do navegador:

   ```js
   await (await navigator.serviceWorker.getRegistration('/'))?.update();
   ```

   O kill switch chama `skipWaiting`, remove os caches com o prefixo do app,
   assume as páginas abertas e chama `unregister`. Ele não tem handler de
   fetch e não lê nem apaga IndexedDB. Feche e reabra as abas depois disso.

5. Confirme a ausência dos caches do app e do registro; confira que músicas
   salvas, progressões e estruturas continuam disponíveis. Não use “limpar
   dados do site”: isso apagaria o banco que o rollback deve preservar.
6. Mantenha `/sw.js` servindo o kill switch durante o rollback, inclusive para
   dispositivos que ficarem offline por dias. Eles só recebem a correção ao
   voltar à rede. Remover o script ou apenas reverter o app não desinstala o
   worker antigo. Um release corrigido pode voltar a publicar o worker normal.

## Verificação

Automação: `npx vitest run src/offline/offline.test.ts`. Os testes executam os
eventos do worker contra doubles de Cache Storage/rede, com IndexedDB que
lança erro em qualquer acesso. Isso não comprova reprodução audível ou as
políticas de armazenamento do Safari.

Verificação por uma pessoa em um build de produção (`npm run build` e
`npm run preview`, em localhost ou HTTPS):

1. Abra o app online em um perfil limpo. Espere
   `await navigator.serviceWorker.ready` e confirme o worker ativado e os
   downloads de samples concluídos. Nenhum arquivo da Library deve ter sido
   baixado pela instalação.
2. Abra uma música da Library que tenha áudio no deploy e aguarde o download
   completo. Desligue a rede, recarregue o app e toque uma nota com um gesto
   real. Confira piano, outro preset e bateria. Registre navegador/dispositivo
   e resultado audível; o teste automatizado não substitui esse resultado.
3. Reabra a música visitada e faça seek. Um arquivo nunca visitado deve
   continuar indisponível. Confirme que requests de API não aparecem no cache.
4. Volte online, publique uma versão nova pelo processo normal e feche todas
   as abas antigas. Confira a substituição do cache ao reabrir.
5. Um revisor lê `offline/kill-switch.js` e verifica o rollback acima em uma
   origem de teste com dados salvos, antes de usar o procedimento em produção.
