import {
  Component,
  type ElementRef,
  type OnDestroy,
  ViewEncapsulation,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  model,
  signal,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Editor, Node, mergeAttributes, type Content } from '@tiptap/core';
import Image from '@tiptap/extension-image';
import { Placeholder } from '@tiptap/extensions';
import { NodeSelection } from '@tiptap/pm/state';
import StarterKit from '@tiptap/starter-kit';
import { firstValueFrom } from 'rxjs';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzMessageService } from 'ng-zorro-antd/message';
import { NzPopoverModule } from 'ng-zorro-antd/popover';
import { NzTooltipModule } from 'ng-zorro-antd/tooltip';
import { MAX_SITE_FILE_BYTES, formatMaxSiteFileSize } from '@speakukrainian/shared';
import { AdminApi } from './api';
import { errorMessage } from './http';

/**
 * A `<video>` block: an uploaded video file, always with its controls. Tiptap
 * has no video node of its own; this is the whole of one.
 */
const Video = Node.create({
  name: 'video',
  group: 'block',
  atom: true,
  draggable: true,
  addAttributes() {
    return { src: { default: null } };
  },
  parseHTML() {
    return [{ tag: 'video[src]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ['video', mergeAttributes(HTMLAttributes, { controls: '' })];
  },
});

/** The emojis offered by the picker; any other can still be typed or pasted. */
const EMOJIS = [
  '😀 😃 😄 😊 🙂 😉 😍 🥰 😎 🤩 🤔 😅',
  '👋 👍 👏 🙌 💪 🙏 ✌️ 👌 🤝 ✍️ 👀 🧠',
  '❤️ 💛 💙 🇺🇦 🌻 🌾 ⭐ ✨ 🔥 🎉 🎁 🏆',
  '📚 📖 ✏️ 📝 🎧 🎬 🗣️ 💬 ✅ ❓ 💡 🎯',
  '☕ 🍰 🥟 🍯 🌍 ✈️ 🏠 ⏰ 📅 🚀 🎵 😂',
]
  .join(' ')
  .split(' ');

type Upload = 'image' | 'video';

/**
 * A friendly rich-text editor (Tiptap) bound two-way to `value`, as HTML.
 *
 * The toolbar covers what the course summary needs: bold, italic, underline,
 * two heading sizes, lists, links, emojis, and images and videos uploaded as
 * site files (the same uploads the Storage section lists). The API sanitizes
 * whatever is saved; this only decides what is easy to write.
 *
 * Tiptap runs outside Angular: its `transaction` event bumps a signal, which
 * is all a zoneless app needs to refresh the toolbar.
 */
@Component({
  selector: 'app-rich-text-editor',
  imports: [
    FormsModule,
    NzButtonModule,
    NzIconModule,
    NzInputModule,
    NzPopoverModule,
    NzTooltipModule,
  ],
  encapsulation: ViewEncapsulation.None,
  template: `
    <div class="rte" [class.rte-focused]="focused()">
      <div class="rte-toolbar" role="toolbar" aria-label="Formatting">
        <div class="rte-group">
          <button
            nz-button
            nzType="text"
            type="button"
            nz-tooltip
            nzTooltipTitle="Bold (Ctrl+B)"
            aria-label="Bold"
            [class.rte-active]="active().bold"
            (click)="run('bold')"
          >
            <nz-icon nzType="bold" />
          </button>
          <button
            nz-button
            nzType="text"
            type="button"
            nz-tooltip
            nzTooltipTitle="Italic (Ctrl+I)"
            aria-label="Italic"
            [class.rte-active]="active().italic"
            (click)="run('italic')"
          >
            <nz-icon nzType="italic" />
          </button>
          <button
            nz-button
            nzType="text"
            type="button"
            nz-tooltip
            nzTooltipTitle="Underline (Ctrl+U)"
            aria-label="Underline"
            [class.rte-active]="active().underline"
            (click)="run('underline')"
          >
            <nz-icon nzType="underline" />
          </button>
        </div>
        <div class="rte-group">
          <button
            nz-button
            nzType="text"
            type="button"
            nz-tooltip
            nzTooltipTitle="Big heading"
            aria-label="Big heading"
            class="rte-heading"
            [class.rte-active]="active().h2"
            (click)="run('h2')"
          >
            H1
          </button>
          <button
            nz-button
            nzType="text"
            type="button"
            nz-tooltip
            nzTooltipTitle="Small heading"
            aria-label="Small heading"
            class="rte-heading rte-small"
            [class.rte-active]="active().h3"
            (click)="run('h3')"
          >
            H2
          </button>
        </div>
        <div class="rte-group">
          <button
            nz-button
            nzType="text"
            type="button"
            nz-tooltip
            nzTooltipTitle="Bulleted list"
            aria-label="Bulleted list"
            [class.rte-active]="active().bulletList"
            (click)="run('bulletList')"
          >
            <nz-icon nzType="unordered-list" />
          </button>
          <button
            nz-button
            nzType="text"
            type="button"
            nz-tooltip
            nzTooltipTitle="Numbered list"
            aria-label="Numbered list"
            [class.rte-active]="active().orderedList"
            (click)="run('orderedList')"
          >
            <nz-icon nzType="ordered-list" />
          </button>
        </div>
        <div class="rte-group">
          <button
            nz-button
            nzType="text"
            type="button"
            nz-tooltip
            nzTooltipTitle="Link"
            aria-label="Link"
            [class.rte-active]="active().link"
            nz-popover
            nzPopoverTrigger="click"
            [nzPopoverContent]="linkForm"
            [nzPopoverVisible]="linkOpen()"
            (nzPopoverVisibleChange)="onLinkOpen($event)"
          >
            <nz-icon nzType="link" />
          </button>
          <button
            nz-button
            nzType="text"
            type="button"
            nz-tooltip
            nzTooltipTitle="Emoji"
            aria-label="Emoji"
            nz-popover
            nzPopoverTrigger="click"
            [nzPopoverContent]="emojiGrid"
            [nzPopoverVisible]="emojiOpen()"
            (nzPopoverVisibleChange)="emojiOpen.set($event)"
          >
            <nz-icon nzType="smile" />
          </button>
        </div>
        <div class="rte-group">
          <button
            nz-button
            nzType="text"
            type="button"
            nz-tooltip
            nzTooltipTitle="Add a picture"
            aria-label="Add a picture"
            [nzLoading]="uploading() === 'image'"
            [disabled]="uploading() !== null"
            (click)="imageInput.click()"
          >
            @if (uploading() !== 'image') {
              <nz-icon nzType="picture" />
            }
          </button>
          <button
            nz-button
            nzType="text"
            type="button"
            nz-tooltip
            nzTooltipTitle="Add a video"
            aria-label="Add a video"
            [nzLoading]="uploading() === 'video'"
            [disabled]="uploading() !== null"
            (click)="videoInput.click()"
          >
            @if (uploading() !== 'video') {
              <nz-icon nzType="video-camera" />
            }
          </button>
          <input
            #imageInput
            type="file"
            accept="image/*"
            hidden
            (change)="upload($event, 'image')"
          />
          <input
            #videoInput
            type="file"
            accept="video/mp4,video/webm,video/ogg,video/quicktime"
            hidden
            (change)="upload($event, 'video')"
          />
        </div>
        <div class="rte-group">
          <button
            nz-button
            nzType="text"
            type="button"
            nz-tooltip
            nzTooltipTitle="Undo (Ctrl+Z)"
            aria-label="Undo"
            [disabled]="!active().canUndo"
            (click)="run('undo')"
          >
            <nz-icon nzType="undo" />
          </button>
          <button
            nz-button
            nzType="text"
            type="button"
            nz-tooltip
            nzTooltipTitle="Redo (Ctrl+Y)"
            aria-label="Redo"
            [disabled]="!active().canRedo"
            (click)="run('redo')"
          >
            <nz-icon nzType="redo" />
          </button>
        </div>
      </div>
      <div #host class="rte-content" [attr.id]="inputId() || null"></div>
    </div>

    <ng-template #linkForm>
      <form class="rte-link-form" (ngSubmit)="applyLink()">
        <input
          nz-input
          name="href"
          placeholder="https://example.com"
          [(ngModel)]="linkHref"
          aria-label="Link address"
        />
        <div class="rte-link-actions">
          @if (active().link) {
            <button nz-button type="button" nzDanger (click)="removeLink()">Remove link</button>
          }
          <button nz-button nzType="primary" type="submit">Apply</button>
        </div>
      </form>
    </ng-template>

    <ng-template #emojiGrid>
      <div class="rte-emojis" aria-label="Emojis">
        @for (emoji of emojis; track emoji) {
          <button
            type="button"
            class="rte-emoji"
            [attr.aria-label]="emoji"
            (click)="insertEmoji(emoji)"
          >
            {{ emoji }}
          </button>
        }
      </div>
    </ng-template>
  `,
  styles: `
    .rte {
      border: 1px solid #d9d9d9;
      border-radius: 6px;
      background: #fff;
      transition:
        border-color 0.2s,
        box-shadow 0.2s;
    }
    .rte.rte-focused {
      border-color: #4096ff;
      box-shadow: 0 0 0 2px rgba(5, 145, 255, 0.1);
    }
    .rte-toolbar {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
      padding: 4px 6px;
      border-bottom: 1px solid #f0f0f0;
      background: #fafafa;
      border-radius: 6px 6px 0 0;
    }
    .rte-group {
      display: flex;
      gap: 2px;
      padding-right: 4px;
      border-right: 1px solid #f0f0f0;
    }
    .rte-group:last-child {
      border-right: none;
    }
    .rte-toolbar .rte-active,
    .rte-toolbar .rte-active:hover {
      background: #e6f4ff;
      color: #1677ff;
    }
    .rte-heading {
      font-weight: 700;
      min-width: 32px;
    }
    .rte-heading.rte-small {
      font-size: 12px;
    }
    .rte-content .ProseMirror {
      min-height: 140px;
      max-height: 480px;
      overflow-y: auto;
      padding: 8px 12px;
      outline: none;
      line-height: 1.6;
    }
    .rte-content .ProseMirror > :first-child {
      margin-top: 0;
    }
    .rte-content .ProseMirror p {
      margin: 0 0 0.6em;
    }
    .rte-content .ProseMirror h2 {
      font-size: 1.4em;
      margin: 0.8em 0 0.4em;
    }
    .rte-content .ProseMirror h3 {
      font-size: 1.15em;
      margin: 0.8em 0 0.4em;
    }
    .rte-content .ProseMirror ul,
    .rte-content .ProseMirror ol {
      padding-left: 1.5em;
      margin: 0 0 0.6em;
    }
    .rte-content .ProseMirror li p {
      margin: 0;
    }
    .rte-content .ProseMirror blockquote {
      border-left: 3px solid #d9d9d9;
      margin: 0 0 0.6em;
      padding-left: 1em;
      color: #595959;
    }
    .rte-content .ProseMirror img,
    .rte-content .ProseMirror video {
      display: block;
      max-width: 100%;
      max-height: 360px;
      margin: 0.6em 0;
      border-radius: 6px;
    }
    .rte-content .ProseMirror .ProseMirror-selectednode {
      outline: 3px solid #69b1ff;
    }
    .rte-content .ProseMirror p.is-editor-empty:first-child::before {
      content: attr(data-placeholder);
      float: left;
      height: 0;
      color: #bfbfbf;
      pointer-events: none;
    }
    .rte-link-form {
      display: flex;
      flex-direction: column;
      gap: 8px;
      width: 280px;
    }
    .rte-link-actions {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
    }
    .rte-emojis {
      display: grid;
      grid-template-columns: repeat(12, 32px);
      gap: 2px;
    }
    .rte-emoji {
      width: 32px;
      height: 32px;
      border: none;
      border-radius: 4px;
      background: transparent;
      font-size: 20px;
      line-height: 32px;
      cursor: pointer;
      padding: 0;
    }
    .rte-emoji:hover,
    .rte-emoji:focus-visible {
      background: #f0f0f0;
    }
  `,
})
export class RichTextEditor implements OnDestroy {
  /** HTML; written back on every change. */
  readonly value = model('');
  readonly placeholder = input('');
  /** Given to the editable area, so a form label can point at it. */
  readonly inputId = input('');

  private readonly api = inject(AdminApi);
  private readonly message = inject(NzMessageService);
  private readonly host = viewChild.required<ElementRef<HTMLElement>>('host');
  private editor: Editor | null = null;
  /** Bumped on every editor transaction; the toolbar state depends on it. */
  private readonly revision = signal(0);

  protected readonly emojis = EMOJIS;
  protected readonly focused = signal(false);
  protected readonly uploading = signal<Upload | null>(null);
  protected readonly linkOpen = signal(false);
  protected readonly emojiOpen = signal(false);
  protected linkHref = '';

  protected readonly active = computed(() => {
    this.revision();
    const editor = this.editor;
    return {
      bold: editor?.isActive('bold') ?? false,
      italic: editor?.isActive('italic') ?? false,
      underline: editor?.isActive('underline') ?? false,
      h2: editor?.isActive('heading', { level: 2 }) ?? false,
      h3: editor?.isActive('heading', { level: 3 }) ?? false,
      bulletList: editor?.isActive('bulletList') ?? false,
      orderedList: editor?.isActive('orderedList') ?? false,
      link: editor?.isActive('link') ?? false,
      canUndo: editor?.can().undo() ?? false,
      canRedo: editor?.can().redo() ?? false,
    };
  });

  constructor() {
    afterNextRender(() => {
      this.editor = new Editor({
        element: this.host().nativeElement,
        content: this.value(),
        extensions: [
          StarterKit.configure({
            heading: { levels: [2, 3] },
            code: false,
            codeBlock: false,
            horizontalRule: false,
            link: {
              openOnClick: false,
              autolink: true,
              defaultProtocol: 'https',
              HTMLAttributes: { target: '_blank', rel: 'noopener noreferrer' },
            },
          }),
          Image,
          Video,
          Placeholder.configure({ placeholder: () => this.placeholder() }),
        ],
        onTransaction: () => this.revision.update((n) => n + 1),
        onUpdate: ({ editor }) => this.value.set(editor.isEmpty ? '' : editor.getHTML()),
        onFocus: () => this.focused.set(true),
        onBlur: () => this.focused.set(false),
      });
      this.revision.update((n) => n + 1);
    });

    // A value set from outside (a course loaded after the editor) replaces
    // the content; the editor's own updates come back equal and are ignored.
    effect(() => {
      const value = this.value();
      const editor = this.editor;
      if (editor && value !== (editor.isEmpty ? '' : editor.getHTML())) {
        editor.commands.setContent(value, { emitUpdate: false });
      }
    });
  }

  ngOnDestroy(): void {
    this.editor?.destroy();
    this.editor = null;
  }

  protected run(
    command:
      | 'bold'
      | 'italic'
      | 'underline'
      | 'h2'
      | 'h3'
      | 'bulletList'
      | 'orderedList'
      | 'undo'
      | 'redo',
  ): void {
    const chain = this.editor?.chain().focus();
    if (!chain) {
      return;
    }
    switch (command) {
      case 'bold':
        chain.toggleBold().run();
        break;
      case 'italic':
        chain.toggleItalic().run();
        break;
      case 'underline':
        chain.toggleUnderline().run();
        break;
      case 'h2':
        chain.toggleHeading({ level: 2 }).run();
        break;
      case 'h3':
        chain.toggleHeading({ level: 3 }).run();
        break;
      case 'bulletList':
        chain.toggleBulletList().run();
        break;
      case 'orderedList':
        chain.toggleOrderedList().run();
        break;
      case 'undo':
        chain.undo().run();
        break;
      case 'redo':
        chain.redo().run();
        break;
    }
  }

  protected onLinkOpen(open: boolean): void {
    if (open) {
      this.linkHref = (this.editor?.getAttributes('link')['href'] as string | undefined) ?? '';
    }
    this.linkOpen.set(open);
  }

  protected applyLink(): void {
    const editor = this.editor;
    const href = normaliseHref(this.linkHref);
    this.linkOpen.set(false);
    if (!editor) {
      return;
    }
    if (!href) {
      this.removeLink();
      return;
    }
    if (editor.state.selection.empty && !editor.isActive('link')) {
      // Nothing selected: the address itself becomes the link text.
      editor
        .chain()
        .focus()
        .insertContent({ type: 'text', text: href, marks: [{ type: 'link', attrs: { href } }] })
        .run();
      return;
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href }).run();
  }

  protected removeLink(): void {
    this.linkOpen.set(false);
    this.editor?.chain().focus().extendMarkRange('link').unsetLink().run();
  }

  protected insertEmoji(emoji: string): void {
    this.emojiOpen.set(false);
    this.insert(emoji);
  }

  /**
   * Inserts at the cursor. When a picture or video is selected (it is right
   * after one is added), inserts after it instead of replacing it.
   */
  private insert(content: Content): void {
    const editor = this.editor;
    if (!editor) {
      return;
    }
    const { selection } = editor.state;
    const chain = editor.chain().focus();
    if (selection instanceof NodeSelection) {
      chain.insertContentAt(selection.to, content).run();
    } else {
      chain.insertContent(content).run();
    }
  }

  /** Uploads the chosen file as a site file and inserts it where the cursor is. */
  protected async upload(event: Event, kind: Upload): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) {
      return;
    }
    if (!file.type.startsWith(`${kind}/`)) {
      this.message.error(`${file.name} is not ${kind === 'image' ? 'a picture' : 'a video'}.`);
      return;
    }
    if (file.size > MAX_SITE_FILE_BYTES) {
      this.message.error(
        `${file.name} is larger than ${formatMaxSiteFileSize()}. ` +
          (kind === 'video' ? 'Try a shorter or smaller video.' : 'Try a smaller picture.'),
      );
      return;
    }

    this.uploading.set(kind);
    try {
      const saved = await firstValueFrom(this.api.uploadFile(file));
      const content =
        kind === 'image'
          ? { type: 'image', attrs: { src: saved.url, alt: altFromName(file.name) } }
          : { type: 'video', attrs: { src: saved.url } };
      this.insert(content);
    } catch (error) {
      this.message.error(errorMessage(error, `${file.name} could not be uploaded.`));
    } finally {
      this.uploading.set(null);
    }
  }
}

/** What a person types as a link becomes an address a browser can open. */
function normaliseHref(value: string): string {
  const href = value.trim();
  if (!href) {
    return '';
  }
  if (/^(https?:|mailto:)/i.test(href)) {
    return href;
  }
  if (/^[^\s@/]+@[^\s@/]+\.[^\s@/]+$/.test(href)) {
    return `mailto:${href}`;
  }
  return `https://${href.replace(/^\/+/, '')}`;
}

/** `my-photo_2.jpg` → `my photo 2`: better than no description at all. */
function altFromName(name: string): string {
  return name
    .replace(/\.[^.]+$/, '')
    .replace(/[-_]+/g, ' ')
    .trim();
}
