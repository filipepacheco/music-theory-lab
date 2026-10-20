# Recuperação de áudio

`src/services/playbackEngine.ts` consulta o estado atual do contexto em cada
chamada de `ensureAudio()`. Se ele não estiver `running`, tenta `Tone.start()`.
Cada chamada inicia sua própria tentativa, mesmo se uma anterior ainda estiver
pendente. Assim, uma retomada automática bloqueada não impede a tentativa no
próximo gesto. O retorno indica se o contexto está executando após a tentativa.

Quando a página volta a ficar visível, o serviço tenta retomar o contexto.
Se o navegador exigir um gesto, o próximo toque no instrumento ou player
chama o desbloqueio novamente. Não é necessário recarregar a página.

O `lookAhead` do relógio é **0,05 s (50 ms)**, antes 0,01 s (10 ms). Essa
pequena margem adicional dá mais tempo ao agendamento de áudio para absorver
atrasos no iPad e reduzir estalos. É um valor inicial: medir em um iPad real
o equilíbrio entre resposta ao toque e estabilidade, inclusive após trocar
de aplicativo, atender uma chamada e abrir a Central de Controle.

Os callbacks de áudio continuam encaminhando atualizações visuais por
`Tone.getDraw().schedule()`. Os samplers em cache vivem durante toda a sessão
e não devem ser descartados na recuperação nem em `stopAll()`.

Teste focado com contexto e relógio falsos:
`npx vitest run src/services/playbackEngine.test.ts`.
