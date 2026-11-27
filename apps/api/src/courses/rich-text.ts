import sanitizeHtml from 'sanitize-html';
import { calloutClasses, calloutKindOf } from '@speakukrainian/shared';

/**
 * Rich text written in the control panel's editor (the course summary) and
 * shown to students and visitors: in the student app, on the public site and,
 * as text, in Stripe Checkout.
 *
 * The editor only produces a handful of elements, and only those are kept;
 * the one `div` allowed is a highlight block (see `rich-text-callouts.ts` in
 * the shared package).
 * Everything else is dropped before the HTML reaches the database, so what is
 * stored is safe to insert into any page as it is: no scripts, no event
 * handlers, no styles, no `javascript:` links, no iframes.
 */
const RICH_TEXT_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [
    'p',
    'br',
    'h2',
    'h3',
    'strong',
    'em',
    'u',
    's',
    'ul',
    'ol',
    'li',
    'blockquote',
    'a',
    'img',
    'video',
    // Only as a highlight block (`callout`); any other div is unwrapped below.
    'div',
  ],
  allowedAttributes: {
    div: ['class'],
    a: ['href', 'target', 'rel'],
    img: ['src', 'alt', 'title'],
    video: ['src', 'controls', 'poster', 'title'],
  },
  // Links may also write an e-mail; media only ever loads from the web.
  allowedSchemes: ['http', 'https'],
  allowedSchemesByTag: { a: ['http', 'https', 'mailto'] },
  allowedSchemesAppliedToAttributes: ['href', 'src', 'poster'],
  allowProtocolRelative: false,
  // Contents of anything not allowed are kept as text, except these, whose
  // contents are never text a reader should see.
  nonTextTags: ['script', 'style', 'textarea', 'option', 'noscript', 'iframe', 'object'],
  disallowedTagsMode: 'discard',
  transformTags: {
    // Bold and italic arrive as either spelling; store one.
    b: 'strong',
    i: 'em',
    // A heading level the summary does not use becomes the closest one.
    h1: 'h2',
    h4: 'h3',
    h5: 'h3',
    h6: 'h3',
    a: (tagName, attribs) => {
      const attributes: sanitizeHtml.Attributes = {};
      if (attribs['href']) {
        attributes['href'] = attribs['href'];
      }
      // A link that opens a tab must not hand that tab a handle on this one.
      if (attribs['target'] === '_blank') {
        attributes['target'] = '_blank';
        attributes['rel'] = 'noopener noreferrer';
      }
      return { tagName, attribs: attributes };
    },
    // A video without controls cannot be played: always give it some.
    video: (tagName, attribs) => ({ tagName, attribs: { ...attribs, controls: '' } }),
    // A highlight block keeps exactly its two classes. A div that is not one
    // becomes a tag nobody allows, which `discard` removes while keeping its
    // contents: pasted layout divs vanish, their text stays.
    div: (_tagName, attribs): sanitizeHtml.Tag => {
      const kind = calloutKindOf(attribs['class']);
      return kind
        ? { tagName: 'div', attribs: { class: calloutClasses(kind) } }
        : { tagName: 'unwrapped-div', attribs: {} };
    },
  },
  exclusiveFilter: (frame) =>
    // Media without a usable address is an empty box; a link without one is text.
    (frame.tag === 'img' || frame.tag === 'video') && !frame.attribs['src'],
};

/** Empty paragraphs at the start or the end; the editor leaves one after a picture or video. */
const EDGE_EMPTY_PARAGRAPHS = /^(?:\s*<p>(?:\s|<br \/>)*<\/p>)+|(?:<p>(?:\s|<br \/>)*<\/p>\s*)+$/g;

/** The rich text with everything outside the allowlist removed; trimmed. */
export function sanitizeRichText(html: string): string {
  const clean = sanitizeHtml(html, RICH_TEXT_OPTIONS).replace(EDGE_EMPTY_PARAGRAPHS, '').trim();
  // The editor's idea of "empty" is an empty paragraph.
  return isBlank(clean) ? '' : clean;
}

/** Longest text `richTextToPlain` returns unless told otherwise. */
export const PLAIN_TEXT_LENGTH = 300;

const BLOCK_END = /<\/(?:p|h[1-6]|li|blockquote|ul|ol|div)>|<br\s*\/?>/gi;

/**
 * What the rich text says, as one line of plain text: for course cards,
 * Stripe's product description and anything else that cannot show HTML.
 * Paragraphs become spaces, images and videos disappear, entities are
 * decoded, and the result is cut to `maxLength` characters at a word
 * boundary, with an ellipsis when something was cut.
 */
export function richTextToPlain(html: string, maxLength = PLAIN_TEXT_LENGTH): string {
  const spaced = html.replace(BLOCK_END, '$& ');
  const escaped = sanitizeHtml(spaced, {
    allowedTags: [],
    allowedAttributes: {},
    nonTextTags: RICH_TEXT_OPTIONS.nonTextTags ?? [],
  });
  const text = decodeEscapes(escaped).replace(/\s+/g, ' ').trim();
  return shorten(text, maxLength);
}

/** Wraps text typed before the summary was rich text, so it reads the same as HTML. */
export function plainTextToRichText(text: string): string {
  const paragraphs = text
    .split(/\r?\n\s*\r?\n/)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph !== '');
  return paragraphs
    .map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\r?\n/g, '<br>')}</p>`)
    .join('');
}

function isBlank(html: string): boolean {
  return !/<(?:img|video)\b/i.test(html) && richTextToPlain(html, Number.MAX_SAFE_INTEGER) === '';
}

function shorten(text: string, maxLength: number): string {
  if (text.length <= maxLength) {
    return text;
  }
  const cut = text.slice(0, maxLength - 1);
  const lastSpace = cut.lastIndexOf(' ');
  // Only back up to a space when that keeps most of the text.
  const end = lastSpace > maxLength * 0.6 ? lastSpace : cut.length;
  return `${cut.slice(0, end).trimEnd()}…`;
}

/** sanitize-html leaves text escaped; these are the escapes it writes. */
function decodeEscapes(text: string): string {
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * A rich-text field (the summary, the description) as it is stored: sanitized
 * HTML. Text with no markup at all (an older client, or a script) is taken as
 * plain text and turned into paragraphs instead of being read as HTML.
 */
export function toStoredRichText(input: string): string {
  return /<[a-z!/]/i.test(input) ? sanitizeRichText(input) : plainTextToRichText(input);
}
