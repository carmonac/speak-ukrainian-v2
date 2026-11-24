import {
  Component,
  type ElementRef,
  type OnDestroy,
  afterNextRender,
  effect,
  input,
  model,
  viewChild,
} from '@angular/core';

/** The slice of the Monaco API this component uses. */
interface MonacoEditor {
  getValue(): string;
  setValue(value: string): void;
  onDidChangeModelContent(listener: () => void): { dispose(): void };
  layout(): void;
  dispose(): void;
}
interface MonacoApi {
  editor: {
    create(element: HTMLElement, options: Record<string, unknown>): MonacoEditor;
  };
}
interface AmdRequire {
  (deps: string[], onLoad: () => void, onError: (error: unknown) => void): void;
  config(options: { paths: Record<string, string> }): void;
}

let monacoLoading: Promise<MonacoApi> | null = null;

/**
 * Loads Monaco once, from the copy `angular.json` ships under `/monaco/vs`.
 *
 * Monaco's AMD loader defines a global `define`. Its `amd` marker is removed
 * as soon as the loader is in, so the UMD bundles H5P loads into the same
 * window later still register themselves as globals instead of as anonymous
 * AMD modules nobody requires.
 */
function loadMonaco(): Promise<MonacoApi> {
  monacoLoading ??= new Promise<MonacoApi>((resolve, reject) => {
    // Absolute, because Monaco's web workers resolve it from their own scope.
    const base = new URL('monaco/vs', document.baseURI).href;
    const script = document.createElement('script');
    script.src = `${base}/loader.js`;
    script.onerror = () => reject(new Error('The code editor could not be loaded.'));
    script.onload = () => {
      const globals = window as unknown as {
        require: AmdRequire;
        define?: { amd?: unknown };
        monaco: MonacoApi;
      };
      globals.require.config({ paths: { vs: base } });
      globals.require(
        ['vs/editor/editor.main'],
        () => {
          if (globals.define) {
            delete globals.define.amd;
          }
          resolve(globals.monaco);
        },
        reject,
      );
    };
    document.head.appendChild(script);
  });
  return monacoLoading;
}

/** A Monaco editor bound two-way to `value`. */
@Component({
  selector: 'app-code-editor',
  template: `<div #host class="host" [style.height]="height()"></div>`,
  styles: `
    .host {
      border: 1px solid #d9d9d9;
      border-radius: 6px;
      overflow: hidden;
    }
  `,
})
export class CodeEditor implements OnDestroy {
  readonly value = model('');
  readonly language = input('handlebars');
  readonly height = input('520px');

  private readonly host = viewChild.required<ElementRef<HTMLElement>>('host');
  private editor: MonacoEditor | null = null;
  private subscription: { dispose(): void } | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private destroyed = false;

  constructor() {
    afterNextRender(() => {
      void loadMonaco().then((monaco) => {
        if (this.destroyed) {
          return;
        }
        const element = this.host().nativeElement;
        this.editor = monaco.editor.create(element, {
          value: this.value(),
          language: this.language(),
          automaticLayout: false,
          minimap: { enabled: false },
          scrollBeyondLastLine: false,
          wordWrap: 'on',
          tabSize: 2,
          fontSize: 13,
        });
        this.subscription = this.editor.onDidChangeModelContent(() => {
          this.value.set(this.editor?.getValue() ?? '');
        });
        this.resizeObserver = new ResizeObserver(() => this.editor?.layout());
        this.resizeObserver.observe(element);
      });
    });

    // A value set from outside (a page finished loading) replaces the buffer;
    // the editor's own edits already match and are left alone.
    effect(() => {
      const value = this.value();
      if (this.editor && this.editor.getValue() !== value) {
        this.editor.setValue(value);
      }
    });
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    this.resizeObserver?.disconnect();
    this.subscription?.dispose();
    this.editor?.dispose();
  }
}
