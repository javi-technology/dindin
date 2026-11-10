// A suíte cobre o modo pago por padrão: sem a variável, a cobrança fica
// desligada e todo usuário teria todos os recursos (issue #594). O modo
// gratuito é coberto em `tests/billing/billing-disabled.spec.ts`.
process.env.BILLING_ENABLED = 'true';
