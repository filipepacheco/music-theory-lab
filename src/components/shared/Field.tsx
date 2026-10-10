import type { InputHTMLAttributes } from 'react';

interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  /** A glyph before the input, for example `>`. Decoration only. */
  prompt?: string;
}

/**
 * The Lighthouse text input. It has no visible label, so give it an
 * `aria-label` or a label of your own.
 */
export default function Field({ prompt, className, ...rest }: FieldProps) {
  const input = (
    <input
      className={['lh-input', className].filter(Boolean).join(' ')}
      {...rest}
    />
  );
  if (!prompt) return input;

  return (
    <label className="lh-field">
      <span aria-hidden>{prompt}</span>
      {input}
    </label>
  );
}
