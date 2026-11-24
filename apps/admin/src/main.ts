import { bootstrapApplication } from '@angular/platform-browser';
import { App } from './app/app';
import { appConfig } from './app/app.config';
import { loadRuntimeConfig } from './app/core/runtime-config';

// The runtime configuration is fetched before Angular starts, so every service
// can read it synchronously. In production the container writes this file from
// its environment, which keeps one built image deployable anywhere.
loadRuntimeConfig()
  .then(() => bootstrapApplication(App, appConfig))
  .catch((err) => {
    console.error(err);
    document.body.textContent = 'The control panel could not start: its configuration is missing.';
  });
