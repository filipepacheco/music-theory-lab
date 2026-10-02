import { useState, type ReactNode } from 'react';
import {
  DEGREE_COLORS,
  FUNCTION_COLORS,
} from '@/components/library/BassTabBar';
import type { DegreeCategory } from '@/domain/bassAnalysis';
import { fieldChords, keyLabel, type MusicalKey } from '@/domain/bassHarmony';

const STORAGE_KEY = 'music-theory-lab:bass-degree-guide';

/** Open unless the viewer closed it before; storage may be unavailable. */
function readOpen(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) !== 'closed';
  } catch {
    return true;
  }
}

function writeOpen(open: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEY, open ? 'open' : 'closed');
  } catch {
    // A private window or blocked storage: the guide just reopens next time.
  }
}

/** Degrees by semitones over the root (§1.1), as a bassist counts frets. */
const DEGREES: {
  label: string;
  frets: string;
  meaning: string;
  category: DegreeCategory;
}[] = [
  { label: 'R', frets: '0', meaning: 'a raiz', category: 'root' },
  {
    label: 'b3',
    frets: '3',
    meaning: '3ª menor → acorde menor',
    category: 'third',
  },
  {
    label: '3',
    frets: '4',
    meaning: '3ª maior → acorde maior',
    category: 'third',
  },
  {
    label: '5',
    frets: '7',
    meaning: '5ª justa → está em quase todo acorde',
    category: 'fifth',
  },
  {
    label: 'b5',
    frets: '6',
    meaning: '5ª diminuta → acorde diminuto',
    category: 'fifth',
  },
  {
    label: '#5',
    frets: '8',
    meaning: '5ª aumentada → acorde aumentado',
    category: 'fifth',
  },
  {
    label: 'b7',
    frets: '10',
    meaning: '7ª menor → acordes com 7 (D7, Dm7)',
    category: 'seventh',
  },
  {
    label: '7',
    frets: '11',
    meaning: '7ª maior → acordes com 7M (Dmaj7)',
    category: 'seventh',
  },
  {
    label: 'bb7',
    frets: '9',
    meaning: '7ª diminuta → só no diminuto (D°7)',
    category: 'seventh',
  },
  {
    label: '9 11 13',
    frets: '2 5 9',
    meaning: 'tensões: notas além da 7ª que dão cor ao acorde',
    category: 'tension',
  },
];

/** Interval shapes on a bass in fourths (E A D G). */
const SHAPES: [string, string][] = [
  ['5ª', 'uma corda acima, 2 casas à frente'],
  ['oitava', 'duas cordas acima, 2 casas à frente'],
  ['3ª menor (b3)', 'uma corda acima, 2 casas atrás'],
  ['3ª maior (3)', 'uma corda acima, 1 casa atrás'],
  ['7ª menor (b7)', 'duas cordas acima, mesma casa'],
  ['7ª maior (7)', 'duas cordas acima, 1 casa à frente'],
];

/** Cadence effects from §4.1. */
const CADENCES: [string, string][] = [
  ['Autêntica (V→I)', 'a mais conclusiva, o “ponto final”'],
  ['Modal (v→i)', 'resolve sem a sensível; soa mais suave'],
  ['Plagal (IV→I)', 'o “amém”, suave'],
  ['Deceptiva (V→vi)', 'prepara a tônica e vai para outro lugar: surpresa'],
  ['Semicadência (→V)', 'a frase para na tensão, como uma vírgula'],
  ['ii–V–I', 'a preparação mais comum do jazz'],
];

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-button border border-border-default bg-bg-card p-3 flex flex-col gap-1.5">
      <h5 className="font-heading text-xs text-text-primary">{title}</h5>
      <div className="flex flex-col gap-1 text-[11px] leading-snug text-text-secondary">
        {children}
      </div>
    </div>
  );
}

/**
 * Beginner's guide to the degree view: what each label, colour and tag
 * means, with the harmonic field of the key in use.
 */
export default function BassDegreeGuide({
  musicalKey,
}: {
  musicalKey: MusicalKey | null;
}) {
  const [open, setOpen] = useState(readOpen);
  return (
    <details
      open={open}
      onToggle={(event) => {
        const next = event.currentTarget.open;
        setOpen(next);
        writeOpen(next);
      }}
      className="rounded-card border border-border-default bg-bg-section"
    >
      <summary className="cursor-pointer select-none px-3 py-2 font-heading text-xs text-text-primary">
        Como ler esta análise — guia para iniciantes
      </summary>
      <div className="grid gap-2 px-3 pb-3 sm:grid-cols-2 xl:grid-cols-3">
        <Card title="R — a raiz">
          <p>
            A nota que dá nome ao acorde do compasso. O app considera raiz a
            nota que o baixo toca no tempo 1.
          </p>
        </Card>

        <Card title="Graus — a distância até a raiz">
          <p>
            Cada nota ganha um nome pela distância até a raiz, contada em casas
            (semitons). Na mesma corda, é só contar as casas a partir da raiz.
          </p>
          <table className="font-heading text-[10px]">
            <thead>
              <tr className="text-text-muted text-left">
                <th className="pr-2 font-normal">grau</th>
                <th className="pr-2 font-normal">casas</th>
                <th className="font-normal">o que indica</th>
              </tr>
            </thead>
            <tbody>
              {DEGREES.map((degree) => (
                <tr key={degree.label}>
                  <td
                    className="pr-2 font-bold whitespace-nowrap"
                    style={{ color: DEGREE_COLORS[degree.category] }}
                  >
                    {degree.label}
                  </td>
                  <td className="pr-2 tabular-nums whitespace-nowrap text-text-muted">
                    {degree.frets}
                  </td>
                  <td className="font-body text-text-secondary">
                    {degree.meaning}
                  </td>
                </tr>
              ))}
              <tr>
                <td className="pr-2" style={{ color: DEGREE_COLORS.ornament }}>
                  cinza
                </td>
                <td className="pr-2 text-text-muted">—</td>
                <td className="font-body text-text-secondary">
                  ornamento: nota de passagem que liga um acorde ao outro; não
                  conta para o acorde
                </td>
              </tr>
            </tbody>
          </table>
        </Card>

        <Card title="No braço (afinação padrão)">
          <p>
            A partir da raiz, “acima” é a corda mais aguda (em direção à G) e “à
            frente” são as casas maiores:
          </p>
          <ul className="flex flex-col gap-0.5">
            {SHAPES.map(([interval, shape]) => (
              <li key={interval}>
                <span className="font-heading text-text-primary">
                  {interval}
                </span>
                : {shape}
              </li>
            ))}
          </ul>
        </Card>

        <Card title="O “?” depois do acorde">
          <p>
            O baixo não tocou notas suficientes para dizer o tipo do acorde.
            Quase sempre falta a 3ª, que decide se ele é maior ou menor.
          </p>
          <p>
            Ex.: <span className="font-heading">D?</span> com só D e A pode ser
            D ou Dm; com D e C (b7), D7 ou Dm7. Quem decide é a guitarra ou o
            teclado: escute a gravação.
          </p>
          <p>
            No ciclo de quintas, um acorde assim aparece no anel que o tom
            sugere, com “?” e mais claro; a mesma raiz com a outra 3ª ganha um
            contorno pontilhado. Teste de ouvido: toque a 3ª menor e a maior por
            cima da música e veja qual soa certa.
          </p>
        </Card>

        <Card title="i, iv, V… — o lugar do acorde no tom">
          <p>
            O algarismo romano diz em que grau do tom está a raiz: I é a tônica,
            V é o 5º grau. Maiúsculo = acorde maior, minúsculo = menor, ° =
            diminuto, ø = meio-diminuto. Sem a 3ª no baixo, vale a qualidade do
            campo harmônico do tom.
          </p>
          {musicalKey && (
            <p className="flex flex-wrap gap-x-2 gap-y-0.5">
              <span className="text-text-muted">
                Campo harmônico de {keyLabel(musicalKey)}:
              </span>
              {fieldChords(musicalKey).map((chord) => (
                <span key={chord.numeral} className="font-heading">
                  <span
                    className="font-bold"
                    style={{ color: FUNCTION_COLORS[chord.func] }}
                  >
                    {chord.numeral}
                  </span>{' '}
                  <span className="text-text-primary">{chord.name}</span>
                </span>
              ))}
            </p>
          )}
        </Card>

        <Card title="Cores — função harmônica">
          <p>
            <span className="font-bold" style={{ color: FUNCTION_COLORS.T }}>
              T Tônica
            </span>
            : repouso, a sensação de “casa”.
          </p>
          <p>
            <span className="font-bold" style={{ color: FUNCTION_COLORS.SD }}>
              SD Subdominante
            </span>
            : afasta da tônica e prepara a tensão.
          </p>
          <p>
            <span className="font-bold" style={{ color: FUNCTION_COLORS.D }}>
              D Dominante
            </span>
            : tensão que pede para voltar à tônica.
          </p>
        </Card>

        <Card title="Cadências — as etiquetas da seção">
          <p>Cadência é o jeito como uma frase musical termina.</p>
          <ul className="flex flex-col gap-0.5">
            {CADENCES.map(([name, effect]) => (
              <li key={name}>
                <span className="font-heading text-text-primary">{name}</span>:{' '}
                {effect}
              </li>
            ))}
          </ul>
        </Card>

        <Card title="Nota sublinhada">
          <p>
            Nota evitada: fica meio tom acima de uma nota do acorde e soa áspera
            quando aparece em destaque (tempo forte ou nota longa). Passando
            rápido, tudo bem.
          </p>
        </Card>

        <Card title="Como o app decide">
          <p>
            Tudo é lido só das notas do baixo. Tempos fortes contam como
            harmonia; passagens, bordaduras, aproximações cromáticas e
            antecipações em tempo fraco são ornamentos. O acorde só é nomeado
            quando as notas tocadas não deixam outra leitura.
          </p>
          <p>
            O tom é sugerido por onde o baixo repousa: compassos na tônica, como
            as seções começam e terminam e chegadas do 5º grau à tônica. Uma
            raiz do campo harmônico mantém a qualidade do campo, a menos que o
            baixo toque uma 3ª, 5ª ou 7ª diferente; só então o acorde é lido
            como dominante secundária, SubV, diminuto ou empréstimo modal.
          </p>
          <p>Passe o mouse num compasso para ver o que foi encontrado nele.</p>
        </Card>
      </div>
    </details>
  );
}
