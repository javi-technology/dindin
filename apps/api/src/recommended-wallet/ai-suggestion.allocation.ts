import {
  AiSuggestionItem,
  RecommendedWalletComparisonItem,
} from 'dindin-models';

/**
 * Regras de alocação da sugestão da IA (issue #306).
 *
 * Saíram do `ai-suggestion.service`, que reunia cliente HTTP, parsing,
 * alocação, cota e persistência em 1.056 linhas. Aqui mora só a matemática
 * que transforma valores sugeridos em cotas inteiras e redistribui o troco:
 * nada depende de rede nem de Firestore, então dá para testar direto.
 */

export function applySuggestedQuantities(
  items: AiSuggestionItem[],
  priceByTicker: Map<string, number>,
): AiSuggestionItem[] {
  return items.map((item) => {
    const suggestedAmount = item.suggestedAmount;
    const price = priceByTicker.get(item.ticker.toUpperCase());
    if (
      typeof suggestedAmount !== 'number' ||
      !Number.isFinite(suggestedAmount) ||
      suggestedAmount <= 0 ||
      typeof price !== 'number' ||
      !Number.isFinite(price) ||
      price <= 0
    ) {
      return item;
    }
    return {
      ...item,
      referencePrice: price,
      suggestedQuantity: Math.floor(suggestedAmount / price),
    };
  });
}

export function redistributeUnspentAmounts(
  items: AiSuggestionItem[],
  priceByTicker: Map<string, number>,
  totalAvailable: number,
  qualifiedTickers: Set<string>,
  allowed: Map<string, RecommendedWalletComparisonItem['status']>,
): AiSuggestionItem[] {
  const normalizedQualifiedTickers = new Set(
    [...qualifiedTickers].map((ticker) => ticker.toUpperCase()),
  );
  const roundAmount = (amount: number) => Math.round(amount * 100) / 100;
  const states = items
    .map((item, index) => {
      if (item.action !== 'buy') return null;
      const ticker = item.ticker.toUpperCase();
      const price = priceByTicker.get(ticker);
      const hasKnownPrice =
        typeof price === 'number' && Number.isFinite(price) && price > 0;
      const isQualified = normalizedQualifiedTickers.has(ticker);
      const status = allowed.get(ticker);
      const quantity =
        typeof item.suggestedQuantity === 'number' &&
        Number.isFinite(item.suggestedQuantity) &&
        item.suggestedQuantity >= 0
          ? item.suggestedQuantity
          : 0;
      if (!hasKnownPrice || isQualified || status === 'extra') {
        return {
          kind: 'fixed' as const,
          amount:
            status !== 'extra' &&
            typeof item.suggestedAmount === 'number' &&
            Number.isFinite(item.suggestedAmount)
              ? item.suggestedAmount
              : 0,
        };
      }
      return {
        kind: 'eligible' as const,
        index,
        item,
        price,
        quantity,
        originalQuantity: quantity,
      };
    })
    .filter(
      (
        state,
      ): state is
        | { kind: 'fixed'; amount: number }
        | {
            kind: 'eligible';
            index: number;
            item: AiSuggestionItem;
            price: number;
            quantity: number;
            originalQuantity: number;
          } => state !== null,
    );
  const fixedSpent = states
    .filter(
      (state): state is { kind: 'fixed'; amount: number } =>
        state.kind === 'fixed',
    )
    .reduce((total, state) => total + state.amount, 0);
  const eligibleStates = states.filter(
    (
      state,
    ): state is {
      kind: 'eligible';
      index: number;
      item: AiSuggestionItem;
      price: number;
      quantity: number;
      originalQuantity: number;
    } => state.kind === 'eligible',
  );
  const eligibleSpent = eligibleStates.reduce(
    (total, state) => total + state.quantity * state.price,
    0,
  );
  let pool = roundAmount(totalAvailable - fixedSpent - eligibleSpent);
  if (pool <= 0) return items;

  let changed = true;
  while (changed) {
    changed = false;
    const orderedStates = [...eligibleStates].sort(
      (a, b) =>
        Number(a.quantity > 0) - Number(b.quantity > 0) ||
        a.item.priority - b.item.priority ||
        a.index - b.index,
    );
    for (const state of orderedStates) {
      if (pool + 1e-9 < state.price) continue;
      state.quantity += 1;
      pool = roundAmount(pool - state.price);
      changed = true;
    }
  }

  const updatedByIndex = new Map<number, AiSuggestionItem>();
  for (const state of eligibleStates) {
    if (state.quantity > 0) {
      const quantityIncreased = state.quantity > state.originalQuantity;
      updatedByIndex.set(state.index, {
        ...state.item,
        suggestedAmount: roundAmount(state.quantity * state.price),
        suggestedQuantity: state.quantity,
        referencePrice: state.price,
        ...(quantityIncreased
          ? {
              rationale: `${state.item.rationale} Recebe cotas adicionais com o saldo realocado de ativos sem cota inteira.`,
            }
          : {}),
      });
    } else {
      const {
        suggestedAmount: _suggestedAmount,
        suggestedQuantity: _suggestedQuantity,
        referencePrice: _referencePrice,
        ...withoutQuantities
      } = state.item;
      updatedByIndex.set(state.index, {
        ...withoutQuantities,
        action: 'hold',
        rationale: `${state.item.rationale} Valor realocado para outros ativos por não completar 1 cota.`,
      });
    }
  }
  return items.map((item, index) => updatedByIndex.get(index) ?? item);
}

export function applyQualifiedInvestor(
  items: AiSuggestionItem[],
  qualifiedTickers: Set<string>,
): AiSuggestionItem[] {
  return items.map((item) => {
    const { qualifiedInvestor: _qualifiedInvestor, ...withoutFlag } = item;
    return qualifiedTickers.has(item.ticker.toUpperCase())
      ? { ...withoutFlag, qualifiedInvestor: true }
      : withoutFlag;
  });
}

export function applyFallbackAllocations(
  items: AiSuggestionItem[],
  qualifiedTickers: Set<string>,
  comparisonItems: RecommendedWalletComparisonItem[],
  priceByTicker: Map<string, number>,
): AiSuggestionItem[] {
  const normalizedQualifiedTickers = new Set(
    [...qualifiedTickers].map((ticker) => ticker.toUpperCase()),
  );
  const comparisonByTicker = new Map(
    comparisonItems.map((comparisonItem) => [
      comparisonItem.ticker.toUpperCase(),
      comparisonItem,
    ]),
  );
  const roundAmount = (amount: number): number =>
    Math.round(amount * 100) / 100;
  const withQuantities = (
    allocations: Array<{ ticker: string; amount: number }>,
  ) =>
    allocations.map((allocation) => {
      const ticker = allocation.ticker.toUpperCase();
      const price = priceByTicker.get(ticker);
      if (typeof price !== 'number' || !Number.isFinite(price) || price <= 0) {
        return { ticker, amount: allocation.amount };
      }
      return {
        ticker,
        amount: allocation.amount,
        referencePrice: price,
        suggestedQuantity: Math.floor(allocation.amount / price),
      };
    });
  const normalizeAmounts = (
    allocations: Array<{ ticker: string; amount: number }>,
    total: number,
  ) => {
    if (allocations.length === 0) return allocations;
    const sum = allocations.reduce(
      (allocationTotal, allocation) => allocationTotal + allocation.amount,
      0,
    );
    if (sum === 0) return allocations;
    const normalized = allocations.map((allocation) => ({
      ticker: allocation.ticker,
      amount: roundAmount((allocation.amount / sum) * total),
    }));
    const difference = roundAmount(
      total -
        normalized.reduce((value, allocation) => value + allocation.amount, 0),
    );
    if (difference !== 0) {
      normalized[normalized.length - 1].amount = roundAmount(
        normalized[normalized.length - 1].amount + difference,
      );
    }
    return normalized;
  };
  const getCandidates = (ticker: string) =>
    comparisonItems.filter((comparisonItem) => {
      const candidateTicker = comparisonItem.ticker.toUpperCase();
      return (
        comparisonItem.status !== 'extra' &&
        !normalizedQualifiedTickers.has(candidateTicker) &&
        candidateTicker !== ticker
      );
    });

  return items.map((item) => {
    const ticker = item.ticker.toUpperCase();
    const isQualified = normalizedQualifiedTickers.has(ticker);
    const suggestedAmount = item.suggestedAmount;
    if (
      !isQualified ||
      item.action !== 'buy' ||
      typeof suggestedAmount !== 'number' ||
      !Number.isFinite(suggestedAmount) ||
      suggestedAmount <= 0
    ) {
      const { fallbackAllocations: _fallbackAllocations, ...withoutFallback } =
        item;
      return withoutFallback;
    }

    const validAllocations = (item.fallbackAllocations ?? [])
      .filter(
        (allocation) =>
          typeof allocation.ticker === 'string' &&
          allocation.ticker.length > 0 &&
          typeof allocation.amount === 'number' &&
          Number.isFinite(allocation.amount) &&
          allocation.amount > 0,
      )
      .map((allocation) => ({
        ticker: allocation.ticker.toUpperCase(),
        amount: allocation.amount,
      }))
      .filter((allocation) => {
        const comparisonItem = comparisonByTicker.get(allocation.ticker);
        return (
          comparisonItem !== undefined &&
          comparisonItem.status !== 'extra' &&
          !normalizedQualifiedTickers.has(allocation.ticker) &&
          allocation.ticker !== ticker
        );
      });
    const allocationTotal = validAllocations.reduce(
      (total, allocation) => total + allocation.amount,
      0,
    );
    const candidates = getCandidates(ticker);
    let allocations = validAllocations;
    if (allocationTotal === 0) {
      if (candidates.length === 0) {
        const {
          fallbackAllocations: _fallbackAllocations,
          ...withoutFallback
        } = item;
        return withoutFallback;
      }
      const weights = candidates.map((candidate) =>
        typeof candidate.recommendedWeight === 'number' &&
        Number.isFinite(candidate.recommendedWeight) &&
        candidate.recommendedWeight > 0
          ? candidate.recommendedWeight
          : 0,
      );
      const weightTotal = weights.reduce((total, weight) => total + weight, 0);
      allocations = candidates.map((candidate, index) => ({
        ticker: candidate.ticker.toUpperCase(),
        amount:
          weightTotal > 0
            ? roundAmount((suggestedAmount * weights[index]) / weightTotal)
            : roundAmount(suggestedAmount / candidates.length),
      }));
      allocations = normalizeAmounts(allocations, suggestedAmount);
    } else if (
      Math.abs(allocationTotal - suggestedAmount) >
      suggestedAmount * 0.01
    ) {
      allocations = normalizeAmounts(validAllocations, suggestedAmount);
    }
    while (allocations.length > 0) {
      const affordableAllocations = allocations.filter((allocation) => {
        const price = priceByTicker.get(allocation.ticker);
        return !(
          typeof price === 'number' &&
          Number.isFinite(price) &&
          price > 0 &&
          Math.floor(allocation.amount / price) === 0
        );
      });
      if (affordableAllocations.length === allocations.length) break;
      allocations = normalizeAmounts(affordableAllocations, suggestedAmount);
    }
    if (allocations.length === 0) {
      const cheapestCandidate = candidates
        .map((candidate) => {
          const candidateTicker = candidate.ticker.toUpperCase();
          const price = priceByTicker.get(candidateTicker);
          return { ticker: candidateTicker, price };
        })
        .filter(
          (candidate): candidate is { ticker: string; price: number } =>
            typeof candidate.price === 'number' &&
            Number.isFinite(candidate.price) &&
            candidate.price > 0,
        )
        .sort((a, b) => a.price - b.price)[0];
      if (
        !cheapestCandidate ||
        Math.floor(suggestedAmount / cheapestCandidate.price) === 0
      ) {
        const {
          fallbackAllocations: _fallbackAllocations,
          ...withoutFallback
        } = item;
        return withoutFallback;
      }
      allocations = [
        { ticker: cheapestCandidate.ticker, amount: suggestedAmount },
      ];
    }
    return {
      ...item,
      fallbackAllocations: withQuantities(allocations),
    };
  });
}
