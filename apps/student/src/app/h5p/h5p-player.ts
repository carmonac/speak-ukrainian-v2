/** The tag `H5P_DEFINE_PLAYER_ELEMENT` registers, and the one this mounts. */
const H5P_PLAYER_TAG = 'h5p-player';

/**
 * `GET /api/h5p/play/:contentId` — everything `<h5p-player>` boots from.
 *
 * Ours and not the package's: the package's own `.d.ts` files import from
 * `@lumieducation/h5p-server`, which does not resolve from `apps/student` and
 * degrades silently to `any` under `skipLibCheck`.
 *
 * `integration` is opaque because nothing on this site reads a field of it; the
 * player merges it into `window.H5PIntegration` itself.
 */
export interface H5pPlayerModel {
  contentId: string;
  integration: unknown;
  scripts: string[];
  styles: string[];
  embedTypes: ('iframe' | 'div')[];
}

/** The part of `H5PPlayerComponent` this site drives. */
export interface H5pPlayerHost extends HTMLElement {
  /**
   * The component calls this with four arguments and this mount answers with
   * the model it was created for regardless, so the other three are not
   * declared.
   */
  loadContentCallback?: (contentId?: string) => Promise<H5pPlayerModel>;
}

/**
 * The part of an xAPI statement the classroom reads. H5P emits many more
 * fields; nothing else is used, so nothing else is declared.
 */
export interface H5pXapiStatement {
  verb?: { id?: string };
  result?: {
    completion?: boolean;
    score?: { raw?: number; max?: number; scaled?: number };
  };
  context?: { contextActivities?: { parent?: unknown[] } };
}

/** What an exercise reported when the learner finished or answered it. */
export interface H5pResult {
  score: number | null;
  maxScore: number | null;
}

/** Everything one mounted player needs, decided by the caller. */
export interface H5pPlayerMount {
  /**
   * Never empty: the player forwards whatever `content-id` holds straight to
   * the callback, so refusing an absent id is the caller's job.
   */
  contentId: string;
  /** Already resolved, so no request happens in the middle of a mount. */
  model: H5pPlayerModel;
  /**
   * Called when the exercise as a whole is completed or answered. May fire
   * more than once for one attempt; de-duplicating is the caller's job.
   */
  onResult?: (result: H5pResult) => void;
}

/**
 * The outcome a statement reports, or null when it is not one.
 *
 * Only `completed` and `answered` count, and only for the top-level content:
 * a compound exercise (Question Set, Course Presentation, Interactive Video)
 * also emits `answered` for every question inside it, and those carry a
 * `parent` context activity. Counting them would mark a lesson complete on its
 * first sub-question, with that sub-question's score.
 */
export function resultOfStatement(statement: H5pXapiStatement | undefined): H5pResult | null {
  const verb = statement?.verb?.id ?? '';
  if (!/\/(completed|answered)$/.test(verb)) {
    return null;
  }
  const parents = statement?.context?.contextActivities?.parent;
  if (Array.isArray(parents) && parents.length > 0) {
    return null;
  }
  const raw = statement?.result?.score?.raw;
  const max = statement?.result?.score?.max;
  return {
    score: typeof raw === 'number' && Number.isFinite(raw) ? raw : null,
    maxScore: typeof max === 'number' && Number.isFinite(max) ? max : null,
  };
}

/**
 * Creates the `<h5p-player>` element, wires it, and answers with its teardown.
 *
 * A port of the admin's `mountH5pPlayer` (`apps/admin/src/app/h5p/h5p-mount.ts`)
 * rather than an import of it: the two applications share no front-end
 * library, and `packages/shared` is Zod schemas. The write order is
 * deliberately identical and fails only in a real browser — so a correction to
 * either copy belongs in both. This copy additionally listens for results.
 *
 * **The order of the writes below is the boot.**
 * `attributeChangedCallback` renders when `content-id` changes and the
 * `loadContentCallback` *setter* renders when the callback identity changes,
 * while `render` returns early when the callback is unset. `this.root` is
 * created in `connectedCallback` and `render`'s own `catch` writes
 * `this.root.innerHTML`, so assigning the callback before the element is
 * connected reaches `undefined.innerHTML` inside an `async` method whose
 * promise the setter does not await: an unhandled rejection and a blank panel.
 * So the element is connected first, then given its id, then the load callback
 * **last** — the one render that does anything. The element is created here
 * rather than written in a template for the same reason, and the caller's
 * template then needs no `CUSTOM_ELEMENTS_SCHEMA`.
 *
 * **Nothing global is torn down**, and nothing can be: the component appends
 * the exercise's scripts to `document.head` deduped on `data-h5p-src` and
 * merges into `window.H5PIntegration` rather than replacing it.
 *
 * **Results.** The component re-dispatches H5P's `xAPI` events as a DOM
 * `CustomEvent` named `xAPI` whose `detail.statement` is the statement, already
 * filtered to this element's content id (`h5p-player.js`, `onxAPI`).
 */
export function mountH5pPlayer(container: HTMLElement, mount: H5pPlayerMount): () => void {
  const element = document.createElement(H5P_PLAYER_TAG) as H5pPlayerHost;

  const onXapi = (event: Event): void => {
    if (!mount.onResult || !(event instanceof CustomEvent)) {
      return;
    }
    const detail: unknown = event.detail;
    const statement =
      typeof detail === 'object' && detail !== null && 'statement' in detail
        ? (detail.statement as H5pXapiStatement | undefined)
        : undefined;
    const result = resultOfStatement(statement);
    if (result) {
      mount.onResult(result);
    }
  };

  // `replaceChildren`, so a re-run against the same container never leaves two.
  container.replaceChildren(element);

  element.addEventListener('xAPI', onXapi);

  // `setAttribute` and not the `contentId` property: the property setter only
  // writes this attribute, and the attribute behaves the same whether or not the
  // element has been upgraded.
  element.setAttribute('content-id', mount.contentId);

  // Last: this assignment is the render.
  element.loadContentCallback = () => {
    // The argument can only ever be the id this mount was created for, and the
    // caller has already fetched under it.
    return Promise.resolve(mount.model);
  };

  return () => {
    element.removeEventListener('xAPI', onXapi);
    // Not decoration: clearing the load callback is what makes a render already
    // in flight return early instead of calling back into a destroyed view.
    element.loadContentCallback = undefined;
    container.replaceChildren();
  };
}
