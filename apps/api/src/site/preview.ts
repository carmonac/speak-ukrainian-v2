import { randomBytes } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { CLOCK, type Clock } from '../infra/clock/clock.tokens.js';

/** What the banner on top of a previewed page says. */
export const PREVIEW_BANNER_TEXT =
  'This is a preview, if you want to keep it, save it in the editor.';

/** How long a preview can be opened or reloaded. */
export const PREVIEW_TTL_MS = 15 * 60_000;

/** Previews kept at once; the oldest goes when a new one does not fit. */
export const MAX_PREVIEWS = 50;

/**
 * Sent with every preview. `sandbox` without `allow-same-origin` gives the
 * document an origin of its own, shared with nothing: its scripts run, as
 * they would on the real page, but cannot read cookies or storage, and
 * cannot reach the site, the API or the control panel as anything but a
 * stranger. That is what makes it safe to open markup that is not saved or
 * reviewed yet.
 */
export const PREVIEW_CONTENT_SECURITY_POLICY =
  'sandbox allow-scripts allow-forms allow-popups allow-modals';

/**
 * Fixed to the top of the window and drawn over the page, so nothing beneath
 * it moves: the page is laid out exactly as it will be when saved.
 * `all: initial` keeps the page's own styles from reaching it, and it lets
 * clicks through to whatever it covers.
 */
const BANNER = `<div data-preview-banner style="all: initial; position: fixed; top: 0; left: 0; right: 0; z-index: 2147483647; box-sizing: border-box; padding: 6px 12px; background: rgba(250, 173, 20, 0.95); color: #1f1f1f; font: 13px/1.4 system-ui, sans-serif; text-align: center; pointer-events: none;">${PREVIEW_BANNER_TEXT}</div>`;

/**
 * The page as it will be shown in a preview tab: the same HTML with the
 * banner as the first thing in its body. Used for previews only; a saved page
 * and the public site never pass through here.
 */
export function withPreviewBanner(html: string): string {
  const body = /<body\b[^>]*>/i.exec(html);
  if (!body) {
    // A fragment, or a template that leaves the body tag out.
    return `${BANNER}${html}`;
  }
  const at = body.index + body[0].length;
  return `${html.slice(0, at)}${BANNER}${html.slice(at)}`;
}

interface Preview {
  html: string;
  expiresAt: number;
}

/**
 * Rendered previews waiting to be opened in a tab.
 *
 * A preview has to be loaded by a plain navigation, on an origin that is not
 * the control panel's, so it cannot be handed to the browser by the panel
 * itself: the panel asks for a link, and the tab loads it from here.
 *
 * Kept in memory, on purpose: a preview is unsaved by definition and nothing
 * about it should outlive the editing session. They disappear when they
 * expire and when the API restarts.
 */
@Injectable()
export class PreviewStore {
  private readonly previews = new Map<string, Preview>();

  constructor(@Inject(CLOCK) private readonly clock: Clock) {}

  /** Keeps the HTML and returns the unguessable token it can be fetched with. */
  add(html: string): string {
    this.dropExpired();
    while (this.previews.size >= MAX_PREVIEWS) {
      const oldest = this.previews.keys().next().value;
      if (oldest === undefined) {
        break;
      }
      this.previews.delete(oldest);
    }
    const token = randomBytes(24).toString('base64url');
    this.previews.set(token, { html, expiresAt: this.clock.now() + PREVIEW_TTL_MS });
    return token;
  }

  get(token: string): string | null {
    const preview = this.previews.get(token);
    if (!preview) {
      return null;
    }
    if (preview.expiresAt <= this.clock.now()) {
      this.previews.delete(token);
      return null;
    }
    return preview.html;
  }

  get size(): number {
    return this.previews.size;
  }

  private dropExpired(): void {
    const now = this.clock.now();
    for (const [token, preview] of this.previews) {
      if (preview.expiresAt <= now) {
        this.previews.delete(token);
      }
    }
  }
}
