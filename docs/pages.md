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

These names are reserved: a text with the same name is ignored.

**Link to the classroom.** The main page should contain a link such as:

```handlebars
<a href='{{studentUrl}}'>{{classroom_link}}</a>
```

## Handlebars features

The standard built-in helpers work: `{{#if promo}}…{{/if}}`,
`{{#unless}}`, `{{#each}}`, `{{!-- comments --}}`. A text that has no
translation at all is an empty string, so `{{#if text}}` can hide a block.

## Preview and errors

**Preview** renders the unsaved form in a chosen language. If a template has a
syntax error the public page shows a plain error page with the message instead
of failing, and so does the preview.
