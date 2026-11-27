# Writing public pages

Pages are edited in the control panel under **Pages**. The main page and every
custom page use the same form.

## Fields

- **Title** — available in the template as `{{ title }}`.
- **URL path** — where a custom page is served, for example `/about`. Lowercase
  letters, digits and hyphens. The main page is always served at `/`.
- **Texts** — named pieces of text with one translation per language.
- **Content** — the page's HTML, written as a
  [Handlebars](https://handlebarsjs.com/) template.

## Texts and languages

Give each text a name (letters, digits and underscores, e.g. `header`) and add
one translation per language. In the content, write the name between double
braces:

```handlebars
<h1>{{header}}</h1>
```

The visitor's language is taken from their browser (`Accept-Language`). For
each text the site uses, in order:

1. the visitor's language (`pt-BR`),
2. its base language (`pt`),
3. **English**,
4. whatever translation exists.

So a text only translated to English is shown in English to everybody, and
adding a language is just adding translations — no template change. A link can
force a language with `?lang=es`.

Values are HTML-escaped. If a text deliberately contains markup, use triple
braces: `{{{ rich_intro }}}`.

## Built-in values

| Name               | Value                                                                        |
| ------------------ | ---------------------------------------------------------------------------- |
| `{{ title }}`      | The page title                                                               |
| `{{ locale }}`     | The language being shown, e.g. `es` — use it in `<html lang="{{ locale }}">` |
| `{{ studentUrl }}` | Address of the student classroom                                             |
| `{{ siteUrl }}`    | Address of this website                                                      |
| `{{ path }}`       | The page's own path                                                          |
| `{{ year }}`       | The current year                                                             |
| `{{ courses }}`    | The published courses, for `{{#each courses}}`; see below                    |

These names are reserved: a text with the same name is ignored.

### Listing the courses

`courses` holds every published course, in alphabetical order. Inside
`{{#each courses}}` each one has:

| Name                | Value                                                                        |
| ------------------- | ---------------------------------------------------------------------------- |
| `{{ title }}`       | The course title                                                             |
| `{{ url }}`         | Its page in the student classroom, where it is bought                        |
| `{{ price }}`       | The price in the visitor's language, e.g. `€25.00`, or `Free`                |
| `{{ free }}`        | True for a free course, for `{{#if free}}`                                   |
| `{{ lessonCount }}` | Number of lessons                                                            |
| `{{ summary }}`     | The summary as written in the course editor: formatting, pictures and videos |
| `{{ summaryText }}` | The summary's words only, shortened — for a small card or a `<meta>` tag     |
| `{{ slug }}`        | The course's URL name                                                        |

`{{ summary }}` is written as HTML even with double braces: it is cleaned when
the course is saved, so it is safe as it is. For example:

```handlebars
{{#each courses}}
  <article>
    <h2><a href='{{url}}'>{{title}}</a> — {{price}}</h2>
    {{summary}}
  </article>
{{/each}}
```

A course saved in the panel is listed with its changes on the next visit.

**Link to the classroom.** The main page should contain a link such as:

```handlebars
<a href='{{studentUrl}}'>{{classroom_link}}</a>
```

## Handlebars features

The standard built-in helpers work: `{{#if promo}}…{{/if}}`,
`{{#unless}}`, `{{#each}}`, `{{!-- comments --}}`. A text that has no
translation at all is an empty string, so `{{#if text}}` can hide a block.

## Files

The **Files** section of the editor uploads images, documents, stylesheets or
any other file a page needs (up to 25 MB each, several at once). Each upload
gets a public URL, shown with a **Copy URL** button, to paste into the content:

```handlebars
<img src='https://speakukrainian.org/files/3f2b…/logo.png' alt='{{logo_alt}}' />
```

- Every upload gets an address of its own, `/files/<id>/<name>`: uploading
  another file with the same name never replaces the first one. To change a
  file, upload the new one and update the URL in the page.
- Files are public, like the pages, and browsers keep them for a year.
- **Storage**, in the side menu, lists every uploaded file. From there a file
  can be opened, inspected (URL, name, size, upload date) or deleted. Deleting
  is permanent: pages that still link to the file stop showing it.

## Preview and errors

**Preview** opens the unsaved form in a new browser tab, rendered in the
language chosen next to the button. A bar on top of the tab says it is a
preview; the bar is drawn over the page, so the layout underneath is exactly
what will be published, and it is never part of the saved page. Nothing is
saved by previewing, and the link stops working after 15 minutes: press
**Preview** again for a fresh one. If the browser blocks the new tab, allow
pop-ups for the control panel.

If a template has a syntax error the public page shows a plain error page with
the message instead of failing, and so does the preview.

## When a change becomes visible

Saving or deleting a page in the control panel takes effect on the public site
on the very next load. The site keeps pages in memory between edits to avoid
reading the database on every visit; the panel clears that memory whenever a
page is saved or deleted. A change made directly in the database, not through
the panel, shows up within a minute.
