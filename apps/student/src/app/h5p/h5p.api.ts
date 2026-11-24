import { Injectable, inject } from '@angular/core';
import type { Observable } from 'rxjs';
import { ApiService } from '../core/http';
import type { H5pPlayerModel } from './h5p-player';

@Injectable({ providedIn: 'root' })
export class H5pApi {
  private readonly api = inject(ApiService);

  /** `lang` sets the language of the player's own buttons and labels. */
  playerModel(contentId: string, lang: string): Observable<H5pPlayerModel> {
    return this.api.get<H5pPlayerModel>(`/h5p/play/${contentId}`, { lang });
  }
}
