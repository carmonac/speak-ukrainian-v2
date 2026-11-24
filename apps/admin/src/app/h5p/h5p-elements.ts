import { InjectionToken } from '@angular/core';
import { defineElements } from '@lumieducation/h5p-webcomponents';

/**
 * Registers the `<h5p-editor>` custom element. Behind a token so a test can
 * leave the tag undefined.
 *
 * `@lumieducation/h5p-webcomponents` is GPL-3.0; see docs/h5p.md.
 */
export const H5P_DEFINE_EDITOR_ELEMENT = new InjectionToken<() => void>('H5P editor element', {
  providedIn: 'root',
  factory: () => () => {
    defineElements(['h5p-editor']);
  },
});

export const H5P_DEFINE_PLAYER_ELEMENT = new InjectionToken<() => void>('H5P player element', {
  providedIn: 'root',
  factory: () => () => {
    defineElements(['h5p-player']);
  },
});
