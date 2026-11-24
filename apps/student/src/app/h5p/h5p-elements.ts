import { InjectionToken } from '@angular/core';

/**
 * Registers `<h5p-player>` as a custom element. The import below is the
 * **only** mention of that package anywhere in `apps/student` outside
 * `package.json`, and the one point where its GPL-3.0 code enters the
 * classroom bundle, as a chunk of its own (see docs/h5p.md).
 *
 * **The import is dynamic so the package stays out of every other chunk.**
 * Made static it moves into the course-player route chunk, which every lesson
 * downloads, lessons with no exercise included.
 *
 * **It is a token rather than a bare call** so that a spec can leave
 * `h5p-player` undefined. A defined element upgrades the moment it is appended,
 * and `connectedCallback` constructs a `ResizeObserver` jsdom does not
 * implement and then awaits `onload` on scripts jsdom never fetches — a spec
 * that upgraded it would *hang* rather than fail. Undefined, it is an ordinary
 * `HTMLElement` carrying attributes and expando properties, which is the whole
 * surface `mountH5pPlayer` drives.
 *
 * `() => Promise<void>` and not `() => void`, unlike the admin's token of the
 * same name: the registration is behind a network fetch for the chunk, so
 * the caller has to be able to await it before creating the element.
 * `defineElements` guards on `customElements.get`, so repeat calls are no-ops.
 */
export const H5P_DEFINE_PLAYER_ELEMENT = new InjectionToken<() => Promise<void>>(
  'H5P player element',
  {
    providedIn: 'root',
    factory: () => async () => {
      const { defineElements } = await import('@lumieducation/h5p-webcomponents');
      defineElements(['h5p-player']);
    },
  },
);
