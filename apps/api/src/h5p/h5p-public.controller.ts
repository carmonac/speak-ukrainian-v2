import {
  Controller,
  ForbiddenException,
  Get,
  InternalServerErrorException,
  Logger,
  Param,
  Query,
  Req,
  Res,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiTags } from '@nestjs/swagger';
import type { IPlayerModel } from '@lumieducation/h5p-server';
import type { Request, Response } from 'express';
import type { AuthenticatedUser } from '../auth/authenticated-user.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { Public } from '../auth/public.decorator.js';
import { NO_STORE } from '../common/cache-control.js';
import type { Env } from '../config/configuration.js';
import { H5pClientAssets, missingAssetsMessage, type H5pAssetKind } from './h5p.client-assets.js';
import { wildcardPath } from './h5p.request.js';
import {
  CROSS_ORIGIN_HEADERS,
  pipePartialStream,
  pipeWholeStream,
  rangeCallbackFor,
} from './h5p.responses.js';
import { H5pContentRepository } from './h5p-content.repository.js';
import { H5pServeService } from './h5p-serve.service.js';
import { H5pUrlTokenService } from './h5p-url-token.service.js';
import { contentFilesUrlFor, PLAY_FILES_PATH } from './h5p.url-generator.js';
import { requireCaller } from './h5p.user.js';

export { PLAY_FILES_PATH };

/**
 * A content file is replaced under the same URL when an exercise is re-saved,
 * so it may not be cached for long — but a learner replaying a clip should not
 * fetch it twice.
 */
const CONTENT_CACHE_CONTROL = 'private, max-age=300';

/**
 * Library URLs carry `?version=<major.minor.patch>` (`UrlGenerator.libraryFile`),
 * so a patch upgrade changes the URL and a year is safe. It is also what
 * upstream serves them with.
 */
const LIBRARY_CACHE_CONTROL = 'public, max-age=31536000';

/**
 * An hour rather than a year, because the cache buster on these URLs is
 * `?version=${config.h5pVersion}` — a constant of the library (`1.27.0`), not
 * of the commit we pin. Bumping the pin does not change the URL, so a long TTL
 * would serve the previous core until the browser felt like asking again.
 */
const ASSET_MAX_AGE = '1h';

/**
 * Everything the H5P client in a browser reads: the player model, an exercise's
 * files, an installed library's files, and Joubel's own core and editor
 * JavaScript.
 *
 * **Every route here is `@Public()`, and that is a file boundary rather than a
 * decorator habit.** The authoring half lands in a controller of its own where
 * every route is `@Roles('admin')`, and `h5p.controller.ts` keeps the upload.
 * What protects the content served here is the unguessable `randomUUID()` id
 * plus the absence of any route that enumerates ids — see ADR-007, which also
 * records the constraint that places on future listing routes.
 *
 * **Why `@Res()`, which nothing else in this codebase uses.** These routes
 * stream bytes with a status and headers that depend on the request's `Range`;
 * returning a value cannot express a 206. The cost is that Nest's response
 * pipeline is off: an exception thrown before the first byte still reaches the
 * global filter, and one raised after it cannot, which is what the stream error
 * handling in `h5p.responses.ts` is for.
 *
 * **Why the wildcards are named.** Express 5 rejects a bare `*`, so the
 * parameter is `*path` — and it arrives as an array of *decoded* segments,
 * which `@Param('path')` would type as a `string`. Hence `@Req()` and
 * `wildcardPath`.
 */
@ApiTags('h5p')
@Controller('h5p')
export class H5pPublicController {
  private readonly logger = new Logger(H5pPublicController.name);
  private readonly stallTimeoutMs: number;
  private readonly baseUrl: string;

  constructor(
    private readonly serve: H5pServeService,
    private readonly assets: H5pClientAssets,
    private readonly repository: H5pContentRepository,
    private readonly tokens: H5pUrlTokenService,
    config: ConfigService<Env, true>,
  ) {
    this.stallTimeoutMs = config.get('H5P_STREAM_STALL_TIMEOUT_MS', { infer: true });
    this.baseUrl = config.get('H5P_BASE_URL', { infer: true }).replace(/\/$/, '');
  }

  /**
   * The model the `<h5p-player>` web component renders from.
   *
   * Not public: exercises are paid course content. The administrator may play
   * anything (the editor preview); a student may play an exercise only when it
   * belongs to a lesson of a course they are enrolled in.
   *
   * The model's `contentUrl` is rewritten to carry a short-lived play token,
   * because the browser fetches the exercise's images and audio with plain
   * `<img>`/`<audio>` requests that cannot send an `Authorization` header.
   */
  @Get('play/:contentId')
  async playerModel(
    @Param('contentId') contentId: string,
    @Query('lang') language?: string,
    @CurrentUser() caller?: AuthenticatedUser,
  ): Promise<IPlayerModel> {
    const user = requireCaller(caller);
    if (user.role !== 'admin' && !(await this.repository.isPlayableBy(contentId, user.uid))) {
      throw new ForbiddenException('You do not have access to this exercise.');
    }

    const model = language
      ? await this.serve.playerModel(contentId, language)
      : await this.serve.playerModel(contentId);

    const entry = (model.integration as { contents?: Record<string, { contentUrl?: string }> })
      .contents?.[`cid-${contentId}`];
    if (entry) {
      entry.contentUrl = contentFilesUrlFor(
        this.baseUrl,
        this.tokens.mintPlay(contentId),
        contentId,
      );
    }
    return model;
  }

  /**
   * One file of an exercise, authorized by the play token in the path.
   *
   * `@Public()` only in the sense that no bearer token is involved: the token
   * segment is the credential, it names exactly this content id, and it expires.
   */
  @Public()
  @Get(`${PLAY_FILES_PATH}/:playToken/:contentId/*path`)
  async contentFile(
    @Param('playToken') playToken: string,
    @Param('contentId') contentId: string,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    if (!this.tokens.verifyPlay(playToken, contentId)) {
      throw new ForbiddenException('This exercise link has expired. Reload the page.');
    }

    const file = await this.serve.contentFile(
      contentId,
      wildcardPath(req),
      rangeCallbackFor(req, res),
    );

    if (file.range) {
      pipePartialStream(res, file.stream, {
        mimetype: file.mimetype,
        totalLength: file.totalLength,
        start: file.range.start,
        end: file.range.end,
        cacheControl: CONTENT_CACHE_CONTROL,
        stallTimeoutMs: this.stallTimeoutMs,
      });
      return;
    }

    pipeWholeStream(res, file.stream, {
      mimetype: file.mimetype,
      contentLength: file.totalLength,
      cacheControl: CONTENT_CACHE_CONTROL,
      stallTimeoutMs: this.stallTimeoutMs,
    });
  }

  @Public()
  @Get('libraries/:ubername/*path')
  async libraryFile(
    @Param('ubername') ubername: string,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const file = await this.serve.libraryFile(ubername, wildcardPath(req));

    pipeWholeStream(res, file.stream, {
      mimetype: file.mimetype,
      contentLength: file.contentLength,
      cacheControl: LIBRARY_CACHE_CONTROL,
      stallTimeoutMs: this.stallTimeoutMs,
    });
  }

  @Public()
  @Get('core/*path')
  coreAsset(@Req() req: Request, @Res() res: Response): Promise<void> {
    return this.sendAsset('core', req, res);
  }

  @Public()
  @Get('editor-assets/*path')
  editorAsset(@Req() req: Request, @Res() res: Response): Promise<void> {
    return this.sendAsset('editor', req, res);
  }

  /**
   * Serves one file out of a fetched client library tree.
   *
   * `res.sendFile` is `send`, so the content type, `ETag`, `Last-Modified` and
   * range handling all come for free and correct. It also refuses to escape
   * `root` — but the path is asserted first anyway, so an attempt is answered
   * by our 400 naming the rule rather than by `send`'s bare 403.
   *
   * `dotfiles: 'deny'` is spelled out even though `send`'s default of `ignore`
   * refuses them too: these trees are fetched from someone else's repository,
   * so "nothing beginning with a dot is served out of them" is a decision this
   * route makes rather than one it inherits.
   *
   * A failure `send` blames on the request — a missing file, a dotfile — is a
   * 404, and the two are deliberately indistinguishable. Anything else is a
   * fault of this server's own installation, such as a tree it may not read, so
   * it is logged and answered 500 rather than quietly reported as a file that
   * does not exist.
   */
  private async sendAsset(kind: H5pAssetKind, req: Request, res: Response): Promise<void> {
    const path = wildcardPath(req);

    if (!(await this.assets.isInstalled(kind))) {
      // A 404 here would send whoever hits it looking for a wrong URL. This is
      // a server that was never finished installing, and the message says so.
      throw new ServiceUnavailableException(missingAssetsMessage(kind));
    }

    res.set(CROSS_ORIGIN_HEADERS);

    await new Promise<void>((resolve, reject) => {
      res.sendFile(
        path,
        { root: this.assets.rootOf(kind), dotfiles: 'deny', maxAge: ASSET_MAX_AGE },
        (error?: Error) => {
          if (!error || res.headersSent) {
            // A client that navigated away aborts `sendFile` after the headers
            // have gone out; there is nothing left to answer with.
            resolve();
            return;
          }
          reject(error);
        },
      );
    }).catch((error: unknown) => {
      if (sendFailureStatus(error) >= 500) {
        // Kept alongside `HttpExceptionFilter`'s own 5xx line: the filter is
        // handed the sanitized exception below, so the path and `send`'s own
        // failure — the `EACCES` that explains it — are recorded here or
        // nowhere.
        this.logger.error(
          `Serving "${path}" from the H5P ${kind} client tree failed: ${String(error)}`,
        );
        throw new InternalServerErrorException(
          `The H5P ${kind} client library could not be read on this server.`,
        );
      }

      // Written here rather than by the exception filter, so it labels itself.
      res.set('Cache-Control', NO_STORE).status(404).end();
    });
  }
}

/**
 * The status `send` failed with, or 500 when it named none.
 *
 * `send` sets `status` on the errors it raises: 404 for a missing file, 403 for
 * a dotfile, 500 for a `stat` that failed for any other reason. An error
 * without one did not come from `send` at all, and neither case is the
 * caller's.
 */
function sendFailureStatus(error: unknown): number {
  const status: unknown = error instanceof Error ? (error as { status?: unknown }).status : null;
  return typeof status === 'number' ? status : 500;
}
