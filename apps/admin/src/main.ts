import { bootstrapApplication } from '@angular/platform-browser';
import { RICH_TEXT_CALLOUT_CSS } from '@speakukrainian/shared';
import { App } from './app/app';
import { appConfig } from './app/app.config';
import { loadRuntimeConfig } from './app/core/runtime-config';

// Highlight blocks in rich text (a course's summary and description), from the
// shared package so every place that shows them draws them the same. Global,
// because rich text is inserted where component styles do not reach.
const calloutStyles = document.createElement('style');
calloutStyles.textContent = RICH_TEXT_CALLOUT_CSS;
document.head.append(calloutStyles);

// The runtime configuration is fetched before Angular starts, so every service
// can read it synchronously. In production the container writes this file from
// its environment, which keeps one built image deployable anywhere.
loadRuntimeConfig()
  .then(() => bootstrapApplication(App, appConfig))
  .catch((err) => {
    console.error(err);
    document.body.textContent = 'The control panel could not start: its configuration is missing.';
  });
