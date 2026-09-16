import { Request, Response } from 'express';
import { Dividend, Position, AssetType } from 'dindin-models';
import {
  buildMonthlyDividendReport,
  isValidPaymentDate,
  MAX_REPORT_YEAR,
  MIN_REPORT_YEAR,
} from './monthly-report.service';
import { recordMonthlyDividends } from './dividend-record.service';
import { computeMonthlyIncome } from './monthly-income.service';
import { asyncHandler } from '../middleware/async-handler';
import {
  uid,
  dividendsCollection,
  positionsCollection,
  walletsCollection,
} from '../firestore/paths';

const ASSET_TYPES = new Set<AssetType>([
  'FII',
  'STOCK',
  'ETF',
  'REIT',
  'OTHER',
]);

async function getAllUserPositions(
  userId: string,
  walletId?: string,
): Promise<Position[]> {
  if (walletId) {
    const positionsSnapshot = await positionsCollection(userId, walletId).get();
    return positionsSnapshot.docs.map(
      (doc) => ({ id: doc.id, ...doc.data() }) as Position,
    );
  }

  const walletsSnapshot = await walletsCollection(userId).get();

  const positionsByWallet = await Promise.all(
    walletsSnapshot.docs.map((walletDoc) =>
      walletDoc.ref.collection('positions').get(),
    ),
  );

  return positionsByWallet.flatMap((positionsSnapshot) =>
    positionsSnapshot.docs.map(
      (doc) => ({ id: doc.id, ...doc.data() }) as Position,
    ),
  );
}

function isValidAssetType(value: unknown): value is AssetType {
  return typeof value === 'string' && ASSET_TYPES.has(value as AssetType);
}

function validateDividendBody(
  body: Partial<Dividend>,
  allowPartial = false,
): { valid: false; error: string } | { valid: true } {
  const { ticker, amountPerShare, quantity, paymentDate, assetType } = body;

  if (!allowPartial || ticker !== undefined) {
    if (!ticker || typeof ticker !== 'string' || ticker.trim().length === 0) {
      return {
        valid: false,
        error: 'Ticker is required and must be a non-empty string',
      };
    }
  }

  if (!allowPartial || amountPerShare !== undefined) {
    if (
      typeof amountPerShare !== 'number' ||
      amountPerShare < 0 ||
      !Number.isFinite(amountPerShare)
    ) {
      return {
        valid: false,
        error: 'Amount per share is required and must be a non-negative number',
      };
    }
  }

  if (!allowPartial || quantity !== undefined) {
    if (
      typeof quantity !== 'number' ||
      quantity <= 0 ||
      !Number.isFinite(quantity)
    ) {
      return {
        valid: false,
        error: 'Quantity is required and must be a positive number',
      };
    }
  }

  if (!allowPartial || paymentDate !== undefined) {
    if (
      !isValidPaymentDate(
        typeof paymentDate === 'string' ? paymentDate.trim() : paymentDate,
      )
    ) {
      return {
        valid: false,
        error: 'Payment date is required and must be in YYYY-MM-DD format',
      };
    }
  }

  if (assetType !== undefined && !isValidAssetType(assetType)) {
    return {
      valid: false,
      error: `Asset type must be one of: ${[...ASSET_TYPES].join(', ')}`,
    };
  }

  return { valid: true };
}

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
    const body = req.body as Partial<Dividend>;

    const validation = validateDividendBody(body);
    if (!validation.valid) {
      res.status(400).json({ error: validation.error });
      return;
    }

    const now = new Date().toISOString();
    const dividendData: Omit<Dividend, 'id'> = {
      userId: uid(req),
      ticker: body.ticker!.trim().toUpperCase(),
      amountPerShare: body.amountPerShare!,
      quantity: body.quantity!,
      totalAmount: body.amountPerShare! * body.quantity!,
      paymentDate: body.paymentDate!.trim(),
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
      res.status(404).json({ error: 'Dividend not found' });
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
      res.status(404).json({ error: 'Dividend not found' });
      return;
    }

    const body = req.body as Partial<Dividend>;
    const validation = validateDividendBody(body, true);
    if (!validation.valid) {
      res.status(400).json({ error: validation.error });
      return;
    }

    const current = doc.data() as Dividend;
    const updates: Partial<Dividend> & { updatedAt: string } = {
      updatedAt: new Date().toISOString(),
    };

    if (body.ticker !== undefined)
      updates.ticker = body.ticker.trim().toUpperCase();
    if (body.assetType !== undefined) updates.assetType = body.assetType;
    if (body.amountPerShare !== undefined)
      updates.amountPerShare = body.amountPerShare;
    if (body.quantity !== undefined) updates.quantity = body.quantity;
    if (body.paymentDate !== undefined)
      updates.paymentDate = body.paymentDate.trim();

    if (body.amountPerShare !== undefined || body.quantity !== undefined) {
      const amountPerShare = body.amountPerShare ?? current.amountPerShare;
      const quantity = body.quantity ?? current.quantity;
      const totalAmount = amountPerShare * quantity;

      if (
        typeof amountPerShare !== 'number' ||
        typeof quantity !== 'number' ||
        !Number.isFinite(totalAmount)
      ) {
        console.error('[updateDividend] documento corrompido:', {
          uid: uid(req),
          dividendId: id,
          current,
        });
        res.status(500).json({ error: 'Internal server error' });
        return;
      }

      updates.totalAmount = totalAmount;
    }

    await dividendRef.update(updates);

    const updatedDividend = { ...current, ...updates, id };
    res.json(updatedDividend);
  },
);

interface MonthlyDividendProjection {
  ticker: string;
  amountPerShare: number;
  quantity: number;
  monthlyAmount: number;
}

function isValidDividend(dividend: Dividend): boolean {
  return (
    typeof dividend.ticker === 'string' &&
    dividend.ticker.length > 0 &&
    typeof dividend.paymentDate === 'string' &&
    typeof dividend.amountPerShare === 'number' &&
    Number.isFinite(dividend.amountPerShare) &&
    dividend.amountPerShare >= 0 &&
    typeof dividend.quantity === 'number' &&
    Number.isFinite(dividend.quantity) &&
    dividend.quantity > 0
  );
}

function normalizeTicker(ticker: unknown): string {
  return typeof ticker === 'string' ? ticker.trim().toUpperCase() : '';
}

function latestDividendByTickerMap(
  dividends: Dividend[],
): Map<string, Dividend> {
  const byTicker = new Map<string, Dividend>();

  for (const dividend of dividends) {
    if (!isValidDividend(dividend)) {
      console.error(
        '[latestDividendByTicker] dividendo mal formado ignorado:',
        {
          id: dividend.id,
          ticker: dividend.ticker,
          paymentDate: dividend.paymentDate,
          amountPerShare: dividend.amountPerShare,
          quantity: dividend.quantity,
        },
      );
      continue;
    }

    const normalizedTicker = normalizeTicker(dividend.ticker);
    const current = byTicker.get(normalizedTicker);
    if (!current) {
      byTicker.set(normalizedTicker, dividend);
      continue;
    }

    const isNewerDate = dividend.paymentDate > current.paymentDate;
    const sameDate = dividend.paymentDate === current.paymentDate;
    const isNewerCreatedAt =
      (dividend.createdAt ?? '') > (current.createdAt ?? '');

    if (isNewerDate || (sameDate && isNewerCreatedAt)) {
      byTicker.set(normalizedTicker, dividend);
    }
  }

  return byTicker;
}

function buildQuantityByTickerMap(positions: Position[]): Map<string, number> {
  const quantityByTicker = new Map<string, number>();

  for (const position of positions) {
    const normalizedTicker = normalizeTicker(position.ticker);
    const current = quantityByTicker.get(normalizedTicker) ?? 0;
    const quantity =
      typeof position.quantity === 'number' &&
      Number.isFinite(position.quantity) &&
      position.quantity > 0
        ? position.quantity
        : 0;
    quantityByTicker.set(normalizedTicker, current + quantity);
  }

  return quantityByTicker;
}

function latestDividendByTicker(
  dividends: Dividend[],
  positions: Position[],
): MonthlyDividendProjection[] {
  const latestByTicker = latestDividendByTickerMap(dividends);
  const quantityByTicker = buildQuantityByTickerMap(positions);

  return [...latestByTicker.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([normalizedTicker, dividend]) => {
      const quantity = quantityByTicker.get(normalizedTicker) ?? 0;
      return {
        ticker: normalizedTicker,
        amountPerShare: dividend.amountPerShare,
        quantity,
        monthlyAmount: dividend.amountPerShare * quantity,
      };
    })
    .filter((projection) => projection.quantity > 0);
}

export const getDividendProjection = asyncHandler(
  'getDividendProjection',
  async (req: Request, res: Response) => {
    const userId = uid(req);
    const [dividendsSnapshot, positions] = await Promise.all([
      dividendsCollection(userId).get(),
      getAllUserPositions(userId),
    ]);
    const dividends = dividendsSnapshot.docs.map(
      (doc) => ({ id: doc.id, ...doc.data() }) as Dividend,
    );
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
    let year = new Date().getFullYear();

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
          .json({ error: 'Year must be an integer between 1900 and 2100' });
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

export const postMonthlyDividendRecord = asyncHandler(
  'postMonthlyDividendRecord',
  async (req: Request, res: Response) => {
    const dividends = await recordMonthlyDividends(uid(req));
    res.status(201).json(dividends);
  },
);

interface TickerDividendYield {
  ticker: string;
  annualIncome: number;
  currentValue: number;
  yield: number;
}

interface WalletDividendYieldResponse {
  byTicker: TickerDividendYield[];
  total: {
    annualIncome: number;
    currentValue: number;
    yield: number;
  };
}

function roundYield(value: number): number {
  return Math.round(value * 100) / 100;
}

export const getDividendYield = asyncHandler(
  'getDividendYield',
  async (req: Request, res: Response) => {
    const { walletId } = req.params;
    const userId = uid(req);

    const [positions, dividendsSnapshot] = await Promise.all([
      getAllUserPositions(userId, walletId),
      dividendsCollection(userId).get(),
    ]);
    const dividends = dividendsSnapshot.docs.map(
      (doc) => ({ id: doc.id, ...doc.data() }) as Dividend,
    );

    const latestByTicker = latestDividendByTickerMap(dividends);

    const byTicker: TickerDividendYield[] = [];
    let totalAnnualIncome = 0;
    let totalCurrentValue = 0;

    for (const position of positions) {
      const unitPrice = position.currentPrice ?? position.averagePrice ?? 0;
      const quantity =
        typeof position.quantity === 'number' &&
        Number.isFinite(position.quantity)
          ? position.quantity
          : 0;
      const currentValue = quantity > 0 ? quantity * unitPrice : 0;

      const latestDividend = latestByTicker.get(
        normalizeTicker(position.ticker),
      );
      const amountPerShare =
        latestDividend &&
        typeof latestDividend.amountPerShare === 'number' &&
        Number.isFinite(latestDividend.amountPerShare) &&
        latestDividend.amountPerShare >= 0
          ? latestDividend.amountPerShare
          : 0;
      const monthlyIncome = quantity > 0 ? amountPerShare * quantity : 0;
      const annualIncome = monthlyIncome * 12;
      const dividendYield =
        currentValue > 0 && Number.isFinite(annualIncome)
          ? (annualIncome / currentValue) * 100
          : 0;

      byTicker.push({
        ticker: position.ticker,
        annualIncome,
        currentValue,
        yield: roundYield(dividendYield),
      });

      totalAnnualIncome += annualIncome;
      totalCurrentValue += currentValue;
    }

    byTicker.sort((a, b) => a.ticker.localeCompare(b.ticker));

    const response: WalletDividendYieldResponse = {
      byTicker,
      total: {
        annualIncome: totalAnnualIncome,
        currentValue: totalCurrentValue,
        yield:
          totalCurrentValue > 0
            ? roundYield((totalAnnualIncome / totalCurrentValue) * 100)
            : 0,
      },
    };

    res.json(response);
  },
);

export const getMonthlyIncome = asyncHandler(
  'getMonthlyIncome',
  async (req: Request, res: Response) => {
    const { walletId } = req.params;
    const userId = uid(req);
    const { byTicker, total, totalFromFridge } = await computeMonthlyIncome(
      userId,
      walletId,
    );
    res.json({ byTicker, total, totalFromFridge });
  },
);

export const deleteDividend = asyncHandler(
  'deleteDividend',
  async (req: Request, res: Response) => {
    const { id } = req.params;
    const dividendRef = dividendsCollection(uid(req)).doc(id);
    const doc = await dividendRef.get();

    if (!doc.exists) {
      res.status(404).json({ error: 'Dividend not found' });
      return;
    }

    await dividendRef.delete();
    res.status(204).send();
  },
);
