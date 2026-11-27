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
import type { ResolvedPos } from '@tiptap/pm/model';
import { NodeSelection, TextSelection, type Transaction } from '@tiptap/pm/state';
import StarterKit from '@tiptap/starter-kit';
import { firstValueFrom } from 'rxjs';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzMessageService } from 'ng-zorro-antd/message';
import { NzPopoverModule } from 'ng-zorro-antd/popover';
import { NzTooltipModule } from 'ng-zorro-antd/tooltip';
import {
  CALLOUTS,
  MAX_SITE_FILE_BYTES,
  calloutClasses,
  calloutKindOf,
  formatMaxSiteFileSize,
  type CalloutKind,
} from '@speakukrainian/shared';
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

/**
 * A highlight block (`<div class="callout callout-<kind>">`) around ordinary
 * blocks. Callouts do not nest: a box inside a box reads as a mistake. Its
 * label and colours come from the shared stylesheet (`rich-text-callouts.ts`),
 * injected once in `main.ts`, so the editor shows what students will see.
 */
const Callout = Node.create({
  name: 'callout',
  group: 'block',
  content: '(paragraph | heading | bulletList | orderedList | blockquote | image | video)+',
  defining: true,
  addAttributes() {
    return {
      kind: {
        default: 'tip',
        parseHTML: (element) => calloutKindOf(element.getAttribute('class') ?? undefined) ?? 'tip',
        renderHTML: (attributes) => ({ class: calloutClasses(attributes['kind'] as CalloutKind) }),
      },
    };
  },
  parseHTML() {
    return [
      {
        tag: 'div',
        getAttrs: (element) =>
          calloutKindOf(element.getAttribute('class') ?? undefined) ? null : false,
      },
    ];
  },
  renderHTML({ HTMLAttributes }) {
    return ['div', HTMLAttributes, 0];
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
 * The toolbar covers what the course texts need: bold, italic, underline,
 * two heading sizes, lists, highlight boxes, links, emojis, and images and
 * videos uploaded as site files (the same uploads the Storage section lists). The API sanitizes
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
            nzTooltipTitle="Highlight box: key concept, tip, reminder…"
            aria-label="Highlight box"
            [class.rte-active]="active().callout !== null"
            nz-popover
            nzPopoverTrigger="click"
            nzPopoverPlacement="bottomLeft"
            [nzPopoverContent]="calloutMenu"
            [nzPopoverVisible]="calloutOpen()"
            (nzPopoverVisibleChange)="calloutOpen.set($event)"
          >
            <nz-icon nzType="highlight" />
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

    <ng-template #calloutMenu>
      <div class="rte-callouts" role="menu" aria-label="Highlight boxes">
        <p class="rte-callouts-hint">
          {{
            active().callout
              ? 'Change the kind of this box, or remove it.'
              : 'Puts the selected text, or the current paragraph, in a box.'
          }}
        </p>
        @for (callout of callouts; track callout.kind) {
          <button
            type="button"
            role="menuitem"
            class="rte-callout-option"
            [class.rte-callout-current]="active().callout === callout.kind"
            [style.--callout-color]="callout.color"
            (click)="setCallout(callout.kind)"
          >
            <span class="rte-callout-icon" aria-hidden="true">{{ callout.icon }}</span>
            {{ callout.label }}
          </button>
        }
        @if (active().callout) {
          <button nz-button nzBlock nzDanger type="button" (click)="removeCallout()">
            Remove the box (keep the text)
          </button>
        }
      </div>
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
    .rte-content .ProseMirror .callout > :last-child {
      margin-bottom: 0;
    }
    .rte-callouts {
      display: flex;
      flex-direction: column;
      gap: 2px;
      width: 240px;
    }
    .rte-callouts-hint {
      margin: 0 0 6px;
      color: rgba(0, 0, 0, 0.45);
      font-size: 12px;
    }
    .rte-callout-option {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 6px 8px;
      border: none;
      border-left: 4px solid var(--callout-color);
      border-radius: 4px;
      background: color-mix(in srgb, var(--callout-color) 8%, transparent);
      text-align: left;
      cursor: pointer;
      font: inherit;
    }
    .rte-callout-option:hover,
    .rte-callout-option:focus-visible {
      background: color-mix(in srgb, var(--callout-color) 18%, transparent);
    }
    .rte-callout-option.rte-callout-current {
      font-weight: 600;
      outline: 1px solid var(--callout-color);
    }
    .rte-callouts [nz-button] {
      margin-top: 6px;
    }
    .rte-callout-icon {
      width: 20px;
      text-align: center;
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
  protected readonly callouts = CALLOUTS;
  protected readonly calloutOpen = signal(false);
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
      callout: editor?.isActive('callout')
        ? ((editor.getAttributes('callout')['kind'] as CalloutKind | undefined) ?? null)
        : null,
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
          Callout,
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
        // Not an edit, so not undoable: otherwise Undo right after a course
        // loads empties the field, and a save then stores it empty.
        editor
          .chain()
          .setMeta('addToHistory', false)
          .setContent(value, { emitUpdate: false })
          .run();
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

  /** Puts the selection in a box of `kind`, or changes the kind of the box it is in. */
  protected setCallout(kind: CalloutKind): void {
    this.calloutOpen.set(false);
    const editor = this.editor;
    if (!editor) {
      return;
    }
    if (editor.isActive('callout')) {
      editor.chain().focus().updateAttributes('callout', { kind }).run();
      return;
    }
    // Checked first: a chain that fails part-way still applies its earlier steps.
    if (!editor.can().chain().command(isolateSelection).wrapIn('callout', { kind }).run()) {
      this.message.info('Put the cursor in a paragraph, or select some text, first.');
      return;
    }
    editor.chain().focus().command(isolateSelection).wrapIn('callout', { kind }).run();
  }

  /**
   * Takes the whole box away; its content stays where it was. `lift` alone
   * would move only the selected paragraphs out and split the box, so the
   * selection is first stretched over everything inside it.
   */
  protected removeCallout(): void {
    this.calloutOpen.set(false);
    const editor = this.editor;
    if (!editor) {
      return;
    }
    const { $from } = editor.state.selection;
    for (let depth = $from.depth; depth > 0; depth--) {
      if ($from.node(depth).type.name === 'callout') {
        const from = $from.start(depth) + 1;
        const to = $from.end(depth) - 1;
        editor.chain().focus().setTextSelection({ from, to }).lift('callout').run();
        return;
      }
    }
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

/**
 * Makes the selected text its own paragraph(s) before it goes into a box.
 * `wrapIn` works on whole blocks, so selecting a sentence in the middle of a
 * paragraph would otherwise box the entire paragraph. The block is split at
 * each edge of the selection that is not already at the block's own start or
 * end (the end first, so the start keeps its position), and the spaces at the
 * cut are dropped so no paragraph is left starting or ending with one. Only
 * top-level text blocks are split; inside a list the whole item goes in the box.
 */
function isolateSelection({ tr }: { tr: Transaction }): boolean {
  const { from, to, $from, $to, empty } = tr.selection;
  if (empty || !(tr.selection instanceof TextSelection)) {
    return true;
  }
  cutAt(tr, $to, to);
  cutAt(tr, $from, tr.mapping.map(from, -1));
  tr.setSelection(TextSelection.create(tr.doc, tr.mapping.map(from), tr.mapping.map(to, -1)));
  return true;
}

/** Splits the top-level text block at `pos` (`$pos` resolved before any change), trimming the spaces around the cut. */
function cutAt(tr: Transaction, $pos: ResolvedPos, pos: number): void {
  const block = $pos.parent;
  if ($pos.depth !== 1 || !block.isTextblock) {
    return;
  }
  const offset = $pos.parentOffset;
  const before = /\s*$/.exec(block.textBetween(0, offset, undefined, '\ufffc'))?.[0].length ?? 0;
  const after =
    /^\s*/.exec(block.textBetween(offset, block.content.size, undefined, '\ufffc'))?.[0].length ??
    0;
  if (offset - before <= 0 || offset + after >= block.content.size) {
    return;
  }
  tr.delete(pos - before, pos + after);
  tr.split(pos - before);
}
