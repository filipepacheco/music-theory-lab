import type { InputHTMLAttributes } from 'react';

interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  prompt?: string;
}

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
