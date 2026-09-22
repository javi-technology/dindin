import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { PaymentSchedule } from '../../../../shared/utils/payment-schedule.util';
import {
  formatCurrency,
  formatDate,
} from '../../../../shared/utils/format.util';

/**
 * Agenda de pagamentos da tela de proventos (issue #311).
 *
 * A agenda chega montada pelo util compartilhado, já com o recorte gratuito
 * aplicado pelo `dividend.component` (#262): aqui só entram os números de
 * quantas datas e quantos ativos ficaram de fora, para o aviso do paywall.
 */
@Component({
  selector: 'app-payment-schedule',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  templateUrl: './payment-schedule.component.html',
})
export class PaymentScheduleComponent {
  readonly schedule = input.required<PaymentSchedule>();
  readonly hiddenDateCount = input(0);
  readonly hiddenWithoutDateCount = input(0);

  formatCurrency = formatCurrency;
  formatDate = formatDate;
}
