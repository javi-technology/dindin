import { Request, Response } from 'express';
import { z } from 'zod';
import type { Dividend } from 'dindin-models';
import {
  buildMonthlyDividendReport,
  MAX_REPORT_YEAR,
  MIN_REPORT_YEAR,
} from './monthly-report.service';
import {
  computeConsolidatedMonthlyIncome,
  computeMonthlyIncome,
} from './monthly-income.service';
import {
  computeScheduleTotals,
  limitMonthlyIncome,
} from './monthly-income-limit.service';
import { hasEntitlement } from '../billing/entitlement.service';
import { asyncHandler } from '../middleware/async-handler';
import { getAllUserPositions } from '../wallet/position-reader';
import {
  computeDividendYield,
  latestDividendByTicker,
} from './dividend-calculation.service';
import { uid, dividendsCollection } from '../firestore/paths';
import { AuthRequest } from '../middleware/auth.middleware';
import { currentYear, todayAsUtcDate } from '../shared/date';
import {
  assetTypeField,
  nonNegativeNumberField,
  parseBody,
  paymentDateField,
  positiveNumberField,
  tickerField,
} from '../shared/validation';
import { logError } from '../shared/logger';

const dividendSchema = z.object({
  ticker: tickerField(),
  amountPerShare: nonNegativeNumberField('Valor por cota'),
  quantity: positiveNumberField('Quantidade'),
  paymentDate: paymentDateField(),
  assetType: assetTypeField(false).optional(),
});

const updateDividendSchema = dividendSchema.partial();

export const listDividends = asyncHandler(
  'listDividends',
  async (req: Request, res: Response) => {
    const snapshot = await dividendsCollection(uid(req)).get();
    const dividends = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));
    res.json(dividends);
  },
);

export const createDividend = asyncHandler(
  'createDividend',
  async (req: Request, res: Response) => {
    const parsed = parseBody(dividendSchema, req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error });
      return;
    }

    const body = parsed.data;
    const now = new Date().toISOString();
    const dividendData: Omit<Dividend, 'id'> = {
      userId: uid(req),
      ticker: body.ticker,
      amountPerShare: body.amountPerShare,
      quantity: body.quantity,
      totalAmount: body.amountPerShare * body.quantity,
      paymentDate: body.paymentDate,
      createdAt: now,
      updatedAt: now,
    };

    if (body.assetType !== undefined) {
      dividendData.assetType = body.assetType;
    }

    const docRef = await dividendsCollection(uid(req)).add(dividendData);
    res.status(201).json({ id: docRef.id, ...dividendData });
  },
);

export const getDividend = asyncHandler(
  'getDividend',
  async (req: Request, res: Response) => {
    const { id } = req.params;
    const doc = await dividendsCollection(uid(req)).doc(id).get();

    if (!doc.exists) {
      res.status(404).json({ error: 'Provento não encontrado' });
      return;
    }

    res.json({ id: doc.id, ...doc.data() });
  },
);

export const updateDividend = asyncHandler(
  'updateDividend',
  async (req: Request, res: Response) => {
    const { id } = req.params;
    const dividendRef = dividendsCollection(uid(req)).doc(id);
    const doc = await dividendRef.get();

    if (!doc.exists) {
      res.status(404).json({ error: 'Provento não encontrado' });
      return;
    }

    const parsed = parseBody(updateDividendSchema, req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error });
      return;
    }

    const body = parsed.data;

    const current = doc.data() as Dividend;
    const updates: Partial<Dividend> & { updatedAt: string } = {
      updatedAt: new Date().toISOString(),
    };

    if (body.ticker !== undefined) updates.ticker = body.ticker;
    if (body.assetType !== undefined) updates.assetType = body.assetType;
    if (body.amountPerShare !== undefined)
      updates.amountPerShare = body.amountPerShare;
    if (body.quantity !== undefined) updates.quantity = body.quantity;
    if (body.paymentDate !== undefined) updates.paymentDate = body.paymentDate;

    if (body.amountPerShare !== undefined || body.quantity !== undefined) {
      const amountPerShare = body.amountPerShare ?? current.amountPerShare;
      const quantity = body.quantity ?? current.quantity;
      const totalAmount = amountPerShare * quantity;

      if (
        typeof amountPerShare !== 'number' ||
        typeof quantity !== 'number' ||
        !Number.isFinite(totalAmount)
      ) {
        logError('updateDividend.corruptedDocument', {
          uid: uid(req),
          dividendId: id,
        });
        res.status(500).json({ error: 'Erro interno do servidor' });
        return;
      }

      updates.totalAmount = totalAmount;
    }

    await dividendRef.update(updates);

    const updatedDividend = { ...current, ...updates, id };
    res.json(updatedDividend);
  },
);

/** Lê todos os proventos do usuário. */
async function readDividends(userId: string): Promise<Dividend[]> {
  const snapshot = await dividendsCollection(userId).get();
  return snapshot.docs.map(
    (doc) => ({ id: doc.id, ...doc.data() }) as Dividend,
  );
}

export const getDividendProjection = asyncHandler(
  'getDividendProjection',
  async (req: Request, res: Response) => {
    const userId = uid(req);
    const [dividends, positions] = await Promise.all([
      readDividends(userId),
      getAllUserPositions(userId),
    ]);

    const projections = latestDividendByTicker(dividends, positions);
    const total = projections.reduce(
      (sum, projection) => sum + projection.monthlyAmount,
      0,
    );

    res.json({ projections, total });
  },
);

export const getMonthlyDividendReport = asyncHandler(
  'getMonthlyDividendReport',
  async (req: Request, res: Response) => {
    const queryYear = req.query.year;
    let year = currentYear();

    if (queryYear !== undefined) {
      const parsedYear =
        typeof queryYear === 'string' ? Number(queryYear) : Number.NaN;
      if (
        !Number.isInteger(parsedYear) ||
        parsedYear < MIN_REPORT_YEAR ||
        parsedYear > MAX_REPORT_YEAR
      ) {
        res
          .status(400)
          .json({ error: 'Ano deve ser um inteiro entre 1900 e 2100' });
        return;
      }
      year = parsedYear;
    }

    const snapshot = await dividendsCollection(uid(req)).get();
    const dividends = snapshot.docs.map(
      (doc) => ({ id: doc.id, ...doc.data() }) as Dividend,
    );

    res.json(buildMonthlyDividendReport(dividends, year));
  },
);

export const getDividendYield = asyncHandler(
  'getDividendYield',
  async (req: Request, res: Response) => {
    const userId = uid(req);
    const [positions, dividends] = await Promise.all([
      getAllUserPositions(userId, req.params.walletId),
      readDividends(userId),
    ]);

    res.json(computeDividendYield(positions, dividends));
  },
);

/**
 * Sem o entitlement `projections` (#262), a projeção por ativo e a agenda de
 * pagamentos saem recortadas já daqui — o corte na tela sozinho seria
 * contornável pelo devtools. Os totais continuam calculados sobre tudo, e as
 * listas `hidden*` (nomes e datas, sem valores) permitem à web contar o que
 * está bloqueado somando as várias carteiras. `scheduleItems` traz os valores
 * dos ativos das datas liberadas — inclusive de ativos fora dos três cards —,
 * porque é deles que a agenda é montada.
 */
export const getMonthlyIncome = asyncHandler(
  'getMonthlyIncome',
  async (req: Request, res: Response) => {
    const { walletId } = req.params;
    const userId = uid(req);
    const user = (req as AuthRequest).user;
    const [{ byTicker, total, totalFromFridge }, entitled] = await Promise.all([
      computeMonthlyIncome(userId, walletId),
      hasEntitlement(userId, 'projections', user?.admin === true),
    ]);

    const today = todayAsUtcDate();
    const scheduleTotals = computeScheduleTotals(byTicker, today);

    if (entitled) {
      res.json({
        byTicker,
        total,
        totalFromFridge,
        scheduleTotals,
        limited: false,
        hiddenTickers: [],
        hiddenPaymentDates: [],
        hiddenScheduleTickers: [],
      });
      return;
    }

    const limited = limitMonthlyIncome(byTicker, today);
    res.json({
      byTicker: limited.byTicker,
      scheduleItems: limited.scheduleItems,
      total,
      totalFromFridge,
      scheduleTotals,
      limited: true,
      hiddenTickers: limited.hiddenTickers,
      hiddenPaymentDates: limited.hiddenPaymentDates,
      hiddenScheduleTickers: limited.hiddenScheduleTickers,
    });
  },
);

/**
 * Renda mensal de **todas** as carteiras (issue #300).
 *
 * O recorte gratuito é aplicado aqui, sobre o agregado: por carteira, duas
 * carteiras mostrariam seis ativos a quem não assina. O front também não
 * precisa mais adivinhar quanto da geladeira contar.
 */
export const getConsolidatedMonthlyIncome = asyncHandler(
  'getConsolidatedMonthlyIncome',
  async (req: Request, res: Response) => {
    const userId = uid(req);
    const user = (req as AuthRequest).user;
    const [{ byTicker, total, totalFromFridge }, entitled] = await Promise.all([
      computeConsolidatedMonthlyIncome(userId),
      hasEntitlement(userId, 'projections', user?.admin === true),
    ]);

    const today = todayAsUtcDate();
    const scheduleTotals = computeScheduleTotals(byTicker, today);

    if (entitled) {
      res.json({
        byTicker,
        total,
        totalFromFridge,
        scheduleTotals,
        limited: false,
        hiddenTickers: [],
        hiddenPaymentDates: [],
        hiddenScheduleTickers: [],
      });
      return;
    }

    const limited = limitMonthlyIncome(byTicker, today);
    res.json({
      byTicker: limited.byTicker,
      scheduleItems: limited.scheduleItems,
      total,
      totalFromFridge,
      scheduleTotals,
      limited: true,
      hiddenTickers: limited.hiddenTickers,
      hiddenPaymentDates: limited.hiddenPaymentDates,
      hiddenScheduleTickers: limited.hiddenScheduleTickers,
    });
  },
);

export const deleteDividend = asyncHandler(
  'deleteDividend',
  async (req: Request, res: Response) => {
    const { id } = req.params;
    const dividendRef = dividendsCollection(uid(req)).doc(id);
    const doc = await dividendRef.get();

    if (!doc.exists) {
      res.status(404).json({ error: 'Provento não encontrado' });
      return;
    }

    await dividendRef.delete();
    res.status(204).send();
  },
);
