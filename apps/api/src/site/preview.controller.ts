import { Controller, Get, Param, Res } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import type { Response } from 'express';
import { Public } from '../auth/public.decorator.js';
import { PREVIEW_CONTENT_SECURITY_POLICY, PreviewStore } from './preview.js';

/** Where the link returned by `POST /api/admin/pages/preview-link` points. */
export const PREVIEW_ROUTE = 'preview';

const GONE = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Preview not available</title>
  </head>
  <body style="font: 16px/1.5 system-ui, sans-serif; margin: 15vh auto; max-width: 32rem; padding: 0 1rem;">
    <h1 style="font-size: 1.25rem;">This preview is no longer available</h1>
    <p>Previews last a few minutes. Go back to the editor and press Preview again.</p>
  </body>
</html>
`;

/**
 * Serves a rendered, unsaved page to the tab the editor opened.
 *
 * Public on purpose: the tab cannot send the administrator's session (it is a
 * plain navigation, and must not have access to the panel anyway). What
 * protects a preview is its token, which is random, short-lived and only ever
 * given to the administrator who asked for it.
 */
@ApiExcludeController()
@Controller(PREVIEW_ROUTE)
export class PreviewController {
  constructor(private readonly previews: PreviewStore) {}

  @Public()
  @Get(':token')
  show(@Param('token') token: string, @Res() res: Response): void {
    const html = this.previews.get(token);
    res.setHeader('Content-Security-Policy', PREVIEW_CONTENT_SECURITY_POLICY);
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res
      .status(html === null ? 404 : 200)
      .type('html')
      .send(html ?? GONE);
  }
}
