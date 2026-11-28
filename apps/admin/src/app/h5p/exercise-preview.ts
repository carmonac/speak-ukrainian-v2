import {
  Component,
  type ElementRef,
  effect,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { NzAlertModule } from 'ng-zorro-antd/alert';
import { NzSpinModule } from 'ng-zorro-antd/spin';
import { errorMessage } from '../core/http';
import { H5P_DEFINE_PLAYER_ELEMENT } from './h5p-elements';
import { mountH5pPlayer } from './h5p-mount';
import { H5pApi } from './h5p.api';

/** Plays one stored exercise, the way a student will see it. */
@Component({
  selector: 'app-exercise-preview',
  imports: [NzSpinModule, NzAlertModule],
  template: `
    @if (error(); as message) {
      <nz-alert nzType="error" [nzMessage]="message" nzShowIcon />
    }
    <nz-spin [nzSpinning]="loading()">
      <div #host class="host"></div>
    </nz-spin>
  `,
  styles: `
    .host {
      min-height: 240px;
    }
  `,
})
export class ExercisePreview {
  private readonly api = inject(H5pApi);

  readonly contentId = input.required<string>();

  private readonly host = viewChild.required<ElementRef<HTMLElement>>('host');
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);

  constructor() {
    inject(H5P_DEFINE_PLAYER_ELEMENT)();

    effect((onCleanup) => {
      const contentId = this.contentId();
      const container = this.host().nativeElement;
      let cancelled = false;
      let teardown: (() => void) | null = null;

      this.loading.set(true);
      this.error.set(null);
      // A position left by an earlier preview (or kept in the URL across a
      // reload) would make an Interactive Book resume there instead of at its
      // cover.
      clearBookHash();

      // The model is fetched before mounting and merely handed over, which
      // keeps load failures out of the widget's own unstyled error text.
      firstValueFrom(this.api.playerModel(contentId)).then(
        (model) => {
          if (cancelled) {
            return;
          }
          teardown = mountH5pPlayer(container, { contentId, model });
          this.loading.set(false);
        },
        (error: unknown) => {
          if (cancelled) {
            return;
          }
          this.error.set(errorMessage(error, 'The exercise could not be loaded.'));
          this.loading.set(false);
        },
      );

      onCleanup(() => {
        cancelled = true;
        teardown?.();
        clearBookHash();
      });
    });
  }
}

/**
 * Removes the position an H5P Interactive Book keeps in the address bar.
 *
 * The book writes `#h5pbookid=…&chapter=…&section=…` into **`top.location.hash`**
 * — the admin's own URL, since the player's iframe is same-origin — and reads it
 * back on start-up to resume at that chapter. Left behind, it makes the next
 * preview (and the course editor after a reload) open mid-book. `replaceState`
 * and not an assignment to `location.hash`: it fires neither `hashchange`, which
 * the books of earlier previews still listen to on `top`, nor `popstate`, which
 * the router would treat as a navigation.
 */
function clearBookHash(): void {
  if (!window.location.hash.includes('h5pbookid=')) {
    return;
  }
  const { pathname, search } = window.location;
  window.history.replaceState(window.history.state, '', pathname + search);
}
