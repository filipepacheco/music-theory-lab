import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parse } from 'postcss';
import ts from 'typescript';

const css = readFileSync(new URL('./globals.css', import.meta.url), 'utf8');
const stylesheet = parse(css);
const instrumentSources = ['PianoKey', 'BassFret'].map((name) =>
  readFileSync(
    new URL(`../components/instruments/${name}.tsx`, import.meta.url),
    'utf8',
  ),
);
const buttons: ts.JsxOpeningElement[] = [];
for (const source of instrumentSources) {
  const file = ts.createSourceFile(
    'instrument.tsx',
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const visit = (node: ts.Node) => {
    if (
      ts.isJsxOpeningElement(node) &&
      node.tagName.getText(file) === 'button'
    ) {
      buttons.push(node);
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
}

function attributes(button: ts.JsxOpeningElement) {
  return button.attributes.properties.filter(ts.isJsxAttribute);
}

function className(button: ts.JsxOpeningElement) {
  return (
    attributes(button)
      .find((attribute) => attribute.name.getText() === 'className')
      ?.initializer?.getText() ?? ''
  );
}

describe('instrument touch rules', () => {
  it('shares the rules that suppress zoom, selection, callouts and tap flash', () => {
    const rules: Record<string, string>[] = [];
    stylesheet.walkRules('.instrument-touch', (rule) => {
      const declarations: Record<string, string> = {};
      rule.walkDecls((declaration) => {
        declarations[declaration.prop] = declaration.value;
      });
      rules.push(declarations);
    });

    expect(rules).toEqual([
      {
        'touch-action': 'manipulation',
        '-webkit-user-select': 'none',
        'user-select': 'none',
        '-webkit-touch-callout': 'none',
        '-webkit-tap-highlight-color': 'transparent',
      },
    ]);
  });

  it('applies the shared class to white keys, black keys and bass frets', () => {
    expect(buttons).toHaveLength(3);
    for (const button of buttons) {
      expect(className(button)).toMatch(/\binstrument-touch\b/);
    }
    for (const source of instrumentSources) {
      expect(source).not.toMatch(
        /touch-action|touchAction|user-select|userSelect|touch-callout|touchCallout|tap-highlight|tapHighlight|touch-manipulation|select-none/,
      );
    }
  });

  it('keeps note activation on pointer-down for every instrument button', () => {
    expect(buttons).toHaveLength(3);
    for (const button of buttons) {
      const names = attributes(button).map((attribute) =>
        attribute.name.getText(),
      );
      expect(names).toContain('onPointerDown');
      expect(names).not.toContain('onClick');
      expect(names).not.toContain('onTouchStart');
    }
  });

  it('makes the touch class unconditional at both tablet widths', () => {
    stylesheet.walkRules('.instrument-touch', (rule) => {
      expect(rule.parent?.type).toBe('root');
    });
    expect(css).toContain('.instrument-touch');
  });

  it('preserves keyboard focus indicators without suppressing outlines', () => {
    for (const button of buttons) {
      expect(css).toMatch(/:focus-visible/);
      expect(css).toMatch(/outline:/);
      expect(className(button)).not.toMatch(/outline-none|outline-hidden/);
    }
    stylesheet.walkDecls(/^outline(?:-style|-width)?$/, (declaration) => {
      expect(declaration.value).not.toMatch(/^(?:none|0(?:px)?)$/);
    });
  });
});
