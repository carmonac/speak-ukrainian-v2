import { Component, inject } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';
import { NzBadgeModule } from 'ng-zorro-antd/badge';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzDropdownModule } from 'ng-zorro-antd/dropdown';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzMenuModule } from 'ng-zorro-antd/menu';
import { AuthService } from '../core/auth.service';
import { runtimeConfig } from '../core/runtime-config';
import { SessionStore } from '../core/session.store';

/** The frame around every screen: brand, navigation and the account menu. */
@Component({
  selector: 'app-shell',
  imports: [
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    NzButtonModule,
    NzIconModule,
    NzBadgeModule,
    NzDropdownModule,
    NzMenuModule,
  ],
  templateUrl: './shell.html',
  styleUrl: './shell.scss',
})
export class Shell {
  private readonly router = inject(Router);
  protected readonly auth = inject(AuthService);
  protected readonly session = inject(SessionStore);
  protected readonly siteUrl = runtimeConfig().siteUrl;

  constructor() {
    // The unread badge is refreshed on every navigation as well as by
    // Realtime, so it recovers if a Realtime event was missed.
    this.router.events
      .pipe(filter((event) => event instanceof NavigationEnd))
      .subscribe(() => void this.session.refreshUnread());
  }

  protected async signOut(): Promise<void> {
    await this.auth.signOut();
    await this.router.navigate(['/']);
  }
}
