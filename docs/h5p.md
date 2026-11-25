# H5P

Course lessons are [H5P](https://h5p.org) exercises. The integration is ported
from the previous SpeakUkrainian project and lives in `apps/api/src/h5p/`
(server) and `apps/*/src/app/h5p/` (clients).

## Pieces

- **Server library:** [`@lumieducation/h5p-server`](https://github.com/Lumieducation/H5P-Nodejs-library)
  10.x. There is no `h5p-express`; the routes are NestJS controllers.
- **Client:** [`@lumieducation/h5p-webcomponents`](https://www.npmjs.com/package/@lumieducation/h5p-webcomponents)
  (`<h5p-player>`, `<h5p-editor>`). **This package is GPL-3.0**, which is a
  deliberate, accepted choice carried over from the previous project. It is the
  only GPL dependency of the two front-ends.
- **H5P core and editor JavaScript** are not on npm. `scripts/fetch-h5p-core.ts`
  downloads them from GitHub at pinned commits and verifies a hash; it runs on
  `pnpm install` and in the API's Docker build. They land in
  `apps/api/h5p/{core,editor}` (git-ignored).

## Storage

Everything is in one private Cloudflare R2 bucket, reached through the gateway
bridge by `infra/storage/storage.service.ts` (no access keys, nothing public):

| Prefix                              | Content                                                         |
| ----------------------------------- | --------------------------------------------------------------- |
| `h5p/content/<uuid>/`               | One exercise: `h5p.json`, `content.json`, media                 |
| `h5p/libraries/<Name-major.minor>/` | Installed H5P libraries (content types)                         |
| `h5p/temp/<user>/`                  | Files uploaded in the editor before saving; swept automatically |

`public.h5p_content` indexes the exercises; `lessons.h5p_content_id` attaches
one to a lesson. When a course save or an editor save leaves an exercise with
no lesson pointing at it, its files and row are deleted.

## Authoring

In the course editor each lesson offers:

- **Upload .h5p file** — imports a package made elsewhere (Lumi, h5p.org…).
  This also installs the libraries it contains.
- **Create / Edit in H5P editor** — opens the embedded editor. The course is
  saved first and the editor is opened with a full page load, because Joubel's
  editor can only be initialised once per document.
- **Preview** — plays the exercise as a student will see it.

**Content types.** The H5P Hub is switched off (`contentHubEnabled: false`), so
the editor lists only content types that are already installed. A new type
becomes available after uploading any `.h5p` that uses it, or through the
editor's own _Upload_ tab.

## Routes (`/api/h5p/…`)

| Route                                                                           | Who                                                    |
| ------------------------------------------------------------------------------- | ------------------------------------------------------ |
| `POST content` (upload), `GET content`, `GET content/:id`, `DELETE content/:id` | admin                                                  |
| `GET editor[/:id]`, `GET params/:id`, `POST editor[/:id]`                       | admin                                                  |
| `GET/POST ajax`, `GET temp/:token/*`                                            | admin, identified by a URL token                       |
| `GET play/:id`                                                                  | admin, or a student enrolled in a course containing it |
| `GET play-files/:token/:id/*`                                                   | anyone holding a valid play token                      |
| `GET libraries/*`, `core/*`, `editor-assets/*`                                  | public (generic H5P code, cached)                      |

### Why tokens in URLs

Joubel's editor runs in an iframe and makes its own requests, and a playing
exercise loads its images and audio with plain `<img>`/`<audio>` tags. Neither
can send an `Authorization` header. So:

- the **editor token** (`scope: h5p-editor`, 2 hours) identifies the
  administrator on the editor's AJAX and temporary-file URLs. The account's
  current role is re-checked on every request;
- the **play token** (`scope: h5p-play`, 6 hours) is put into the player
  model's `contentUrl` and authorises the files of exactly one exercise.

Both are HMAC-SHA256 signed with `H5P_URL_TOKEN_SECRET`. Rotating the secret
invalidates open editors and players; a reload fixes it.

## Progress

`<h5p-player>` re-dispatches H5P's xAPI statements as an `xAPI` DOM event. The
classroom (`apps/student/src/app/h5p/h5p-player.ts`) listens for `completed`
and `answered` statements of the top-level content and posts
`{ completed, score, maxScore }` to `POST /api/me/lessons/:id/result`. A lesson
stays completed once completed and the best score is kept. H5P's own
state-saving (`contentUserData`) and `setFinished` are switched off.

## Known limits

- The editor's interface is English; the player's labels have a Ukrainian
  overlay (`h5p.translations.uk.ts`).
- After two hours the editor's URL token expires; reload the editor to continue.
- Installed libraries are never removed automatically.
- The pinned H5P core declares its icon font in `styles/h5p-fonts.css`, which
  the library does not list; `h5p.config.ts` adds it explicitly. Keep that when
  bumping either pin.
- When bumping `@lumieducation/h5p-server` or the core pins, run the unit
  tests in `apps/api/src/h5p/` and try upload, edit and play in a browser.
