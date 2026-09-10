import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { LucideArrowLeft } from '@lucide/angular';
import { EMPTY, catchError, concatMap, take, takeWhile, timer } from 'rxjs';
import { MeResponse, SubscriptionInterval } from 'dindin-shared-types';
import { BillingService } from '../../core/services/billing.service';

@Component({
  selector: 'app-billing',
  standalone: true,
  imports: [CommonModule, RouterLink, LucideArrowLeft],
  templateUrl: './billing.component.html',
})
export class BillingComponent implements OnInit {
  private readonly billingService = inject(BillingService);
  private readonly route = inject(ActivatedRoute);

  readonly subscription = this.billingService.subscription;
  readonly status = computed(() => this.subscription().status);
  readonly loading = computed(() => !this.billingService.loaded());

  readonly verifying = signal(false);
  readonly checkoutLoading = signal(false);
  readonly portalLoading = signal(false);
  readonly error = signal<string | null>(null);
  readonly successMessage = signal<string | null>(null);
  readonly infoMessage = signal<string | null>(null);

  ngOnInit(): void {
    const statusParam = this.route.snapshot.queryParamMap.get('status');
    if (statusParam === 'success') {
      this.verifySubscription();
    } else {
      if (statusParam === 'cancel') {
        this.infoMessage.set(
          'Checkout cancelado. Você pode assinar quando quiser.',
        );
      }
      this.billingService.loadMe().subscribe({
        error: () => this.error.set('Erro ao carregar sua assinatura.'),
      });
    }
  }

  private verifySubscription(): void {
    this.verifying.set(true);
    this.infoMessage.set('Confirmando sua assinatura…');
    timer(0, 2000)
      .pipe(
        take(6),
        concatMap(() =>
          this.billingService.loadMe().pipe(catchError(() => EMPTY)),
        ),
        takeWhile((me) => !this.isSubscribed(me), true),
      )
      .subscribe({
        next: (me) => {
          if (this.isSubscribed(me)) {
            this.verifying.set(false);
            this.infoMessage.set(null);
            this.successMessage.set(
              'Assinatura confirmada! Os recursos de IA já estão liberados.',
            );
          }
        },
        complete: () => {
          if (this.verifying()) {
            this.verifying.set(false);
            this.infoMessage.set(
              'Pagamento recebido. A confirmação pode levar alguns instantes — atualize a página em breve.',
            );
          }
        },
      });
  }

  private isSubscribed(me: MeResponse): boolean {
    return (
      me.subscription.status === 'active' ||
      me.subscription.status === 'trialing'
    );
  }

  subscribe(interval: SubscriptionInterval): void {
    this.error.set(null);
    this.checkoutLoading.set(true);
    this.billingService.startCheckout(interval).subscribe({
      error: (error: { status?: number }) => {
        this.checkoutLoading.set(false);
        if (error?.status === 409) {
          this.billingService.loadMe().subscribe({
            error: () => this.error.set('Erro ao carregar sua assinatura.'),
          });
        } else {
          this.error.set(
            'Não foi possível iniciar o checkout. Tente novamente.',
          );
        }
      },
    });
  }

  openPortal(): void {
    this.error.set(null);
    this.portalLoading.set(true);
    this.billingService.openPortal().subscribe({
      error: () => {
        this.portalLoading.set(false);
        this.error.set(
          'Não foi possível abrir o portal de assinatura. Tente novamente.',
        );
      },
    });
  }
}
