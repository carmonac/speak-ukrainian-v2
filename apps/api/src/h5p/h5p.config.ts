import { H5PConfig } from '@lumieducation/h5p-server';
import { MAX_H5P_UPLOAD_BYTES } from '@speakukrainian/shared';

/**
 * The H5P server's runtime configuration.
 *
 * No `IKeyValueStorage` is passed — the storage argument is optional and we do
 * not persist configuration; these values come from code and the environment,
 * so a deploy is what changes them.
 *
 * Trap worth knowing before adding anything here: `H5PConfig`'s defaults loop is
 * `for (const key in defaults) if (this[key] !== undefined) this[key] = defaults[key]`.
 * A key whose *class* default is `undefined` — `editorAddons`, `libraryConfig`,
 * `proxy`, `contentFilesUrlPlayerOverride` — is silently ignored. Setting one
 * of those here would look right and do nothing.
 */
export function createH5pConfig(baseUrl: string): H5PConfig {
  return new H5PConfig(undefined, {
    // Not cosmetic. The stock defaults are 16 MiB per file and 64 MiB total,
    // and `PackageValidator.validateFileSizes` enforces them before anything
    // else runs — so without these a 70 MB package that passes the route's own
    // 100 MB limit dies inside the library quoting a limit no part of this API
    // advertises. One limit, stated once.
    maxFileSize: MAX_H5P_UPLOAD_BYTES,
    maxTotalSize: MAX_H5P_UPLOAD_BYTES,

    // The stock install-lock budget assumes a local filesystem; every library
    // file here is an HTTP write to object storage. `PackageImporter` starts
    // every library directory of a package at once — ~68 of them and ~1700
    // objects for `H5P.CoursePresentation 1.22` — each under its own lock key
    // (`install-from-directory:<ubername>`), so they all run concurrently and
    // each one's budget measures the whole import rather than its own share of
    // it. Measured against a local object-store emulator, which answers a small
    // write in ~10 ms, that import runs 16-20 s and the stock 10 s fails it
    // about two cold runs in three; a real bucket is slower per object. Five
    // minutes is far longer than any import should take, so a pathological
    // import now ends because the request ended,
    // rather than because a library budget expired mid-upload and threw away
    // work the caller cannot see was nearly done.
    installLibraryLockMaxOccupationTime: 300_000,

    // Unreachable in this configuration, and kept only to mirror the library's
    // own 2:1 ratio. It would bound waiting behind another import of the *same*
    // library, but `async-lock` arms the occupation timer at `acquire` for a
    // waiter too — so a waiter is refused at 300 s and this value never fires.
    // It buys no behaviour; it is here so that a future change to the budget
    // above has an obvious companion rather than a hidden default.
    installLibraryLockTimeout: 600_000,

    // `trackResults` is out of scope for Phase 1 and no
    // `IContentUserDataStorage` is wired, so the "finished" call would have
    // nowhere to land.
    setFinishedEnabled: false,

    // The *content-type* Hub is in use: the editor lists its content types and
    // missing libraries are installed from it (see `h5p.hub.ts` and the
    // unseeded cache in `h5p.module.ts`). These three settings switch off the
    // other things `api.h5p.org` offers — the *Content* Hub (sharing and
    // fetching whole exercises), the `fetchingDisabled` flag sent with the
    // site registration, and usage statistics.
    contentHubEnabled: false,
    fetchingDisabled: 1,
    sendUsageStatistics: false,

    // Every asset URL in a player model is built from this. It comes from
    // `H5P_BASE_URL` rather than being fixed here because it has to be absolute
    // whenever the page's origin differs from the API's — see the environment
    // schema.
    baseUrl,

    // The default is `/editor`, which is the prefix the editor *model* route
    // will use. Two different things one line apart in the URL space: this one
    // is Joubel's editor JavaScript on disk, that one is a JSON model. Left at
    // the default they collide, and the collision is silent — whichever route
    // Express matched first would answer both.
    editorLibraryUrl: '/editor-assets',

    // The player would otherwise poll a content-user-data route to save and
    // restore each exercise's in-progress state. Nothing stores that here
    // (progress is completion + score, recorded from xAPI), so the feature is
    // switched off instead of answering 404 on every exercise.
    contentUserStateSaveInterval: false,

    // The pinned H5P core declares its icon font (`font-family: 'h5p'`) in
    // `styles/h5p-fonts.css`, a file newer than the core stylesheet list this
    // version of the library ships with. Without it every core and editor icon
    // renders as an empty square.
    customization: {
      global: {
        editor: { scripts: [], styles: [`${baseUrl}/core/styles/h5p-fonts.css`] },
        player: { scripts: [], styles: [`${baseUrl}/core/styles/h5p-fonts.css`] },
      },
    },
  });
}
