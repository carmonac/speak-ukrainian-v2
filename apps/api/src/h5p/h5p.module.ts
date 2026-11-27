import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MulterModule } from '@nestjs/platform-express';
import {
  H5PAjaxEndpoint,
  H5PConfig,
  H5PEditor,
  H5PPlayer,
  fsImplementations,
} from '@lumieducation/h5p-server';
import type {
  IEditorModel,
  IPlayerModel,
  ITemporaryFileStorage,
  ITranslationFunction,
} from '@lumieducation/h5p-server';
import type { Env } from '../config/configuration.js';
import { H5pContentRepository } from './h5p-content.repository.js';
import { H5pContentStorage } from './h5p-content.storage.js';
import { H5pEditorController } from './h5p-editor.controller.js';
import { H5pEditorService } from './h5p-editor.service.js';
import { H5pLibraryStorage } from './h5p-library.storage.js';
import { H5pUrlTokenGuard } from './h5p-url-token.guard.js';
import { H5pUrlTokenService } from './h5p-url-token.service.js';
import { H5pPublicController } from './h5p-public.controller.js';
import { H5pServeService } from './h5p-serve.service.js';
import { H5pTemporaryStorage } from './h5p-temporary.storage.js';
import { H5pClientAssets } from './h5p.client-assets.js';
import { createH5pConfig } from './h5p.config.js';
import { H5pController } from './h5p.controller.js';
import { H5P_HUB_LOCAL_ID } from './h5p.hub.js';
import { H5pService } from './h5p.service.js';
import {
  H5P_AJAX_ENDPOINT,
  H5P_CONFIG,
  H5P_EDITOR,
  H5P_PLAYER,
  H5P_TEMPORARY_STORAGE,
  H5P_TRANSLATE,
  H5P_WORKING_DIRS,
  type H5pWorkingDirs,
} from './h5p.tokens.js';
import {
  UK_OVERLAY,
  buildTranslationFunction,
  loadUpstreamTranslations,
} from './h5p.translations.js';
import { createH5pUrlGenerator } from './h5p.url-generator.js';
import { H5pWorkingDirsModule } from './h5p.working-dirs.module.js';

/**
 * H5P package import, and everything the H5P client in a browser reads back.
 *
 * `StorageModule` and `DatabaseModule` are `@Global`, so the two adapters and
 * the repository need no imports here.
 */
@Module({
  imports: [
    H5pWorkingDirsModule,
    // The upload destination has to come from configuration, and
    // `FileInterceptor`'s options are fixed at decoration time — the route
    // cannot read `ConfigService`. Nest merges `MULTER_MODULE_OPTIONS` under
    // the route-level options, so the module supplies `dest` and
    // `h5pUploadOptions` supplies `limits` and `fileFilter`. `MulterModule` is
    // not global, so `MediaModule` — which passes its own memory storage
    // explicitly — is unaffected.
    MulterModule.registerAsync({
      imports: [H5pWorkingDirsModule],
      inject: [H5P_WORKING_DIRS],
      useFactory: (dirs: H5pWorkingDirs) => ({ dest: dirs.uploads }),
    }),
  ],
  controllers: [H5pController, H5pEditorController, H5pPublicController],
  providers: [
    {
      provide: H5P_CONFIG,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>): H5PConfig =>
        createH5pConfig(config.get('H5P_BASE_URL', { infer: true })),
    },
    {
      /**
       * How both the player and the editor localize the labels they render.
       *
       * Built once at boot from upstream's own 29 client locales plus the
       * Ukrainian strings we author, because upstream ships none — see
       * `h5p.translations.ts` for the per-key fallback rule and ADR-007 for why
       * this is the one translation in the product that is not a
       * `LocalizedText`.
       */
      provide: H5P_TRANSLATE,
      useFactory: async (): Promise<ITranslationFunction> =>
        buildTranslationFunction(await loadUpstreamTranslations(), UK_OVERLAY),
    },
    H5pClientAssets,
    H5pContentStorage,
    H5pLibraryStorage,
    H5pTemporaryStorage,
    {
      /**
       * The editor's scratch storage, in the bucket rather than on disk: a temp
       * file written by one container instance is invisible to the next, and
       * the container filesystem is discarded anyway. The token stays so that
       * `H5PEditor`'s constructor argument is named by what it is rather than
       * by which class currently implements it.
       */
      provide: H5P_TEMPORARY_STORAGE,
      useExisting: H5pTemporaryStorage,
    },
    {
      provide: H5P_EDITOR,
      inject: [
        H5P_CONFIG,
        H5pLibraryStorage,
        H5pContentStorage,
        H5P_TEMPORARY_STORAGE,
        H5P_TRANSLATE,
        H5pUrlTokenService,
      ],
      useFactory: async (
        config: H5PConfig,
        libraryStorage: H5pLibraryStorage,
        contentStorage: H5pContentStorage,
        temporaryStorage: ITemporaryFileStorage,
        translate: ITranslationFunction,
        tokens: H5pUrlTokenService,
      ): Promise<H5PEditor> => {
        // `InMemoryStorage` is only reachable through `fsImplementations`; it is
        // not a named export of the package root.
        const keyValueStorage = new fsImplementations.InMemoryStorage();

        // **Not seeded: the content-type cache is filled from the H5P Hub.**
        // `ContentTypeCache.get()` downloads the Hub's list (after registering
        // the site at `config.hubRegistrationEndpoint`) the first time it finds
        // the store empty, so the editor's selector lists every Hub content
        // type and `library-install` can fetch one, and a package that lacks
        // its libraries can have them installed (`withLibrariesFromHub`). The
        // store is per instance and in memory, so each container boot fetches
        // the list once. If the Hub is unreachable `get()` answers `[]`,
        // caches nothing and tries again on the next request; the selector
        // then lists only the installed content types, as it did before.

        // No `IPermissionSystem` is passed, so the default
        // `LaissezFairePermissionSystem` allows everything. That is correct
        // here rather than an oversight: authorization is `@Roles('admin')` at
        // the route, per CLAUDE.md rule 8, and the library never sees a request
        // that has not already passed it. No `contentUserDataStorage` either —
        // `trackResults` is off.
        // **`translate` is what `?language` on the editor-model route
        // selects.** The editor's callback is reached from
        // `generateEditorIntegration`, which only `H5PEditor.render` calls, so
        // it decides `integration.l10n.H5P`, `metadataSemantics` and
        // `copyrightSemantics` — the strings this *server* localizes.
        // Joubel's own authoring UI is localized by an
        // `editor-assets/language/<code>.js` instead, and upstream ships 26 of
        // those with no `uk` among them, so the authoring chrome stays English
        // whatever is passed. ADR-007 records both halves.
        //
        // The renderer is the same decision `H5P_PLAYER` makes below: the stock
        // one returns an HTML page and the editor-model route wants the model,
        // which is why `render` is declared `Promise<string | any>`. It belongs
        // here rather than in a route because it is shared state on a
        // singleton — a route that set it per request is a route the next route
        // can forget.
        //
        // **The URL generator is the seventh positional argument**, straight
        // after `translationCallback`, and the same warning applies as on
        // `H5P_PLAYER`'s two `undefined`s: get the position wrong and the
        // server still boots, still answers every route, and serves ajax URLs
        // with no token in them — which fails only in a browser. It is what
        // puts the editing session's credential into `integration.ajaxPath` and
        // `integration.editor.ajaxPath`; `integration.editor.filesPath` cannot
        // come from here, because `temporaryFiles()` takes no user.
        return new H5PEditor(
          keyValueStorage,
          config,
          libraryStorage,
          contentStorage,
          temporaryStorage,
          translate,
          createH5pUrlGenerator(config, (uid) => tokens.mint(uid)),
          { getLocalIdOverride: () => H5P_HUB_LOCAL_ID },
        ).setRenderer((model: IEditorModel) => model);
      },
    },
    {
      provide: H5P_PLAYER,
      inject: [H5pLibraryStorage, H5pContentStorage, H5P_CONFIG, H5P_TRANSLATE],
      useFactory: (
        libraryStorage: H5pLibraryStorage,
        contentStorage: H5pContentStorage,
        config: H5PConfig,
        translate: ITranslationFunction,
      ): H5PPlayer =>
        // The stock renderer returns an HTML page. Both front ends want the
        // model: the admin hands it to `@lumieducation/h5p-webcomponents` and
        // the public site will render it server-side. `IPlayerModel` is
        // JSON-safe, unlike `IEditorModel`, which carries a live `UrlGenerator`
        // whose only enumerable field is the whole server configuration.
        //
        // The two `undefined`s are deliberate, not an accident of copy-paste:
        // `translationCallback` is the sixth positional argument, and the
        // fourth and fifth default correctly for `undefined` —
        // `integrationObjectDefaults` is only ever spread, and `urlGenerator`
        // is a default parameter of `new UrlGenerator(config)`. Getting the
        // position wrong hands a function where the URL generator belongs and
        // breaks every asset URL in the model.
        new H5PPlayer(
          libraryStorage,
          contentStorage,
          config,
          undefined,
          undefined,
          translate,
        ).setRenderer((model: IPlayerModel) => model),
    },
    {
      provide: H5P_AJAX_ENDPOINT,
      inject: [H5P_EDITOR],
      useFactory: (editor: H5PEditor): H5PAjaxEndpoint => new H5PAjaxEndpoint(editor),
    },
    H5pContentRepository,
    H5pService,
    H5pServeService,
    H5pEditorService,
    H5pUrlTokenService,
    H5pUrlTokenGuard,
  ],
  exports: [
    H5P_EDITOR,
    H5P_PLAYER,
    H5P_CONFIG,
    H5pContentStorage,
    H5pLibraryStorage,
    // `AppModule` registers the guard globally, so it has to be resolvable from
    // outside this module.
    H5pUrlTokenGuard,
    H5pUrlTokenService,
    H5pService,
  ],
})
export class H5pModule {}
