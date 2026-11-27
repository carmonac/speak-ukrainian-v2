/**
 * Highlight blocks ("callouts") in rich text: a coloured box with a label that
 * marks a key concept, a tip, a warning and so on. Inspired by the Components
 * for Learning (C4L) blocks of Moodle's editor, which the administrator was
 * used to, but drawn here from scratch: our own names, colours and icons.
 *
 * Stored as `<div class="callout callout-<kind>">…</div>` around ordinary
 * blocks (paragraphs, lists, headings, pictures). The label is not part of the
 * HTML: {@link RICH_TEXT_CALLOUT_CSS} draws it, so the stored markup stays
 * minimal and the sanitizer only has to allow one element and two classes.
 *
 * Everything that knows about callouts reads this file: the API's sanitizer,
 * the control panel's editor, the student app and the public site's renderer.
 */

export const CALLOUT_KINDS = [
  'key-concept',
  'tip',
  'reminder',
  'attention',
  'do',
  'dont',
  'example',
  'quote',
  'time',
  'outcomes',
] as const;

export type CalloutKind = (typeof CALLOUT_KINDS)[number];

export interface CalloutStyle {
  kind: CalloutKind;
  /** Shown at the top of the box and in the editor's menu. */
  label: string;
  icon: string;
  /** The accent: the border and the label. The background is a tint of it. */
  color: string;
}

export const CALLOUTS: readonly CalloutStyle[] = [
  { kind: 'key-concept', label: 'Key concept', icon: '🔑', color: '#722ed1' },
  { kind: 'tip', label: 'Tip', icon: '💡', color: '#389e0d' },
  { kind: 'reminder', label: 'Reminder', icon: '📌', color: '#1677ff' },
  { kind: 'attention', label: 'Attention', icon: '⚠️', color: '#d46b08' },
  { kind: 'do', label: 'Do', icon: '✅', color: '#237804' },
  { kind: 'dont', label: "Don't", icon: '🚫', color: '#cf1322' },
  { kind: 'example', label: 'Example', icon: '📝', color: '#08979c' },
  { kind: 'quote', label: 'Quote', icon: '💬', color: '#8c8c8c' },
  { kind: 'time', label: 'Estimated time', icon: '⏱️', color: '#d48806' },
  { kind: 'outcomes', label: 'Learning outcomes', icon: '🎯', color: '#1d39c4' },
];

/** The class every callout carries, besides its kind's. */
export const CALLOUT_CLASS = 'callout';

export function isCalloutKind(value: string): value is CalloutKind {
  return (CALLOUT_KINDS as readonly string[]).includes(value);
}

/** `callout callout-tip`: the classes of a callout of one kind. */
export function calloutClasses(kind: CalloutKind): string {
  return `${CALLOUT_CLASS} ${CALLOUT_CLASS}-${kind}`;
}

/** The kind named by a `class` attribute, or `null` when it names none. */
export function calloutKindOf(classAttribute: string | undefined): CalloutKind | null {
  const classes = (classAttribute ?? '').split(/\s+/);
  if (!classes.includes(CALLOUT_CLASS)) {
    return null;
  }
  for (const name of classes) {
    const kind = name.startsWith(`${CALLOUT_CLASS}-`) ? name.slice(CALLOUT_CLASS.length + 1) : '';
    if (isCalloutKind(kind)) {
      return kind;
    }
  }
  return null;
}

/**
 * A CSS string literal. The icon and the label are joined with no-break
 * spaces because ordinary ones collapse in generated content.
 */
function cssString(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

/**
 * Styles for callouts, wherever rich text is shown. Self-contained (no outer
 * class needed) and readable on light and dark backgrounds: the tint is the
 * accent mixed with transparency, and the text keeps the page's own colour.
 */
export const RICH_TEXT_CALLOUT_CSS = [
  `.${CALLOUT_CLASS} {
  --callout-color: #8c8c8c;
  position: relative;
  margin: 0.9em 0;
  padding: 0.75em 1em 0.8em;
  border-left: 4px solid var(--callout-color);
  border-radius: 8px;
  background: color-mix(in srgb, var(--callout-color) 9%, transparent);
}
.${CALLOUT_CLASS}::before {
  display: block;
  margin-bottom: 0.35em;
  /* Pulled towards the text colour: darker on a light page, lighter on a dark one. */
  color: color-mix(in srgb, var(--callout-color) 70%, currentColor);
  font-size: 0.8em;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}
.${CALLOUT_CLASS} > :last-child {
  margin-bottom: 0;
}
.${CALLOUT_CLASS} img,
.${CALLOUT_CLASS} video {
  margin-left: 0;
}
.${CALLOUT_CLASS}-quote {
  font-style: italic;
  font-size: 1.05em;
}`,
  ...CALLOUTS.map(
    ({ kind, label, icon, color }) =>
      `.${CALLOUT_CLASS}-${kind} { --callout-color: ${color}; }
.${CALLOUT_CLASS}-${kind}::before { content: ${cssString(`${icon}\u00A0\u00A0${label}`)}; }`,
  ),
].join('\n');
