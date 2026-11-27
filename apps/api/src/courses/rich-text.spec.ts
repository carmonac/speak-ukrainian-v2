import { describe, expect, it } from 'vitest';
import { CALLOUT_KINDS } from '@speakukrainian/shared';
import {
  PLAIN_TEXT_LENGTH,
  plainTextToRichText,
  richTextToPlain,
  sanitizeRichText,
  toStoredRichText,
} from './rich-text.js';

describe('sanitizeRichText', () => {
  it('keeps everything the editor produces', () => {
    const html =
      '<h2>Title</h2><h3>Sub</h3><p><strong>b</strong> <em>i</em> <u>u</u> <s>s</s><br>next</p>' +
      '<ul><li><p>one</p></li></ul><ol><li><p>two</p></li></ol><blockquote><p>q</p></blockquote>' +
      '<p><a href="https://example.com/x" target="_blank" rel="noopener noreferrer">link</a> 👋</p>' +
      '<img src="https://speakukrainian.org/files/1/a.png" alt="A" title="T">' +
      '<video src="https://speakukrainian.org/files/2/v.mp4" controls=""></video>';
    // Same markup; void elements are written self-closed and booleans bare.
    expect(sanitizeRichText(html)).toBe(
      html
        .replace('<br>', '<br />')
        .replace('title="T">', 'title="T" />')
        .replace('controls=""', 'controls'),
    );
  });

  it('removes scripts, styles and iframes with their contents', () => {
    expect(
      sanitizeRichText(
        '<p>a</p><script>alert(1)</script><style>p{}</style><iframe src="https://x">t</iframe><p>b</p>',
      ),
    ).toBe('<p>a</p><p>b</p>');
  });

  it('keeps the text of tags that are not allowed', () => {
    expect(sanitizeRichText('<div><span>hello</span> <font>world</font></div>')).toBe(
      'hello world',
    );
  });

  it('removes event handlers, styles and classes', () => {
    expect(
      sanitizeRichText(
        '<p onclick="x()" style="color:red" class="c">a</p><img src="https://a/b.png" onerror="x()">',
      ),
    ).toBe('<p>a</p><img src="https://a/b.png" />');
  });

  it('drops links and media with dangerous or relative addresses', () => {
    expect(sanitizeRichText('<a href="javascript:alert(1)">x</a>')).toBe('<a>x</a>');
    expect(sanitizeRichText('<a href="data:text/html,hi">x</a>')).toBe('<a>x</a>');
    expect(sanitizeRichText('<a href="//evil.example/">x</a>')).toBe('<a>x</a>');
    expect(sanitizeRichText('<p>a</p><img src="javascript:alert(1)">')).toBe('<p>a</p>');
    expect(sanitizeRichText('<p>a</p><img src="data:image/png;base64,AAAA">')).toBe('<p>a</p>');
    expect(sanitizeRichText('<p>a</p><video src="mailto:a@b.c"></video>')).toBe('<p>a</p>');
    expect(sanitizeRichText('<p>a</p><img>')).toBe('<p>a</p>');
  });

  it('allows mailto links', () => {
    expect(sanitizeRichText('<a href="mailto:hi@example.com">mail</a>')).toBe(
      '<a href="mailto:hi@example.com">mail</a>',
    );
  });

  it('gives links that open a new tab rel=noopener and drops other targets and rels', () => {
    expect(sanitizeRichText('<a href="https://a" target="_blank">x</a>')).toBe(
      '<a href="https://a" target="_blank" rel="noopener noreferrer">x</a>',
    );
    expect(sanitizeRichText('<a href="https://a" target="_top" rel="opener">x</a>')).toBe(
      '<a href="https://a">x</a>',
    );
  });

  it('always shows the controls of a video and keeps only its safe attributes', () => {
    expect(
      sanitizeRichText('<video src="https://a/v.mp4" autoplay muted onplay="x()"></video>'),
    ).toBe('<video src="https://a/v.mp4" controls></video>');
  });

  it('normalises b, i and other heading levels', () => {
    expect(sanitizeRichText('<h1>a</h1><h4>b</h4><p><b>c</b><i>d</i></p>')).toBe(
      '<h2>a</h2><h3>b</h3><p><strong>c</strong><em>d</em></p>',
    );
  });

  it('stores an empty editor as an empty string', () => {
    expect(sanitizeRichText('<p></p>')).toBe('');
    expect(sanitizeRichText('  <p> </p><p><br></p>  ')).toBe('');
    expect(sanitizeRichText('<script>x</script>')).toBe('');
  });

  it('keeps a summary that is only an image', () => {
    expect(sanitizeRichText('<p></p><img src="https://a/b.png">')).toBe(
      '<img src="https://a/b.png" />',
    );
  });

  it('drops empty paragraphs at the start and the end, but not in between', () => {
    expect(
      sanitizeRichText(
        '<p></p><p>a</p><p></p><p>b</p><video src="https://a/v.mp4"></video><p><br></p>',
      ),
    ).toBe('<p>a</p><p></p><p>b</p><video src="https://a/v.mp4" controls></video>');
  });

  it('escapes text that looks like markup after decoding', () => {
    expect(sanitizeRichText('<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>')).toBe(
      '<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>',
    );
  });
});

describe('sanitizeRichText and highlight blocks', () => {
  it('keeps a callout of every kind with its content', () => {
    for (const kind of CALLOUT_KINDS) {
      const html = `<div class="callout callout-${kind}"><p>Remember <strong>this</strong></p><ul><li><p>a</p></li></ul></div>`;
      expect(sanitizeRichText(html)).toBe(html);
    }
  });

  it('normalises the classes of a callout and drops its other attributes', () => {
    expect(
      sanitizeRichText(
        '<div class="extra callout-tip big callout" style="color:red" onclick="x()"><p>t</p></div>',
      ),
    ).toBe('<div class="callout callout-tip"><p>t</p></div>');
  });

  it('unwraps any other div, keeping its contents', () => {
    expect(
      sanitizeRichText(
        '<div class="callout callout-party"><p>a</p></div><div><p>b</p></div><div class="callout-tip"><p>c</p></div>',
      ),
    ).toBe('<p>a</p><p>b</p><p>c</p>');
  });

  it('still removes dangerous content inside a callout', () => {
    expect(
      sanitizeRichText(
        '<div class="callout callout-attention"><p>ok</p><script>alert(1)</script><img src="javascript:x"></div>',
      ),
    ).toBe('<div class="callout callout-attention"><p>ok</p></div>');
  });

  it('reads a callout as its text alone', () => {
    expect(
      richTextToPlain('<div class="callout callout-tip"><p>Drink tea</p></div><p>Next</p>'),
    ).toBe('Drink tea Next');
  });
});

describe('richTextToPlain', () => {
  it('separates blocks and line breaks with spaces', () => {
    expect(richTextToPlain('<h2>Title</h2><p>One<br>two</p><ul><li><p>three</p></li></ul>')).toBe(
      'Title One two three',
    );
  });

  it('decodes entities and drops media', () => {
    expect(
      richTextToPlain(
        '<p>Tom &amp; Jerry &lt;3 &quot;hi&quot;&nbsp;there</p><img src="https://a/b.png">',
      ),
    ).toBe('Tom & Jerry <3 "hi" there');
  });

  it('keeps emojis', () => {
    expect(richTextToPlain('<p>Привіт 👋🇺🇦</p>')).toBe('Привіт 👋🇺🇦');
  });

  it('shortens long text at a word boundary with an ellipsis', () => {
    const long = `<p>${'word '.repeat(200)}</p>`;
    const text = richTextToPlain(long);
    expect(text.length).toBeLessThanOrEqual(PLAIN_TEXT_LENGTH);
    expect(text.endsWith('word…')).toBe(true);
    expect(richTextToPlain('<p>abcdefghij</p>', 5)).toBe('abcd…');
  });

  it('returns an empty string for empty input', () => {
    expect(richTextToPlain('')).toBe('');
  });
});

describe('plainTextToRichText and toStoredRichText', () => {
  it('turns paragraphs and line breaks of plain text into HTML, escaped', () => {
    expect(plainTextToRichText('Hello <you> & me\nsecond line\n\nNew paragraph')).toBe(
      '<p>Hello &lt;you&gt; &amp; me<br>second line</p><p>New paragraph</p>',
    );
    expect(plainTextToRichText('   ')).toBe('');
  });

  it('sanitizes HTML and wraps plain text', () => {
    expect(toStoredRichText('<p>a</p><script>x</script>')).toBe('<p>a</p>');
    expect(toStoredRichText('1 < 2 & 3 > 2')).toBe('<p>1 &lt; 2 &amp; 3 &gt; 2</p>');
    expect(toStoredRichText('')).toBe('');
  });
});
