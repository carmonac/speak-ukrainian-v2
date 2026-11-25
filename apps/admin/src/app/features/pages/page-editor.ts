import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { TextFieldModule } from '@angular/cdk/text-field';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { NzAlertModule } from 'ng-zorro-antd/alert';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzCardModule } from 'ng-zorro-antd/card';
import { NzFormModule } from 'ng-zorro-antd/form';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzMessageService } from 'ng-zorro-antd/message';
import { NzPopconfirmModule } from 'ng-zorro-antd/popconfirm';
import { NzSelectModule } from 'ng-zorro-antd/select';
import { NzSpinModule } from 'ng-zorro-antd/spin';
import { NzTooltipModule } from 'ng-zorro-antd/tooltip';
import {
  COMMON_LOCALES,
  MAX_SITE_FILE_BYTES,
  formatMaxSiteFileSize,
  savePageSchema,
  type PageDetail,
  type SavePageInput,
  type SiteFile,
} from '@speakukrainian/shared';
import { AdminApi } from '../../core/api';
import { CodeEditor } from '../../core/code-editor';
import { copyText, formatFileSize } from '../../core/files';
import { errorMessage } from '../../core/http';
import { NavStore } from '../../core/nav.store';
import { runtimeConfig } from '../../core/runtime-config';

interface TranslationRow {
  locale: string;
  value: string;
}
interface TextRow {
  key: string;
  translations: TranslationRow[];
}
interface PageForm {
  title: string;
  path: string;
  texts: TextRow[];
}

const NEW_PAGE_TEMPLATE = `<!doctype html>
<html lang="{{ locale }}">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>{{ title }}</title>
  </head>
  <body>
    <h1>{{ header }}</h1>
  </body>
</html>
`;

/**
 * The page form, identical for the main page and for every custom page:
 * title, URL path, translatable texts and the Handlebars content.
 */
@Component({
  selector: 'app-page-editor',
  imports: [
    FormsModule,
    RouterLink,
    TextFieldModule,
    CodeEditor,
    NzCardModule,
    NzFormModule,
    NzInputModule,
    NzSelectModule,
    NzButtonModule,
    NzIconModule,
    NzAlertModule,
    NzSpinModule,
    NzTooltipModule,
    NzPopconfirmModule,
  ],
  templateUrl: './page-editor.html',
  styleUrl: './page-editor.scss',
})
export class PageEditor {
  private readonly api = inject(AdminApi);
  private readonly nav = inject(NavStore);
  private readonly router = inject(Router);
  private readonly message = inject(NzMessageService);

  /** Route data: which page this screen edits. */
  readonly mode = input.required<'main' | 'new' | 'edit'>();
  readonly id = input<string>();

  protected readonly locales = COMMON_LOCALES;
  protected readonly loading = signal(true);
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly page = signal<PageDetail | null>(null);
  protected readonly form = signal<PageForm>({ title: '', path: '', texts: [] });
  protected readonly content = signal('');

  protected readonly previewLocale = signal('en');
  protected readonly previewLoading = signal(false);

  /** Files uploaded from this screen since it was opened, newest first. */
  protected readonly uploaded = signal<SiteFile[]>([]);
  protected readonly uploading = signal(0);
  protected readonly maxFileSize = formatMaxSiteFileSize();
  protected readonly size = formatFileSize;

  protected readonly heading = computed(() => {
    switch (this.mode()) {
      case 'main':
        return 'Edit main page';
      case 'new':
        return 'Add new page';
      default:
        return this.page()?.title ?? 'Edit page';
    }
  });

  protected readonly publicUrl = computed(() => {
    const page = this.page();
    if (!page) {
      return null;
    }
    return `${runtimeConfig().siteUrl}${page.isMain ? '/' : page.path}`;
  });

  constructor() {
    // Reloads whenever the route points this (reused) component at another page.
    effect(() => {
      const mode = this.mode();
      const id = this.id();
      void this.load(mode, id);
    });
  }

  private async load(mode: 'main' | 'new' | 'edit', id: string | undefined): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    this.page.set(null);

    if (mode === 'new') {
      this.form.set({
        title: '',
        path: '/',
        texts: [{ key: 'header', translations: [{ locale: 'en', value: '' }] }],
      });
      this.content.set(NEW_PAGE_TEMPLATE);
      this.loading.set(false);
      return;
    }

    try {
      const page = await firstValueFrom(mode === 'main' ? this.api.mainPage() : this.api.page(id!));
      this.apply(page);
    } catch (error) {
      this.error.set(errorMessage(error, 'The page could not be loaded.'));
    } finally {
      this.loading.set(false);
    }
  }

  private apply(page: PageDetail): void {
    this.page.set(page);
    this.form.set({
      title: page.title,
      path: page.path,
      texts: page.texts.map((text) => ({
        key: text.key,
        translations: text.translations.map((t) => ({ ...t })),
      })),
    });
    this.content.set(page.content);
  }

  protected addText(): void {
    this.form().texts.push({ key: '', translations: [{ locale: 'en', value: '' }] });
  }

  protected removeText(index: number): void {
    this.form().texts.splice(index, 1);
  }

  protected addTranslation(text: TextRow): void {
    const used = new Set(text.translations.map((t) => t.locale));
    const next = this.locales.find((locale) => !used.has(locale.code))?.code ?? '';
    text.translations.push({ locale: next, value: '' });
  }

  protected removeTranslation(text: TextRow, index: number): void {
    text.translations.splice(index, 1);
  }

  /** A language already chosen for another translation of the same text. */
  protected isTaken(text: TextRow, row: TranslationRow, code: string): boolean {
    return row.locale !== code && text.translations.some((t) => t.locale === code);
  }

  private payload(): SavePageInput | null {
    const form = this.form();
    const parsed = savePageSchema.safeParse({
      title: form.title,
      path: form.path.trim(),
      content: this.content(),
      texts: form.texts
        .filter((text) => text.key.trim() !== '')
        .map((text) => ({
          key: text.key.trim(),
          translations: text.translations.filter((t) => t.locale !== ''),
        })),
    });
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      this.error.set(
        issue ? `${issue.path.join('.') || 'Form'}: ${issue.message}` : 'Check the form.',
      );
      return null;
    }
    return parsed.data;
  }

  protected async save(): Promise<void> {
    const payload = this.payload();
    if (!payload || this.saving()) {
      return;
    }
    this.saving.set(true);
    this.error.set(null);
    try {
      const existing = this.page();
      const saved = existing
        ? await firstValueFrom(this.api.updatePage(existing.id, payload))
        : await firstValueFrom(this.api.createPage(payload));
      this.message.success('Page saved');
      void this.nav.refreshPages();
      if (existing) {
        this.apply(saved);
      } else {
        await this.router.navigate(['/pages', saved.id]);
      }
    } catch (error) {
      this.error.set(errorMessage(error, 'The page could not be saved.'));
    } finally {
      this.saving.set(false);
    }
  }

  protected async remove(): Promise<void> {
    const page = this.page();
    if (!page) {
      return;
    }
    try {
      await firstValueFrom(this.api.deletePage(page.id));
      this.message.success('Page deleted');
      void this.nav.refreshPages();
      await this.router.navigate(['/']);
    } catch (error) {
      this.error.set(errorMessage(error, 'The page could not be deleted.'));
    }
  }

  /**
   * Opens the unsaved form, rendered, in a new tab.
   *
   * The tab is opened first, inside the click, because a browser blocks a tab
   * opened after an asynchronous call as a pop-up. It then goes to a link on
   * the public site, where the page runs sandboxed on an origin of its own:
   * its scripts work as they will once saved, and cannot reach this panel.
   */
  protected async openPreview(): Promise<void> {
    if (this.previewLoading()) {
      return;
    }
    const tab = window.open('', '_blank');
    if (!tab) {
      this.message.error('The browser blocked the preview tab. Allow pop-ups for this panel.');
      return;
    }
    // Cuts the tab's way back to this window before any page loads in it.
    tab.opener = null;
    tab.document.title = 'Preview';
    tab.document.body.textContent = 'Rendering the preview…';

    const form = this.form();
    this.previewLoading.set(true);
    try {
      const { url } = await firstValueFrom(
        this.api.previewLink({
          title: form.title,
          content: this.content(),
          locale: this.previewLocale(),
          texts: form.texts
            .filter((text) => text.key.trim() !== '')
            .map((text) => ({
              key: text.key.trim(),
              translations: text.translations.filter((t) => t.locale !== ''),
            })),
        }),
      );
      tab.location.replace(url);
    } catch (error) {
      tab.close();
      this.message.error(errorMessage(error, 'The preview could not be rendered.'));
    } finally {
      this.previewLoading.set(false);
    }
  }

  /** Uploads the chosen files one after another; each gets a public URL. */
  protected async onFilesChosen(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const files = [...(input.files ?? [])];
    // So choosing the same file again fires the event again.
    input.value = '';

    for (const file of files) {
      if (file.size > MAX_SITE_FILE_BYTES) {
        this.message.error(`${file.name} is larger than ${this.maxFileSize} and was not uploaded.`);
        continue;
      }
      this.uploading.update((n) => n + 1);
      try {
        const saved = await firstValueFrom(this.api.uploadFile(file));
        this.uploaded.update((list) => [saved, ...list]);
      } catch (error) {
        this.message.error(errorMessage(error, `${file.name} could not be uploaded.`));
      } finally {
        this.uploading.update((n) => n - 1);
      }
    }
  }

  protected async copyUrl(url: string): Promise<void> {
    if (await copyText(url)) {
      this.message.success('URL copied');
    } else {
      this.message.error('The URL could not be copied. Select it and copy it by hand.');
    }
  }
}
