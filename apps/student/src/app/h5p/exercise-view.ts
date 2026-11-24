import {
  Component,
  type ElementRef,
  afterNextRender,
  effect,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { NzAlertModule } from 'ng-zorro-antd/alert';
import { NzSpinModule } from 'ng-zorro-antd/spin';
import { errorMessage } from '../core/http';
import { H5P_DEFINE_PLAYER_ELEMENT } from './h5p-elements';
import { mountH5pPlayer, type H5pPlayerModel, type H5pResult } from './h5p-player';
import { H5pApi } from './h5p.api';

type Status = 'idle' | 'loading' | 'ready' | 'failed';

/**
 * Plays one exercise and reports its outcome.
 *
 * The model is fetched first and merely handed to the widget, which keeps load
 * failures (a 403 for a course that is not owned, say) out of the widget's own
 * unstyled error text.
 */
@Component({
  selector: 'app-exercise-view',
  imports: [NzSpinModule, NzAlertModule],
  template: `
    @if (status() === 'failed') {
      <nz-alert
        nzType="error"
        [nzMessage]="error() ?? 'The exercise could not be loaded.'"
        nzShowIcon
      />
    }
    <nz-spin [nzSpinning]="status() === 'loading'">
      <div #host class="host" [class.empty]="status() === 'failed'"></div>
    </nz-spin>
  `,
  styles: `
    /* The player sizes itself; this only stops the page jumping while it loads. */
    .host {
      min-height: 240px;
    }
    .host.empty {
      min-height: 0;
    }
  `,
})
export class ExerciseView {
  private readonly api = inject(H5pApi);
  private readonly defineElement = inject(H5P_DEFINE_PLAYER_ELEMENT);

  readonly contentId = input.required<string>();
  readonly lang = input('en');
  /** The exercise as a whole was completed or answered. */
  readonly result = output<H5pResult>();

  protected readonly status = signal<Status>('idle');
  protected readonly error = signal<string | null>(null);

  private readonly host = viewChild.required<ElementRef<HTMLElement>>('host');
  private readonly ready = signal(false);

  constructor() {
    afterNextRender(() => this.ready.set(true));

    // Depends on ready / contentId / lang / host only, so nothing else on the
    // page can remount a player mid-exercise.
    effect((onCleanup) => {
      if (!this.ready()) {
        return;
      }
      const contentId = this.contentId();
      const lang = this.lang();
      const host = this.host().nativeElement;

      let cancelled = false;
      let teardown: (() => void) | null = null;
      onCleanup(() => {
        cancelled = true;
        teardown?.();
      });

      this.status.set('loading');
      this.error.set(null);
      void this.load(contentId, lang).then(
        (model) => {
          // A late answer for an exercise the student has already left.
          if (cancelled) {
            return;
          }
          teardown = mountH5pPlayer(host, {
            contentId,
            model,
            onResult: (result) => {
              if (!cancelled) {
                this.result.emit(result);
              }
            },
          });
          this.status.set('ready');
        },
        (error: unknown) => {
          if (!cancelled) {
            this.error.set(errorMessage(error, 'The exercise could not be loaded.'));
            this.status.set('failed');
          }
        },
      );
    });
  }

  private async load(contentId: string, lang: string): Promise<H5pPlayerModel> {
    await this.defineElement();
    return firstValueFrom(this.api.playerModel(contentId, lang));
  }
}
