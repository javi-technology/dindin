import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';

// Página pública: as lojas de aplicativos exigem a política em URL acessível
// sem login (issue #406).
@Component({
  selector: 'app-privacy',
  standalone: true,
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './privacy.component.html',
})
export class PrivacyComponent {}
