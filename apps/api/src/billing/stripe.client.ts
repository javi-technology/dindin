import Stripe from 'stripe';
import { HttpError } from '../shared/http-error';

let client: Stripe | null = null;

export function getStripe(): Stripe {
  if (client) return client;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw HttpError.internal('STRIPE_SECRET_KEY não configurada');
  client = new Stripe(key);
  return client;
}

export function getPriceId(interval: 'month' | 'year'): string {
  const envName =
    interval === 'month'
      ? 'STRIPE_PRICE_BASIC_MONTHLY'
      : 'STRIPE_PRICE_BASIC_YEARLY';
  const priceId = process.env[envName];
  if (!priceId) throw HttpError.internal(`${envName} não configurada`);
  return priceId;
}

export function getAppBaseUrl(): string {
  const base = process.env.APP_BASE_URL ?? 'https://dindin-4e720.web.app';
  return base.replace(/\/+$/, '');
}
