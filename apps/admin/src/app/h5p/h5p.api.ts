import { Injectable, inject } from '@angular/core';
import type { Observable } from 'rxjs';
import type { H5pContent, H5pSaveResult, SaveH5pContentInput } from '@speakukrainian/shared';
import { ApiService } from '../core/http';

/** What `<h5p-editor>` needs to boot: Joubel's integration object and asset lists. */
export interface H5pEditorModel {
  integration: unknown;
  scripts: string[];
  styles: string[];
}

export interface H5pContentParameters {
  library: string;
  params: { metadata: unknown; params: unknown };
}

export interface H5pPlayerModel {
  contentId: string;
  integration: unknown;
  scripts: string[];
  styles: string[];
  embedTypes: ('iframe' | 'div')[];
}

@Injectable({ providedIn: 'root' })
export class H5pApi {
  private readonly api = inject(ApiService);

  editorModel(contentId?: string): Observable<H5pEditorModel> {
    return this.api.get<H5pEditorModel>(
      contentId === undefined ? '/h5p/editor' : `/h5p/editor/${contentId}`,
    );
  }

  contentParameters(contentId: string): Observable<H5pContentParameters> {
    return this.api.get<H5pContentParameters>(`/h5p/params/${contentId}`);
  }

  playerModel(contentId: string): Observable<H5pPlayerModel> {
    return this.api.get<H5pPlayerModel>(`/h5p/play/${contentId}`);
  }

  save(contentId: string | undefined, input: SaveH5pContentInput): Observable<H5pSaveResult> {
    return this.api.post<H5pSaveResult>(
      contentId === undefined ? '/h5p/editor' : `/h5p/editor/${contentId}`,
      input,
    );
  }

  uploadPackage(file: File): Observable<H5pSaveResult> {
    return this.api.upload<H5pSaveResult>('/h5p/content', file);
  }

  content(contentId: string): Observable<H5pContent> {
    return this.api.get<H5pContent>(`/h5p/content/${contentId}`);
  }
}
