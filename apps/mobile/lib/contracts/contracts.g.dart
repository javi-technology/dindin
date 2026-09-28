// ignore_for_file: type=lint
// Arquivo gerado — não edite à mão.
//
// A fonte é `openapi/dindin.yaml`; altere lá e rode `npm run contracts:gen`.
// O CI roda `npm run contracts:check` e reprova o que estiver fora de dia.

/// Corpo de erro produzido pelo `asyncHandler` a partir do `HttpError`.
/// A mensagem de 4xx é escrita para a tela e vem em pt-BR; a de 5xx não
/// é exposta.
class ErrorResponse {
  const ErrorResponse({required this.error, this.code});

  factory ErrorResponse.fromJson(Map<String, dynamic> json) => ErrorResponse(
    error: json['error'] as String,
    code: json['code'] == null ? null : json['code'] as String,
  );

  final String error;

  /// Código de contrato lido pelo frontend, como `SUBSCRIPTION_REQUIRED`.
  final String? code;

  Map<String, dynamic> toJson() => {
    'error': error,
    if (code != null) 'code': code,
  };
}

/// Tipos de ativo suportados em uma posição.
enum AssetType {
  fii('FII'),
  stock('STOCK'),
  etf('ETF'),
  reit('REIT'),
  other('OTHER');

  const AssetType(this.wire);

  /// Valor como a API o transmite.
  final String wire;

  factory AssetType.fromJson(String valor) => AssetType.values.firstWhere(
    (e) => e.wire == valor,
    orElse: () => throw ArgumentError('AssetType desconhecido: $valor'),
  );

  String toJson() => wire;
}

enum AiSuggestionTab {
  renda('renda'),
  ganho('ganho');

  const AiSuggestionTab(this.wire);

  /// Valor como a API o transmite.
  final String wire;

  factory AiSuggestionTab.fromJson(String valor) =>
      AiSuggestionTab.values.firstWhere(
        (e) => e.wire == valor,
        orElse: () =>
            throw ArgumentError('AiSuggestionTab desconhecido: $valor'),
      );

  String toJson() => wire;
}

/// Instituição que publica a carteira sugerida.
enum RecommendedWalletProvider {
  bb('BB');

  const RecommendedWalletProvider(this.wire);

  /// Valor como a API o transmite.
  final String wire;

  factory RecommendedWalletProvider.fromJson(String valor) =>
      RecommendedWalletProvider.values.firstWhere(
        (e) => e.wire == valor,
        orElse: () => throw ArgumentError(
          'RecommendedWalletProvider desconhecido: $valor',
        ),
      );

  String toJson() => wire;
}

enum RecommendedWalletStatus {
  pendingReview('pending_review'),
  confirmed('confirmed');

  const RecommendedWalletStatus(this.wire);

  /// Valor como a API o transmite.
  final String wire;

  factory RecommendedWalletStatus.fromJson(String valor) =>
      RecommendedWalletStatus.values.firstWhere(
        (e) => e.wire == valor,
        orElse: () =>
            throw ArgumentError('RecommendedWalletStatus desconhecido: $valor'),
      );

  String toJson() => wire;
}

/// Carteira de investimentos.
class Wallet {
  const Wallet({
    required this.id,
    required this.ownerId,
    required this.name,
    this.description,
    required this.currency,
    required this.createdAt,
    required this.updatedAt,
  });

  factory Wallet.fromJson(Map<String, dynamic> json) => Wallet(
    id: json['id'] as String,
    ownerId: json['ownerId'] as String,
    name: json['name'] as String,
    description: json['description'] == null
        ? null
        : json['description'] as String,
    currency: json['currency'] as String,
    createdAt: json['createdAt'] as String,
    updatedAt: json['updatedAt'] as String,
  );

  final String id;
  final String ownerId;
  final String name;
  final String? description;

  /// BRL-only por decisão de produto (#266).
  final String currency;
  final String createdAt;
  final String updatedAt;

  Map<String, dynamic> toJson() => {
    'id': id,
    'ownerId': ownerId,
    'name': name,
    if (description != null) 'description': description,
    'currency': currency,
    'createdAt': createdAt,
    'updatedAt': updatedAt,
  };
}

/// Ativo do catálogo — fonte única sobre quais tickers podem ser cadastrados.
class Asset {
  const Asset({
    required this.ticker,
    required this.name,
    required this.assetType,
    required this.active,
    this.qualifiedInvestor,
    required this.createdAt,
    required this.updatedAt,
  });

  factory Asset.fromJson(Map<String, dynamic> json) => Asset(
    ticker: json['ticker'] as String,
    name: json['name'] as String,
    assetType: AssetType.fromJson(json['assetType'] as String),
    active: json['active'] as bool,
    qualifiedInvestor: json['qualifiedInvestor'] == null
        ? null
        : json['qualifiedInvestor'] as bool,
    createdAt: json['createdAt'] as String,
    updatedAt: json['updatedAt'] as String,
  );

  final String ticker;
  final String name;
  final AssetType assetType;
  final bool active;
  final bool? qualifiedInvestor;
  final String createdAt;
  final String updatedAt;

  Map<String, dynamic> toJson() => {
    'ticker': ticker,
    'name': name,
    'assetType': assetType.toJson(),
    'active': active,
    if (qualifiedInvestor != null) 'qualifiedInvestor': qualifiedInvestor,
    'createdAt': createdAt,
    'updatedAt': updatedAt,
  };
}

/// Posição de um ativo na carteira.
class Position {
  const Position({
    required this.id,
    required this.walletId,
    required this.ticker,
    required this.assetType,
    required this.quantity,
    required this.averagePrice,
    this.currentPrice,
    this.currentPriceQuotedAt,
    required this.inFridge,
    this.targetPrice,
    this.sector,
    this.notes,
    required this.createdAt,
    required this.updatedAt,
  });

  factory Position.fromJson(Map<String, dynamic> json) => Position(
    id: json['id'] as String,
    walletId: json['walletId'] as String,
    ticker: json['ticker'] as String,
    assetType: AssetType.fromJson(json['assetType'] as String),
    quantity: (json['quantity'] as num).toDouble(),
    averagePrice: (json['averagePrice'] as num).toDouble(),
    currentPrice: json['currentPrice'] == null
        ? null
        : (json['currentPrice'] as num).toDouble(),
    currentPriceQuotedAt: json['currentPriceQuotedAt'] == null
        ? null
        : json['currentPriceQuotedAt'] as String,
    inFridge: json['inFridge'] as bool,
    targetPrice: json['targetPrice'] == null
        ? null
        : (json['targetPrice'] as num).toDouble(),
    sector: json['sector'] == null ? null : json['sector'] as String,
    notes: json['notes'] == null ? null : json['notes'] as String,
    createdAt: json['createdAt'] as String,
    updatedAt: json['updatedAt'] as String,
  );

  final String id;
  final String walletId;
  final String ticker;
  final AssetType assetType;
  final double quantity;
  final double averagePrice;

  /// Último preço conhecido; ausente quando não há cotação.
  final double? currentPrice;

  /// Quando o `currentPrice` foi apurado na fonte (#390).
  final String? currentPriceQuotedAt;
  final bool inFridge;
  final double? targetPrice;
  final String? sector;
  final String? notes;
  final String createdAt;
  final String updatedAt;

  Map<String, dynamic> toJson() => {
    'id': id,
    'walletId': walletId,
    'ticker': ticker,
    'assetType': assetType.toJson(),
    'quantity': quantity,
    'averagePrice': averagePrice,
    if (currentPrice != null) 'currentPrice': currentPrice,
    if (currentPriceQuotedAt != null)
      'currentPriceQuotedAt': currentPriceQuotedAt,
    'inFridge': inFridge,
    if (targetPrice != null) 'targetPrice': targetPrice,
    if (sector != null) 'sector': sector,
    if (notes != null) 'notes': notes,
    'createdAt': createdAt,
    'updatedAt': updatedAt,
  };
}

/// Geladeira — acompanhamento de oportunidades.
class Fridge {
  const Fridge({
    required this.id,
    required this.ownerId,
    required this.name,
    this.description,
    required this.createdAt,
    required this.updatedAt,
  });

  factory Fridge.fromJson(Map<String, dynamic> json) => Fridge(
    id: json['id'] as String,
    ownerId: json['ownerId'] as String,
    name: json['name'] as String,
    description: json['description'] == null
        ? null
        : json['description'] as String,
    createdAt: json['createdAt'] as String,
    updatedAt: json['updatedAt'] as String,
  );

  final String id;
  final String ownerId;
  final String name;
  final String? description;
  final String createdAt;
  final String updatedAt;

  Map<String, dynamic> toJson() => {
    'id': id,
    'ownerId': ownerId,
    'name': name,
    if (description != null) 'description': description,
    'createdAt': createdAt,
    'updatedAt': updatedAt,
  };
}

class FridgeItem {
  const FridgeItem({
    required this.id,
    required this.fridgeId,
    required this.ticker,
    required this.quantity,
    required this.transferredPrice,
    required this.targetPrice,
    this.currentPrice,
    this.currentPriceQuotedAt,
    this.assetType,
    this.notes,
    required this.createdAt,
    required this.updatedAt,
  });

  factory FridgeItem.fromJson(Map<String, dynamic> json) => FridgeItem(
    id: json['id'] as String,
    fridgeId: json['fridgeId'] as String,
    ticker: json['ticker'] as String,
    quantity: (json['quantity'] as num).toDouble(),
    transferredPrice: (json['transferredPrice'] as num).toDouble(),
    targetPrice: (json['targetPrice'] as num).toDouble(),
    currentPrice: json['currentPrice'] == null
        ? null
        : (json['currentPrice'] as num).toDouble(),
    currentPriceQuotedAt: json['currentPriceQuotedAt'] == null
        ? null
        : json['currentPriceQuotedAt'] as String,
    assetType: json['assetType'] == null
        ? null
        : AssetType.fromJson(json['assetType'] as String),
    notes: json['notes'] == null ? null : json['notes'] as String,
    createdAt: json['createdAt'] as String,
    updatedAt: json['updatedAt'] as String,
  );

  final String id;
  final String fridgeId;
  final String ticker;
  final double quantity;
  final double transferredPrice;
  final double targetPrice;
  final double? currentPrice;
  final String? currentPriceQuotedAt;
  final AssetType? assetType;
  final String? notes;
  final String createdAt;
  final String updatedAt;

  Map<String, dynamic> toJson() => {
    'id': id,
    'fridgeId': fridgeId,
    'ticker': ticker,
    'quantity': quantity,
    'transferredPrice': transferredPrice,
    'targetPrice': targetPrice,
    if (currentPrice != null) 'currentPrice': currentPrice,
    if (currentPriceQuotedAt != null)
      'currentPriceQuotedAt': currentPriceQuotedAt,
    if (assetType != null) 'assetType': assetType?.toJson(),
    if (notes != null) 'notes': notes,
    'createdAt': createdAt,
    'updatedAt': updatedAt,
  };
}

/// Snapshot diário do patrimônio.
class PatrimonySnapshot {
  const PatrimonySnapshot({
    required this.id,
    required this.userId,
    required this.date,
    required this.totalWallet,
    required this.totalFridge,
    required this.total,
    required this.createdAt,
  });

  factory PatrimonySnapshot.fromJson(Map<String, dynamic> json) =>
      PatrimonySnapshot(
        id: json['id'] as String,
        userId: json['userId'] as String,
        date: json['date'] as String,
        totalWallet: (json['totalWallet'] as num).toDouble(),
        totalFridge: (json['totalFridge'] as num).toDouble(),
        total: (json['total'] as num).toDouble(),
        createdAt: json['createdAt'] as String,
      );

  final String id;
  final String userId;
  final String date;
  final double totalWallet;
  final double totalFridge;
  final double total;
  final String createdAt;

  Map<String, dynamic> toJson() => {
    'id': id,
    'userId': userId,
    'date': date,
    'totalWallet': totalWallet,
    'totalFridge': totalFridge,
    'total': total,
    'createdAt': createdAt,
  };
}

class RecommendedWalletAsset {
  const RecommendedWalletAsset({
    required this.ticker,
    required this.segment,
    required this.weight,
    required this.closePrice,
    required this.ifixWeight,
    required this.inCatalog,
  });

  factory RecommendedWalletAsset.fromJson(Map<String, dynamic> json) =>
      RecommendedWalletAsset(
        ticker: json['ticker'] as String,
        segment: json['segment'] as String,
        weight: (json['weight'] as num).toDouble(),
        closePrice: (json['closePrice'] as num).toDouble(),
        ifixWeight: (json['ifixWeight'] as num).toDouble(),
        inCatalog: json['inCatalog'] as bool,
      );

  final String ticker;
  final String segment;
  final double weight;
  final double closePrice;
  final double ifixWeight;
  final bool inCatalog;

  Map<String, dynamic> toJson() => {
    'ticker': ticker,
    'segment': segment,
    'weight': weight,
    'closePrice': closePrice,
    'ifixWeight': ifixWeight,
    'inCatalog': inCatalog,
  };
}

class RecommendedWallet {
  const RecommendedWallet({
    required this.id,
    required this.provider,
    this.providerSlug,
    required this.month,
    required this.revision,
    required this.publishedAt,
    required this.sourceFile,
    required this.status,
    required this.renda,
    required this.ganho,
    required this.parsedAt,
    this.confirmedAt,
    required this.createdAt,
    required this.updatedAt,
  });

  factory RecommendedWallet.fromJson(
    Map<String, dynamic> json,
  ) => RecommendedWallet(
    id: json['id'] as String,
    provider: RecommendedWalletProvider.fromJson(json['provider'] as String),
    providerSlug: json['providerSlug'] == null
        ? null
        : json['providerSlug'] as String,
    month: json['month'] as String,
    revision: (json['revision'] as num).toInt(),
    publishedAt: json['publishedAt'] as String,
    sourceFile: json['sourceFile'] as String,
    status: RecommendedWalletStatus.fromJson(json['status'] as String),
    renda: (json['renda'] as List<dynamic>)
        .map((e) => RecommendedWalletAsset.fromJson(e as Map<String, dynamic>))
        .toList(),
    ganho: (json['ganho'] as List<dynamic>)
        .map((e) => RecommendedWalletAsset.fromJson(e as Map<String, dynamic>))
        .toList(),
    parsedAt: json['parsedAt'] as String,
    confirmedAt: json['confirmedAt'] == null
        ? null
        : json['confirmedAt'] as String,
    createdAt: json['createdAt'] as String,
    updatedAt: json['updatedAt'] as String,
  );

  final String id;
  final RecommendedWalletProvider provider;

  /// Ausente nos documentos anteriores à #395; a leitura o deriva do id.
  final String? providerSlug;
  final String month;
  final int revision;
  final String publishedAt;
  final String sourceFile;
  final RecommendedWalletStatus status;
  final List<RecommendedWalletAsset> renda;
  final List<RecommendedWalletAsset> ganho;
  final String parsedAt;
  final String? confirmedAt;
  final String createdAt;
  final String updatedAt;

  Map<String, dynamic> toJson() => {
    'id': id,
    'provider': provider.toJson(),
    if (providerSlug != null) 'providerSlug': providerSlug,
    'month': month,
    'revision': revision,
    'publishedAt': publishedAt,
    'sourceFile': sourceFile,
    'status': status.toJson(),
    'renda': renda.map((e) => e.toJson()).toList(),
    'ganho': ganho.map((e) => e.toJson()).toList(),
    'parsedAt': parsedAt,
    if (confirmedAt != null) 'confirmedAt': confirmedAt,
    'createdAt': createdAt,
    'updatedAt': updatedAt,
  };
}

class RecommendedWalletComparisonItem {
  const RecommendedWalletComparisonItem({
    required this.ticker,
    this.recommendedWeight,
    this.currentWeight,
    required this.quantity,
    required this.currentValue,
    required this.status,
  });

  factory RecommendedWalletComparisonItem.fromJson(Map<String, dynamic> json) =>
      RecommendedWalletComparisonItem(
        ticker: json['ticker'] as String,
        recommendedWeight: json['recommendedWeight'] == null
            ? null
            : (json['recommendedWeight'] as num).toDouble(),
        currentWeight: json['currentWeight'] == null
            ? null
            : (json['currentWeight'] as num).toDouble(),
        quantity: (json['quantity'] as num).toDouble(),
        currentValue: (json['currentValue'] as num).toDouble(),
        status: json['status'] as String,
      );

  final String ticker;
  final double? recommendedWeight;
  final double? currentWeight;
  final double quantity;
  final double currentValue;
  final String status;

  Map<String, dynamic> toJson() => {
    'ticker': ticker,
    'recommendedWeight': recommendedWeight,
    'currentWeight': currentWeight,
    'quantity': quantity,
    'currentValue': currentValue,
    'status': status,
  };
}

class RecommendedWalletComparison {
  const RecommendedWalletComparison({
    required this.recommended,
    required this.items,
    required this.totalValue,
  });

  factory RecommendedWalletComparison.fromJson(Map<String, dynamic> json) =>
      RecommendedWalletComparison(
        recommended: RecommendedWallet.fromJson(
          json['recommended'] as Map<String, dynamic>,
        ),
        items: (json['items'] as List<dynamic>)
            .map(
              (e) => RecommendedWalletComparisonItem.fromJson(
                e as Map<String, dynamic>,
              ),
            )
            .toList(),
        totalValue: (json['totalValue'] as num).toDouble(),
      );

  final RecommendedWallet recommended;
  final List<RecommendedWalletComparisonItem> items;
  final double totalValue;

  Map<String, dynamic> toJson() => {
    'recommended': recommended.toJson(),
    'items': items.map((e) => e.toJson()).toList(),
    'totalValue': totalValue,
  };
}

class AiSuggestionFallbackAllocation {
  const AiSuggestionFallbackAllocation({
    required this.ticker,
    required this.amount,
    this.suggestedQuantity,
    this.referencePrice,
  });

  factory AiSuggestionFallbackAllocation.fromJson(Map<String, dynamic> json) =>
      AiSuggestionFallbackAllocation(
        ticker: json['ticker'] as String,
        amount: (json['amount'] as num).toDouble(),
        suggestedQuantity: json['suggestedQuantity'] == null
            ? null
            : (json['suggestedQuantity'] as num).toDouble(),
        referencePrice: json['referencePrice'] == null
            ? null
            : (json['referencePrice'] as num).toDouble(),
      );

  final String ticker;
  final double amount;
  final double? suggestedQuantity;
  final double? referencePrice;

  Map<String, dynamic> toJson() => {
    'ticker': ticker,
    'amount': amount,
    if (suggestedQuantity != null) 'suggestedQuantity': suggestedQuantity,
    if (referencePrice != null) 'referencePrice': referencePrice,
  };
}

class AiSuggestionItem {
  const AiSuggestionItem({
    required this.ticker,
    required this.action,
    required this.priority,
    required this.rationale,
    this.suggestedAmount,
    this.suggestedQuantity,
    this.referencePrice,
    this.qualifiedInvestor,
    this.fallbackAllocations,
  });

  factory AiSuggestionItem.fromJson(Map<String, dynamic> json) =>
      AiSuggestionItem(
        ticker: json['ticker'] as String,
        action: json['action'] as String,
        priority: (json['priority'] as num).toInt(),
        rationale: json['rationale'] as String,
        suggestedAmount: json['suggestedAmount'] == null
            ? null
            : (json['suggestedAmount'] as num).toDouble(),
        suggestedQuantity: json['suggestedQuantity'] == null
            ? null
            : (json['suggestedQuantity'] as num).toDouble(),
        referencePrice: json['referencePrice'] == null
            ? null
            : (json['referencePrice'] as num).toDouble(),
        qualifiedInvestor: json['qualifiedInvestor'] == null
            ? null
            : json['qualifiedInvestor'] as bool,
        fallbackAllocations: json['fallbackAllocations'] == null
            ? null
            : (json['fallbackAllocations'] as List<dynamic>)
                  .map(
                    (e) => AiSuggestionFallbackAllocation.fromJson(
                      e as Map<String, dynamic>,
                    ),
                  )
                  .toList(),
      );

  final String ticker;
  final String action;
  final int priority;
  final String rationale;
  final double? suggestedAmount;
  final double? suggestedQuantity;
  final double? referencePrice;
  final bool? qualifiedInvestor;
  final List<AiSuggestionFallbackAllocation>? fallbackAllocations;

  Map<String, dynamic> toJson() => {
    'ticker': ticker,
    'action': action,
    'priority': priority,
    'rationale': rationale,
    if (suggestedAmount != null) 'suggestedAmount': suggestedAmount,
    if (suggestedQuantity != null) 'suggestedQuantity': suggestedQuantity,
    if (referencePrice != null) 'referencePrice': referencePrice,
    if (qualifiedInvestor != null) 'qualifiedInvestor': qualifiedInvestor,
    if (fallbackAllocations != null)
      'fallbackAllocations': fallbackAllocations
          ?.map((e) => e.toJson())
          .toList(),
  };
}

/// Compra da sugestão já lançada na carteira pelo usuário (#276).
class AiSuggestionAppliedItem {
  const AiSuggestionAppliedItem({
    required this.ticker,
    this.fallbackFor,
    required this.quantity,
    required this.price,
    required this.appliedAt,
  });

  factory AiSuggestionAppliedItem.fromJson(Map<String, dynamic> json) =>
      AiSuggestionAppliedItem(
        ticker: json['ticker'] as String,
        fallbackFor: json['fallbackFor'] == null
            ? null
            : json['fallbackFor'] as String,
        quantity: (json['quantity'] as num).toDouble(),
        price: (json['price'] as num).toDouble(),
        appliedAt: json['appliedAt'] as String,
      );

  final String ticker;

  /// FII de origem, quando o item é alternativa de redistribuição.
  final String? fallbackFor;
  final double quantity;
  final double price;
  final String appliedAt;

  Map<String, dynamic> toJson() => {
    'ticker': ticker,
    if (fallbackFor != null) 'fallbackFor': fallbackFor,
    'quantity': quantity,
    'price': price,
    'appliedAt': appliedAt,
  };
}

class AiSuggestion {
  const AiSuggestion({
    required this.id,
    required this.walletId,
    required this.month,
    required this.tab,
    required this.model,
    required this.summary,
    required this.items,
    required this.disclaimer,
    required this.createdAt,
    this.contribution,
    this.projectedDividends,
    this.historyMonths,
    this.appliedItems,
  });

  factory AiSuggestion.fromJson(Map<String, dynamic> json) => AiSuggestion(
    id: json['id'] as String,
    walletId: json['walletId'] as String,
    month: json['month'] as String,
    tab: AiSuggestionTab.fromJson(json['tab'] as String),
    model: json['model'] as String,
    summary: json['summary'] as String,
    items: (json['items'] as List<dynamic>)
        .map((e) => AiSuggestionItem.fromJson(e as Map<String, dynamic>))
        .toList(),
    disclaimer: json['disclaimer'] as String,
    createdAt: json['createdAt'] as String,
    contribution: json['contribution'] == null
        ? null
        : (json['contribution'] as num).toDouble(),
    projectedDividends: json['projectedDividends'] == null
        ? null
        : (json['projectedDividends'] as num).toDouble(),
    historyMonths: json['historyMonths'] == null
        ? null
        : (json['historyMonths'] as List<dynamic>)
              .map((e) => e as String)
              .toList(),
    appliedItems: json['appliedItems'] == null
        ? null
        : (json['appliedItems'] as List<dynamic>)
              .map(
                (e) =>
                    AiSuggestionAppliedItem.fromJson(e as Map<String, dynamic>),
              )
              .toList(),
  );

  final String id;
  final String walletId;
  final String month;
  final AiSuggestionTab tab;
  final String model;
  final String summary;
  final List<AiSuggestionItem> items;
  final String disclaimer;
  final String createdAt;
  final double? contribution;
  final double? projectedDividends;
  final List<String>? historyMonths;
  final List<AiSuggestionAppliedItem>? appliedItems;

  Map<String, dynamic> toJson() => {
    'id': id,
    'walletId': walletId,
    'month': month,
    'tab': tab.toJson(),
    'model': model,
    'summary': summary,
    'items': items.map((e) => e.toJson()).toList(),
    'disclaimer': disclaimer,
    'createdAt': createdAt,
    if (contribution != null) 'contribution': contribution,
    if (projectedDividends != null) 'projectedDividends': projectedDividends,
    if (historyMonths != null) 'historyMonths': historyMonths,
    if (appliedItems != null)
      'appliedItems': appliedItems?.map((e) => e.toJson()).toList(),
  };
}

class HealthResponse {
  const HealthResponse({required this.status, required this.project});

  factory HealthResponse.fromJson(Map<String, dynamic> json) => HealthResponse(
    status: json['status'] as String,
    project: json['project'] as String,
  );

  final String status;
  final String project;

  Map<String, dynamic> toJson() => {'status': status, 'project': project};
}

/// Estado da assinatura do usuário (#147).
enum SubscriptionStatus {
  none('none'),
  trialing('trialing'),
  active('active'),
  pastDue('past_due'),
  canceled('canceled');

  const SubscriptionStatus(this.wire);

  /// Valor como a API o transmite.
  final String wire;

  factory SubscriptionStatus.fromJson(String valor) =>
      SubscriptionStatus.values.firstWhere(
        (e) => e.wire == valor,
        orElse: () =>
            throw ArgumentError('SubscriptionStatus desconhecido: $valor'),
      );

  String toJson() => wire;
}

/// Recursos liberados mediante assinatura. `ai` cobre sugestão, chat e
/// futuras features de IA; `projections` cobre a projeção completa por
/// ativo e a agenda de pagamentos (#262).
enum Entitlement {
  ai('ai'),
  projections('projections');

  const Entitlement(this.wire);

  /// Valor como a API o transmite.
  final String wire;

  factory Entitlement.fromJson(String valor) => Entitlement.values.firstWhere(
    (e) => e.wire == valor,
    orElse: () => throw ArgumentError('Entitlement desconhecido: $valor'),
  );

  String toJson() => wire;
}

enum SubscriptionPlan {
  basic('basic');

  const SubscriptionPlan(this.wire);

  /// Valor como a API o transmite.
  final String wire;

  factory SubscriptionPlan.fromJson(String valor) =>
      SubscriptionPlan.values.firstWhere(
        (e) => e.wire == valor,
        orElse: () =>
            throw ArgumentError('SubscriptionPlan desconhecido: $valor'),
      );

  String toJson() => wire;
}

enum SubscriptionInterval {
  month('month'),
  year('year');

  const SubscriptionInterval(this.wire);

  /// Valor como a API o transmite.
  final String wire;

  factory SubscriptionInterval.fromJson(String valor) =>
      SubscriptionInterval.values.firstWhere(
        (e) => e.wire == valor,
        orElse: () =>
            throw ArgumentError('SubscriptionInterval desconhecido: $valor'),
      );

  String toJson() => wire;
}

enum SubscriptionProvider {
  stripe('stripe'),
  manual('manual');

  const SubscriptionProvider(this.wire);

  /// Valor como a API o transmite.
  final String wire;

  factory SubscriptionProvider.fromJson(String valor) =>
      SubscriptionProvider.values.firstWhere(
        (e) => e.wire == valor,
        orElse: () =>
            throw ArgumentError('SubscriptionProvider desconhecido: $valor'),
      );

  String toJson() => wire;
}

/// Último estado da assinatura Stripe recebido pelo webhook (#171).
class StripeSubscriptionState {
  const StripeSubscriptionState({
    required this.status,
    this.interval,
    this.providerSubscriptionId,
    this.currentPeriodEnd,
    required this.cancelAtPeriodEnd,
    required this.updatedAt,
  });

  factory StripeSubscriptionState.fromJson(Map<String, dynamic> json) =>
      StripeSubscriptionState(
        status: SubscriptionStatus.fromJson(json['status'] as String),
        interval: json['interval'] == null
            ? null
            : SubscriptionInterval.fromJson(json['interval'] as String),
        providerSubscriptionId: json['providerSubscriptionId'] == null
            ? null
            : json['providerSubscriptionId'] as String,
        currentPeriodEnd: json['currentPeriodEnd'] == null
            ? null
            : json['currentPeriodEnd'] as String,
        cancelAtPeriodEnd: json['cancelAtPeriodEnd'] as bool,
        updatedAt: json['updatedAt'] as String,
      );

  final SubscriptionStatus status;
  final SubscriptionInterval? interval;
  final String? providerSubscriptionId;
  final String? currentPeriodEnd;
  final bool cancelAtPeriodEnd;
  final String updatedAt;

  Map<String, dynamic> toJson() => {
    'status': status.toJson(),
    'interval': interval?.toJson(),
    if (providerSubscriptionId != null)
      'providerSubscriptionId': providerSubscriptionId,
    'currentPeriodEnd': currentPeriodEnd,
    'cancelAtPeriodEnd': cancelAtPeriodEnd,
    'updatedAt': updatedAt,
  };
}

/// Documento `users/{uid}/billing/subscription`. Ausência equivale a `status: 'none'`.
class UserSubscription {
  const UserSubscription({
    required this.status,
    this.plan,
    this.interval,
    this.provider,
    this.providerCustomerId,
    this.providerSubscriptionId,
    this.providerEventCreated,
    this.currentPeriodEnd,
    required this.cancelAtPeriodEnd,
    required this.updatedAt,
    this.stripe,
  });

  factory UserSubscription.fromJson(Map<String, dynamic> json) =>
      UserSubscription(
        status: SubscriptionStatus.fromJson(json['status'] as String),
        plan: json['plan'] == null
            ? null
            : SubscriptionPlan.fromJson(json['plan'] as String),
        interval: json['interval'] == null
            ? null
            : SubscriptionInterval.fromJson(json['interval'] as String),
        provider: json['provider'] == null
            ? null
            : SubscriptionProvider.fromJson(json['provider'] as String),
        providerCustomerId: json['providerCustomerId'] == null
            ? null
            : json['providerCustomerId'] as String,
        providerSubscriptionId: json['providerSubscriptionId'] == null
            ? null
            : json['providerSubscriptionId'] as String,
        providerEventCreated: json['providerEventCreated'] == null
            ? null
            : (json['providerEventCreated'] as num).toInt(),
        currentPeriodEnd: json['currentPeriodEnd'] == null
            ? null
            : json['currentPeriodEnd'] as String,
        cancelAtPeriodEnd: json['cancelAtPeriodEnd'] as bool,
        updatedAt: json['updatedAt'] as String,
        stripe: json['stripe'] == null
            ? null
            : StripeSubscriptionState.fromJson(
                json['stripe'] as Map<String, dynamic>,
              ),
      );

  final SubscriptionStatus status;
  final SubscriptionPlan? plan;
  final SubscriptionInterval? interval;
  final SubscriptionProvider? provider;
  final String? providerCustomerId;
  final String? providerSubscriptionId;

  /// `event.created` do último evento aplicado — protege contra webhooks fora de ordem.
  final int? providerEventCreated;
  final String? currentPeriodEnd;
  final bool cancelAtPeriodEnd;
  final String updatedAt;

  /// Ausente em docs anteriores à #171.
  final StripeSubscriptionState? stripe;

  Map<String, dynamic> toJson() => {
    'status': status.toJson(),
    'plan': plan?.toJson(),
    'interval': interval?.toJson(),
    'provider': provider?.toJson(),
    if (providerCustomerId != null) 'providerCustomerId': providerCustomerId,
    if (providerSubscriptionId != null)
      'providerSubscriptionId': providerSubscriptionId,
    if (providerEventCreated != null)
      'providerEventCreated': providerEventCreated,
    'currentPeriodEnd': currentPeriodEnd,
    'cancelAtPeriodEnd': cancelAtPeriodEnd,
    'updatedAt': updatedAt,
    if (stripe != null) 'stripe': stripe?.toJson(),
  };
}

/// Visão pública da assinatura em `GET /api/me`, sem ids do provedor.
class PublicSubscription {
  const PublicSubscription({
    required this.status,
    this.plan,
    this.interval,
    this.currentPeriodEnd,
    required this.cancelAtPeriodEnd,
  });

  factory PublicSubscription.fromJson(Map<String, dynamic> json) =>
      PublicSubscription(
        status: SubscriptionStatus.fromJson(json['status'] as String),
        plan: json['plan'] == null
            ? null
            : SubscriptionPlan.fromJson(json['plan'] as String),
        interval: json['interval'] == null
            ? null
            : SubscriptionInterval.fromJson(json['interval'] as String),
        currentPeriodEnd: json['currentPeriodEnd'] == null
            ? null
            : json['currentPeriodEnd'] as String,
        cancelAtPeriodEnd: json['cancelAtPeriodEnd'] as bool,
      );

  final SubscriptionStatus status;
  final SubscriptionPlan? plan;
  final SubscriptionInterval? interval;
  final String? currentPeriodEnd;
  final bool cancelAtPeriodEnd;

  Map<String, dynamic> toJson() => {
    'status': status.toJson(),
    'plan': plan?.toJson(),
    'interval': interval?.toJson(),
    'currentPeriodEnd': currentPeriodEnd,
    'cancelAtPeriodEnd': cancelAtPeriodEnd,
  };
}

class MeResponse {
  const MeResponse({
    required this.uid,
    required this.admin,
    required this.subscription,
    required this.entitlements,
  });

  factory MeResponse.fromJson(Map<String, dynamic> json) => MeResponse(
    uid: json['uid'] as String,
    admin: json['admin'] as bool,
    subscription: PublicSubscription.fromJson(
      json['subscription'] as Map<String, dynamic>,
    ),
    entitlements: (json['entitlements'] as List<dynamic>)
        .map((e) => Entitlement.fromJson(e as String))
        .toList(),
  );

  final String uid;
  final bool admin;
  final PublicSubscription subscription;
  final List<Entitlement> entitlements;

  Map<String, dynamic> toJson() => {
    'uid': uid,
    'admin': admin,
    'subscription': subscription.toJson(),
    'entitlements': entitlements.map((e) => e.toJson()).toList(),
  };
}

/// Recurso padrão que `POST /api/me/setup` pode criar (#275).
enum DefaultResource {
  wallet('wallet'),
  fridge('fridge');

  const DefaultResource(this.wire);

  /// Valor como a API o transmite.
  final String wire;

  factory DefaultResource.fromJson(String valor) =>
      DefaultResource.values.firstWhere(
        (e) => e.wire == valor,
        orElse: () =>
            throw ArgumentError('DefaultResource desconhecido: $valor'),
      );

  String toJson() => wire;
}

/// Corpo opcional: pedido explícito pelo fallback.
class SetupRequest {
  const SetupRequest({this.resource});

  factory SetupRequest.fromJson(Map<String, dynamic> json) => SetupRequest(
    resource: json['resource'] == null
        ? null
        : DefaultResource.fromJson(json['resource'] as String),
  );

  final DefaultResource? resource;

  Map<String, dynamic> toJson() => {
    if (resource != null) 'resource': resource?.toJson(),
  };
}

class SetupResponse {
  const SetupResponse({
    required this.walletCreated,
    required this.fridgeCreated,
  });

  factory SetupResponse.fromJson(Map<String, dynamic> json) => SetupResponse(
    walletCreated: json['walletCreated'] as bool,
    fridgeCreated: json['fridgeCreated'] as bool,
  );

  final bool walletCreated;
  final bool fridgeCreated;

  Map<String, dynamic> toJson() => {
    'walletCreated': walletCreated,
    'fridgeCreated': fridgeCreated,
  };
}

/// Pública + provedor (#150) + status da Stripe guardada (#171).
class AdminSubscriptionView {
  const AdminSubscriptionView({
    required this.status,
    this.plan,
    this.interval,
    this.currentPeriodEnd,
    required this.cancelAtPeriodEnd,
    this.provider,
    this.stripeStatus,
  });

  factory AdminSubscriptionView.fromJson(Map<String, dynamic> json) =>
      AdminSubscriptionView(
        status: SubscriptionStatus.fromJson(json['status'] as String),
        plan: json['plan'] == null
            ? null
            : SubscriptionPlan.fromJson(json['plan'] as String),
        interval: json['interval'] == null
            ? null
            : SubscriptionInterval.fromJson(json['interval'] as String),
        currentPeriodEnd: json['currentPeriodEnd'] == null
            ? null
            : json['currentPeriodEnd'] as String,
        cancelAtPeriodEnd: json['cancelAtPeriodEnd'] as bool,
        provider: json['provider'] == null
            ? null
            : SubscriptionProvider.fromJson(json['provider'] as String),
        stripeStatus: json['stripeStatus'] == null
            ? null
            : SubscriptionStatus.fromJson(json['stripeStatus'] as String),
      );

  final SubscriptionStatus status;
  final SubscriptionPlan? plan;
  final SubscriptionInterval? interval;
  final String? currentPeriodEnd;
  final bool cancelAtPeriodEnd;
  final SubscriptionProvider? provider;
  final SubscriptionStatus? stripeStatus;

  Map<String, dynamic> toJson() => {
    'status': status.toJson(),
    'plan': plan?.toJson(),
    'interval': interval?.toJson(),
    'currentPeriodEnd': currentPeriodEnd,
    'cancelAtPeriodEnd': cancelAtPeriodEnd,
    'provider': provider?.toJson(),
    'stripeStatus': stripeStatus?.toJson(),
  };
}

class AdminUser {
  const AdminUser({
    required this.uid,
    this.email,
    required this.admin,
    required this.subscription,
    required this.entitlements,
  });

  factory AdminUser.fromJson(Map<String, dynamic> json) => AdminUser(
    uid: json['uid'] as String,
    email: json['email'] == null ? null : json['email'] as String,
    admin: json['admin'] as bool,
    subscription: AdminSubscriptionView.fromJson(
      json['subscription'] as Map<String, dynamic>,
    ),
    entitlements: (json['entitlements'] as List<dynamic>)
        .map((e) => Entitlement.fromJson(e as String))
        .toList(),
  );

  final String uid;
  final String? email;
  final bool admin;
  final AdminSubscriptionView subscription;
  final List<Entitlement> entitlements;

  Map<String, dynamic> toJson() => {
    'uid': uid,
    'email': email,
    'admin': admin,
    'subscription': subscription.toJson(),
    'entitlements': entitlements.map((e) => e.toJson()).toList(),
  };
}

/// `currentPeriodEnd: null` = sem validade.
class GrantSubscriptionRequest {
  const GrantSubscriptionRequest({required this.plan, this.currentPeriodEnd});

  factory GrantSubscriptionRequest.fromJson(Map<String, dynamic> json) =>
      GrantSubscriptionRequest(
        plan: SubscriptionPlan.fromJson(json['plan'] as String),
        currentPeriodEnd: json['currentPeriodEnd'] == null
            ? null
            : json['currentPeriodEnd'] as String,
      );

  final SubscriptionPlan plan;
  final String? currentPeriodEnd;

  Map<String, dynamic> toJson() => {
    'plan': plan.toJson(),
    'currentPeriodEnd': currentPeriodEnd,
  };
}

class CheckoutSessionRequest {
  const CheckoutSessionRequest({this.interval});

  factory CheckoutSessionRequest.fromJson(Map<String, dynamic> json) =>
      CheckoutSessionRequest(
        interval: json['interval'] == null
            ? null
            : SubscriptionInterval.fromJson(json['interval'] as String),
      );

  final SubscriptionInterval? interval;

  Map<String, dynamic> toJson() => {
    if (interval != null) 'interval': interval?.toJson(),
  };
}

class CheckoutSessionResponse {
  const CheckoutSessionResponse({required this.url});

  factory CheckoutSessionResponse.fromJson(Map<String, dynamic> json) =>
      CheckoutSessionResponse(url: json['url'] as String);

  final String url;

  Map<String, dynamic> toJson() => {'url': url};
}

class PortalSessionResponse {
  const PortalSessionResponse({required this.url});

  factory PortalSessionResponse.fromJson(Map<String, dynamic> json) =>
      PortalSessionResponse(url: json['url'] as String);

  final String url;

  Map<String, dynamic> toJson() => {'url': url};
}

class CreateAssetRequest {
  const CreateAssetRequest({
    required this.ticker,
    required this.name,
    required this.assetType,
    this.active,
    this.qualifiedInvestor,
  });

  factory CreateAssetRequest.fromJson(Map<String, dynamic> json) =>
      CreateAssetRequest(
        ticker: json['ticker'] as String,
        name: json['name'] as String,
        assetType: AssetType.fromJson(json['assetType'] as String),
        active: json['active'] == null ? null : json['active'] as bool,
        qualifiedInvestor: json['qualifiedInvestor'] == null
            ? null
            : json['qualifiedInvestor'] as bool,
      );

  final String ticker;
  final String name;
  final AssetType assetType;
  final bool? active;
  final bool? qualifiedInvestor;

  Map<String, dynamic> toJson() => {
    'ticker': ticker,
    'name': name,
    'assetType': assetType.toJson(),
    if (active != null) 'active': active,
    if (qualifiedInvestor != null) 'qualifiedInvestor': qualifiedInvestor,
  };
}

class UpdateAssetRequest {
  const UpdateAssetRequest({
    this.name,
    this.assetType,
    this.active,
    this.qualifiedInvestor,
  });

  factory UpdateAssetRequest.fromJson(Map<String, dynamic> json) =>
      UpdateAssetRequest(
        name: json['name'] == null ? null : json['name'] as String,
        assetType: json['assetType'] == null
            ? null
            : AssetType.fromJson(json['assetType'] as String),
        active: json['active'] == null ? null : json['active'] as bool,
        qualifiedInvestor: json['qualifiedInvestor'] == null
            ? null
            : json['qualifiedInvestor'] as bool,
      );

  final String? name;
  final AssetType? assetType;
  final bool? active;
  final bool? qualifiedInvestor;

  Map<String, dynamic> toJson() => {
    if (name != null) 'name': name,
    if (assetType != null) 'assetType': assetType?.toJson(),
    if (active != null) 'active': active,
    if (qualifiedInvestor != null) 'qualifiedInvestor': qualifiedInvestor,
  };
}

class CreateWalletRequest {
  const CreateWalletRequest({
    required this.name,
    required this.currency,
    this.description,
  });

  factory CreateWalletRequest.fromJson(Map<String, dynamic> json) =>
      CreateWalletRequest(
        name: json['name'] as String,
        currency: json['currency'] as String,
        description: json['description'] == null
            ? null
            : json['description'] as String,
      );

  final String name;

  /// BRL-only por decisão de produto (#266).
  final String currency;
  final String? description;

  Map<String, dynamic> toJson() => {
    'name': name,
    'currency': currency,
    if (description != null) 'description': description,
  };
}

class UpdateWalletRequest {
  const UpdateWalletRequest({this.name, this.currency, this.description});

  factory UpdateWalletRequest.fromJson(Map<String, dynamic> json) =>
      UpdateWalletRequest(
        name: json['name'] == null ? null : json['name'] as String,
        currency: json['currency'] == null ? null : json['currency'] as String,
        description: json['description'] == null
            ? null
            : json['description'] as String,
      );

  final String? name;
  final String? currency;
  final String? description;

  Map<String, dynamic> toJson() => {
    if (name != null) 'name': name,
    if (currency != null) 'currency': currency,
    if (description != null) 'description': description,
  };
}

class CreatePositionRequest {
  const CreatePositionRequest({
    required this.ticker,
    required this.assetType,
    required this.quantity,
    required this.averagePrice,
    this.inFridge,
    this.targetPrice,
  });

  factory CreatePositionRequest.fromJson(Map<String, dynamic> json) =>
      CreatePositionRequest(
        ticker: json['ticker'] as String,
        assetType: AssetType.fromJson(json['assetType'] as String),
        quantity: (json['quantity'] as num).toDouble(),
        averagePrice: (json['averagePrice'] as num).toDouble(),
        inFridge: json['inFridge'] == null ? null : json['inFridge'] as bool,
        targetPrice: json['targetPrice'] == null
            ? null
            : (json['targetPrice'] as num).toDouble(),
      );

  final String ticker;
  final AssetType assetType;
  final double quantity;
  final double averagePrice;
  final bool? inFridge;
  final double? targetPrice;

  Map<String, dynamic> toJson() => {
    'ticker': ticker,
    'assetType': assetType.toJson(),
    'quantity': quantity,
    'averagePrice': averagePrice,
    if (inFridge != null) 'inFridge': inFridge,
    if (targetPrice != null) 'targetPrice': targetPrice,
  };
}

/// `targetPrice: null` remove o preço-alvo gravado.
class UpdatePositionRequest {
  const UpdatePositionRequest({
    this.ticker,
    this.assetType,
    this.quantity,
    this.averagePrice,
    this.inFridge,
    this.targetPrice,
  });

  factory UpdatePositionRequest.fromJson(Map<String, dynamic> json) =>
      UpdatePositionRequest(
        ticker: json['ticker'] == null ? null : json['ticker'] as String,
        assetType: json['assetType'] == null
            ? null
            : AssetType.fromJson(json['assetType'] as String),
        quantity: json['quantity'] == null
            ? null
            : (json['quantity'] as num).toDouble(),
        averagePrice: json['averagePrice'] == null
            ? null
            : (json['averagePrice'] as num).toDouble(),
        inFridge: json['inFridge'] == null ? null : json['inFridge'] as bool,
        targetPrice: json['targetPrice'] == null
            ? null
            : (json['targetPrice'] as num).toDouble(),
      );

  final String? ticker;
  final AssetType? assetType;
  final double? quantity;
  final double? averagePrice;
  final bool? inFridge;
  final double? targetPrice;

  Map<String, dynamic> toJson() => {
    if (ticker != null) 'ticker': ticker,
    if (assetType != null) 'assetType': assetType?.toJson(),
    if (quantity != null) 'quantity': quantity,
    if (averagePrice != null) 'averagePrice': averagePrice,
    if (inFridge != null) 'inFridge': inFridge,
    if (targetPrice != null) 'targetPrice': targetPrice,
  };
}

class MoveToFridgeRequest {
  const MoveToFridgeRequest({
    required this.fridgeId,
    required this.targetPrice,
  });

  factory MoveToFridgeRequest.fromJson(Map<String, dynamic> json) =>
      MoveToFridgeRequest(
        fridgeId: json['fridgeId'] as String,
        targetPrice: (json['targetPrice'] as num).toDouble(),
      );

  final String fridgeId;
  final double targetPrice;

  Map<String, dynamic> toJson() => {
    'fridgeId': fridgeId,
    'targetPrice': targetPrice,
  };
}

class CreateFridgeRequest {
  const CreateFridgeRequest({required this.name, this.description});

  factory CreateFridgeRequest.fromJson(Map<String, dynamic> json) =>
      CreateFridgeRequest(
        name: json['name'] as String,
        description: json['description'] == null
            ? null
            : json['description'] as String,
      );

  final String name;
  final String? description;

  Map<String, dynamic> toJson() => {
    'name': name,
    if (description != null) 'description': description,
  };
}

class UpdateFridgeRequest {
  const UpdateFridgeRequest({this.name, this.description});

  factory UpdateFridgeRequest.fromJson(Map<String, dynamic> json) =>
      UpdateFridgeRequest(
        name: json['name'] == null ? null : json['name'] as String,
        description: json['description'] == null
            ? null
            : json['description'] as String,
      );

  final String? name;
  final String? description;

  Map<String, dynamic> toJson() => {
    if (name != null) 'name': name,
    if (description != null) 'description': description,
  };
}

class CreateFridgeItemRequest {
  const CreateFridgeItemRequest({
    required this.ticker,
    required this.quantity,
    required this.transferredPrice,
    required this.targetPrice,
  });

  factory CreateFridgeItemRequest.fromJson(Map<String, dynamic> json) =>
      CreateFridgeItemRequest(
        ticker: json['ticker'] as String,
        quantity: (json['quantity'] as num).toDouble(),
        transferredPrice: (json['transferredPrice'] as num).toDouble(),
        targetPrice: (json['targetPrice'] as num).toDouble(),
      );

  final String ticker;
  final double quantity;
  final double transferredPrice;
  final double targetPrice;

  Map<String, dynamic> toJson() => {
    'ticker': ticker,
    'quantity': quantity,
    'transferredPrice': transferredPrice,
    'targetPrice': targetPrice,
  };
}

class UpdateFridgeItemRequest {
  const UpdateFridgeItemRequest({
    this.ticker,
    this.quantity,
    this.transferredPrice,
    this.targetPrice,
  });

  factory UpdateFridgeItemRequest.fromJson(Map<String, dynamic> json) =>
      UpdateFridgeItemRequest(
        ticker: json['ticker'] == null ? null : json['ticker'] as String,
        quantity: json['quantity'] == null
            ? null
            : (json['quantity'] as num).toDouble(),
        transferredPrice: json['transferredPrice'] == null
            ? null
            : (json['transferredPrice'] as num).toDouble(),
        targetPrice: json['targetPrice'] == null
            ? null
            : (json['targetPrice'] as num).toDouble(),
      );

  final String? ticker;
  final double? quantity;
  final double? transferredPrice;
  final double? targetPrice;

  Map<String, dynamic> toJson() => {
    if (ticker != null) 'ticker': ticker,
    if (quantity != null) 'quantity': quantity,
    if (transferredPrice != null) 'transferredPrice': transferredPrice,
    if (targetPrice != null) 'targetPrice': targetPrice,
  };
}

class UnfreezeItemRequest {
  const UnfreezeItemRequest({required this.walletId});

  factory UnfreezeItemRequest.fromJson(Map<String, dynamic> json) =>
      UnfreezeItemRequest(walletId: json['walletId'] as String);

  final String walletId;

  Map<String, dynamic> toJson() => {'walletId': walletId};
}

class ApplySuggestionItemRequest {
  const ApplySuggestionItemRequest({
    required this.ticker,
    this.fallbackFor,
    required this.quantity,
    required this.price,
  });

  factory ApplySuggestionItemRequest.fromJson(Map<String, dynamic> json) =>
      ApplySuggestionItemRequest(
        ticker: json['ticker'] as String,
        fallbackFor: json['fallbackFor'] == null
            ? null
            : json['fallbackFor'] as String,
        quantity: (json['quantity'] as num).toDouble(),
        price: (json['price'] as num).toDouble(),
      );

  final String ticker;
  final String? fallbackFor;
  final double quantity;
  final double price;

  Map<String, dynamic> toJson() => {
    'ticker': ticker,
    if (fallbackFor != null) 'fallbackFor': fallbackFor,
    'quantity': quantity,
    'price': price,
  };
}

/// Payload para criação/edição de um provento.
class DividendCreateRequest {
  const DividendCreateRequest({
    required this.ticker,
    this.assetType,
    required this.amountPerShare,
    required this.quantity,
    required this.paymentDate,
  });

  factory DividendCreateRequest.fromJson(Map<String, dynamic> json) =>
      DividendCreateRequest(
        ticker: json['ticker'] as String,
        assetType: json['assetType'] == null
            ? null
            : AssetType.fromJson(json['assetType'] as String),
        amountPerShare: (json['amountPerShare'] as num).toDouble(),
        quantity: (json['quantity'] as num).toDouble(),
        paymentDate: json['paymentDate'] as String,
      );

  final String ticker;
  final AssetType? assetType;
  final double amountPerShare;
  final double quantity;
  final String paymentDate;

  Map<String, dynamic> toJson() => {
    'ticker': ticker,
    if (assetType != null) 'assetType': assetType?.toJson(),
    'amountPerShare': amountPerShare,
    'quantity': quantity,
    'paymentDate': paymentDate,
  };
}

/// Representação de um provento já persistido.
class DividendResponse {
  const DividendResponse({
    required this.ticker,
    this.assetType,
    required this.amountPerShare,
    required this.quantity,
    required this.paymentDate,
    required this.id,
    required this.userId,
    required this.totalAmount,
    required this.createdAt,
    required this.updatedAt,
  });

  factory DividendResponse.fromJson(Map<String, dynamic> json) =>
      DividendResponse(
        ticker: json['ticker'] as String,
        assetType: json['assetType'] == null
            ? null
            : AssetType.fromJson(json['assetType'] as String),
        amountPerShare: (json['amountPerShare'] as num).toDouble(),
        quantity: (json['quantity'] as num).toDouble(),
        paymentDate: json['paymentDate'] as String,
        id: json['id'] as String,
        userId: json['userId'] as String,
        totalAmount: (json['totalAmount'] as num).toDouble(),
        createdAt: json['createdAt'] as String,
        updatedAt: json['updatedAt'] as String,
      );

  final String ticker;
  final AssetType? assetType;
  final double amountPerShare;
  final double quantity;
  final String paymentDate;
  final String id;
  final String userId;
  final double totalAmount;
  final String createdAt;
  final String updatedAt;

  Map<String, dynamic> toJson() => {
    'ticker': ticker,
    if (assetType != null) 'assetType': assetType?.toJson(),
    'amountPerShare': amountPerShare,
    'quantity': quantity,
    'paymentDate': paymentDate,
    'id': id,
    'userId': userId,
    'totalAmount': totalAmount,
    'createdAt': createdAt,
    'updatedAt': updatedAt,
  };
}

/// Projeção de renda de um ativo, pelo último provento informado (#290).
class MonthlyIncomeItem {
  const MonthlyIncomeItem({
    required this.ticker,
    required this.quantity,
    required this.monthlyDividend,
    required this.monthlyIncome,
    this.paymentDate,
  });

  factory MonthlyIncomeItem.fromJson(Map<String, dynamic> json) =>
      MonthlyIncomeItem(
        ticker: json['ticker'] as String,
        quantity: (json['quantity'] as num).toDouble(),
        monthlyDividend: (json['monthlyDividend'] as num).toDouble(),
        monthlyIncome: (json['monthlyIncome'] as num).toDouble(),
        paymentDate: json['paymentDate'] == null
            ? null
            : json['paymentDate'] as String,
      );

  final String ticker;
  final double quantity;
  final double monthlyDividend;
  final double monthlyIncome;
  final String? paymentDate;

  Map<String, dynamic> toJson() => {
    'ticker': ticker,
    'quantity': quantity,
    'monthlyDividend': monthlyDividend,
    'monthlyIncome': monthlyIncome,
    if (paymentDate != null) 'paymentDate': paymentDate,
  };
}

/// Totais da agenda, sobre todos os ativos da carteira.
class ScheduleTotals {
  const ScheduleTotals({required this.upcomingTotal, required this.paidTotal});

  factory ScheduleTotals.fromJson(Map<String, dynamic> json) => ScheduleTotals(
    upcomingTotal: (json['upcomingTotal'] as num).toDouble(),
    paidTotal: (json['paidTotal'] as num).toDouble(),
  );

  final double upcomingTotal;
  final double paidTotal;

  Map<String, dynamic> toJson() => {
    'upcomingTotal': upcomingTotal,
    'paidTotal': paidTotal,
  };
}

class MonthlyIncomeResponse {
  const MonthlyIncomeResponse({
    required this.byTicker,
    required this.total,
    required this.totalFromFridge,
    this.limited,
    this.scheduleItems,
    this.scheduleTotals,
    this.hiddenTickers,
    this.hiddenPaymentDates,
    this.hiddenScheduleTickers,
  });

  factory MonthlyIncomeResponse.fromJson(Map<String, dynamic> json) =>
      MonthlyIncomeResponse(
        byTicker: (json['byTicker'] as List<dynamic>)
            .map((e) => MonthlyIncomeItem.fromJson(e as Map<String, dynamic>))
            .toList(),
        total: (json['total'] as num).toDouble(),
        totalFromFridge: (json['totalFromFridge'] as num).toDouble(),
        limited: json['limited'] == null ? null : json['limited'] as bool,
        scheduleItems: json['scheduleItems'] == null
            ? null
            : (json['scheduleItems'] as List<dynamic>)
                  .map(
                    (e) =>
                        MonthlyIncomeItem.fromJson(e as Map<String, dynamic>),
                  )
                  .toList(),
        scheduleTotals: json['scheduleTotals'] == null
            ? null
            : ScheduleTotals.fromJson(
                json['scheduleTotals'] as Map<String, dynamic>,
              ),
        hiddenTickers: json['hiddenTickers'] == null
            ? null
            : (json['hiddenTickers'] as List<dynamic>)
                  .map((e) => e as String)
                  .toList(),
        hiddenPaymentDates: json['hiddenPaymentDates'] == null
            ? null
            : (json['hiddenPaymentDates'] as List<dynamic>)
                  .map((e) => e as String)
                  .toList(),
        hiddenScheduleTickers: json['hiddenScheduleTickers'] == null
            ? null
            : (json['hiddenScheduleTickers'] as List<dynamic>)
                  .map((e) => e as String)
                  .toList(),
      );

  final List<MonthlyIncomeItem> byTicker;
  final double total;
  final double totalFromFridge;

  /// Recorte gratuito aplicado pela API (#262).
  final bool? limited;

  /// Ativos das datas de pagamento liberadas; ausente sem recorte.
  final List<MonthlyIncomeItem>? scheduleItems;
  final ScheduleTotals? scheduleTotals;

  /// Tickers omitidos em `byTicker` pelo recorte gratuito.
  final List<String>? hiddenTickers;

  /// Datas de pagamento omitidas na agenda pelo recorte gratuito.
  final List<String>? hiddenPaymentDates;

  /// Tickers sem data anunciada omitidos da agenda pelo recorte.
  final List<String>? hiddenScheduleTickers;

  Map<String, dynamic> toJson() => {
    'byTicker': byTicker.map((e) => e.toJson()).toList(),
    'total': total,
    'totalFromFridge': totalFromFridge,
    if (limited != null) 'limited': limited,
    if (scheduleItems != null)
      'scheduleItems': scheduleItems?.map((e) => e.toJson()).toList(),
    if (scheduleTotals != null) 'scheduleTotals': scheduleTotals?.toJson(),
    if (hiddenTickers != null) 'hiddenTickers': hiddenTickers,
    if (hiddenPaymentDates != null) 'hiddenPaymentDates': hiddenPaymentDates,
    if (hiddenScheduleTickers != null)
      'hiddenScheduleTickers': hiddenScheduleTickers,
  };
}

class TickerDividendYield {
  const TickerDividendYield({
    required this.ticker,
    required this.annualIncome,
    required this.currentValue,
    required this.yield,
  });

  factory TickerDividendYield.fromJson(Map<String, dynamic> json) =>
      TickerDividendYield(
        ticker: json['ticker'] as String,
        annualIncome: (json['annualIncome'] as num).toDouble(),
        currentValue: (json['currentValue'] as num).toDouble(),
        yield: (json['yield'] as num).toDouble(),
      );

  final String ticker;
  final double annualIncome;
  final double currentValue;
  final double yield;

  Map<String, dynamic> toJson() => {
    'ticker': ticker,
    'annualIncome': annualIncome,
    'currentValue': currentValue,
    'yield': yield,
  };
}

class DividendYieldTotal {
  const DividendYieldTotal({
    required this.annualIncome,
    required this.currentValue,
    required this.yield,
  });

  factory DividendYieldTotal.fromJson(Map<String, dynamic> json) =>
      DividendYieldTotal(
        annualIncome: (json['annualIncome'] as num).toDouble(),
        currentValue: (json['currentValue'] as num).toDouble(),
        yield: (json['yield'] as num).toDouble(),
      );

  final double annualIncome;
  final double currentValue;
  final double yield;

  Map<String, dynamic> toJson() => {
    'annualIncome': annualIncome,
    'currentValue': currentValue,
    'yield': yield,
  };
}

class DividendYieldResponse {
  const DividendYieldResponse({required this.byTicker, required this.total});

  factory DividendYieldResponse.fromJson(Map<String, dynamic> json) =>
      DividendYieldResponse(
        byTicker: (json['byTicker'] as List<dynamic>)
            .map((e) => TickerDividendYield.fromJson(e as Map<String, dynamic>))
            .toList(),
        total: DividendYieldTotal.fromJson(
          json['total'] as Map<String, dynamic>,
        ),
      );

  final List<TickerDividendYield> byTicker;
  final DividendYieldTotal total;

  Map<String, dynamic> toJson() => {
    'byTicker': byTicker.map((e) => e.toJson()).toList(),
    'total': total.toJson(),
  };
}

class TickerTotal {
  const TickerTotal({required this.ticker, required this.total});

  factory TickerTotal.fromJson(Map<String, dynamic> json) => TickerTotal(
    ticker: json['ticker'] as String,
    total: (json['total'] as num).toDouble(),
  );

  final String ticker;
  final double total;

  Map<String, dynamic> toJson() => {'ticker': ticker, 'total': total};
}

class MonthlyDividendReportMonth {
  const MonthlyDividendReportMonth({
    required this.month,
    required this.total,
    required this.byTicker,
  });

  factory MonthlyDividendReportMonth.fromJson(Map<String, dynamic> json) =>
      MonthlyDividendReportMonth(
        month: json['month'] as String,
        total: (json['total'] as num).toDouble(),
        byTicker: (json['byTicker'] as List<dynamic>)
            .map((e) => TickerTotal.fromJson(e as Map<String, dynamic>))
            .toList(),
      );

  final String month;
  final double total;
  final List<TickerTotal> byTicker;

  Map<String, dynamic> toJson() => {
    'month': month,
    'total': total,
    'byTicker': byTicker.map((e) => e.toJson()).toList(),
  };
}

class MonthlyDividendReport {
  const MonthlyDividendReport({
    required this.year,
    required this.months,
    required this.byTicker,
    required this.total,
    required this.availableYears,
  });

  factory MonthlyDividendReport.fromJson(Map<String, dynamic> json) =>
      MonthlyDividendReport(
        year: (json['year'] as num).toInt(),
        months: (json['months'] as List<dynamic>)
            .map(
              (e) => MonthlyDividendReportMonth.fromJson(
                e as Map<String, dynamic>,
              ),
            )
            .toList(),
        byTicker: (json['byTicker'] as List<dynamic>)
            .map((e) => TickerTotal.fromJson(e as Map<String, dynamic>))
            .toList(),
        total: (json['total'] as num).toDouble(),
        availableYears: (json['availableYears'] as List<dynamic>)
            .map((e) => (e as num).toInt())
            .toList(),
      );

  final int year;
  final List<MonthlyDividendReportMonth> months;
  final List<TickerTotal> byTicker;
  final double total;
  final List<int> availableYears;

  Map<String, dynamic> toJson() => {
    'year': year,
    'months': months.map((e) => e.toJson()).toList(),
    'byTicker': byTicker.map((e) => e.toJson()).toList(),
    'total': total,
    'availableYears': availableYears,
  };
}

/// Provento mensal de um ticker; `date` é `YYYY-MM`.
class DividendHistoryEntry {
  const DividendHistoryEntry({
    required this.date,
    required this.monthlyDividend,
  });

  factory DividendHistoryEntry.fromJson(Map<String, dynamic> json) =>
      DividendHistoryEntry(
        date: json['date'] as String,
        monthlyDividend: (json['monthlyDividend'] as num).toDouble(),
      );

  final String date;
  final double monthlyDividend;

  Map<String, dynamic> toJson() => {
    'date': date,
    'monthlyDividend': monthlyDividend,
  };
}

class DividendHistoryResponse {
  const DividendHistoryResponse({required this.ticker, required this.history});

  factory DividendHistoryResponse.fromJson(Map<String, dynamic> json) =>
      DividendHistoryResponse(
        ticker: json['ticker'] as String,
        history: (json['history'] as List<dynamic>)
            .map(
              (e) => DividendHistoryEntry.fromJson(e as Map<String, dynamic>),
            )
            .toList(),
      );

  final String ticker;
  final List<DividendHistoryEntry> history;

  Map<String, dynamic> toJson() => {
    'ticker': ticker,
    'history': history.map((e) => e.toJson()).toList(),
  };
}

class DividendHistoryBatchResponse {
  const DividendHistoryBatchResponse({required this.byTicker});

  factory DividendHistoryBatchResponse.fromJson(Map<String, dynamic> json) =>
      DividendHistoryBatchResponse(
        byTicker: (json['byTicker'] as Map<String, dynamic>).map(
          (k, v) => MapEntry(
            k,
            (v as List<dynamic>)
                .map(
                  (e) =>
                      DividendHistoryEntry.fromJson(e as Map<String, dynamic>),
                )
                .toList(),
          ),
        ),
      );

  final Map<String, List<DividendHistoryEntry>> byTicker;

  Map<String, dynamic> toJson() => {
    'byTicker': byTicker.map(
      (k, v) => MapEntry(k, v.map((e) => e.toJson()).toList()),
    ),
  };
}

/// Valor consolidado de um ticker, para a composição da carteira.
class TickerValue {
  const TickerValue({required this.ticker, required this.value});

  factory TickerValue.fromJson(Map<String, dynamic> json) => TickerValue(
    ticker: json['ticker'] as String,
    value: (json['value'] as num).toDouble(),
  );

  final String ticker;
  final double value;

  Map<String, dynamic> toJson() => {'ticker': ticker, 'value': value};
}

/// Resumo do dashboard (#300). Antes a tela montava esses números com uma
/// requisição por carteira e uma por geladeira, e reaplicava regra de
/// negócio no cliente.
class DashboardSummaryResponse {
  const DashboardSummaryResponse({
    required this.totalWallet,
    required this.totalFridge,
    required this.total,
    required this.monthlyIncomeTotal,
    required this.composition,
  });

  factory DashboardSummaryResponse.fromJson(Map<String, dynamic> json) =>
      DashboardSummaryResponse(
        totalWallet: (json['totalWallet'] as num).toDouble(),
        totalFridge: (json['totalFridge'] as num).toDouble(),
        total: (json['total'] as num).toDouble(),
        monthlyIncomeTotal: (json['monthlyIncomeTotal'] as num).toDouble(),
        composition: (json['composition'] as List<dynamic>)
            .map((e) => TickerValue.fromJson(e as Map<String, dynamic>))
            .toList(),
      );

  final double totalWallet;
  final double totalFridge;
  final double total;

  /// Renda mensal projetada, com a geladeira contada uma única vez.
  final double monthlyIncomeTotal;

  /// Composição consolidada por ticker, em ordem decrescente de valor.
  final List<TickerValue> composition;

  Map<String, dynamic> toJson() => {
    'totalWallet': totalWallet,
    'totalFridge': totalFridge,
    'total': total,
    'monthlyIncomeTotal': monthlyIncomeTotal,
    'composition': composition.map((e) => e.toJson()).toList(),
  };
}

/// Data do snapshot; o padrão é hoje.
class PatrimonySnapshotRequest {
  const PatrimonySnapshotRequest({this.date});

  factory PatrimonySnapshotRequest.fromJson(Map<String, dynamic> json) =>
      PatrimonySnapshotRequest(
        date: json['date'] == null ? null : json['date'] as String,
      );

  final String? date;

  Map<String, dynamic> toJson() => {if (date != null) 'date': date};
}

/// Proventos reinvestidos em novas cotas ou sacados.
enum SimulationMode {
  reinvest('reinvest'),
  withdraw('withdraw');

  const SimulationMode(this.wire);

  /// Valor como a API o transmite.
  final String wire;

  factory SimulationMode.fromJson(String valor) =>
      SimulationMode.values.firstWhere(
        (e) => e.wire == valor,
        orElse: () =>
            throw ArgumentError('SimulationMode desconhecido: $valor'),
      );

  String toJson() => wire;
}

/// Premissa da projeção, explícita no resultado: parte do último provento
/// real e assume que ele se repete. Não vale para pagador trimestral nem
/// para FII de provento variável, e a tela precisa dizer isso.
class SimulationBasis {
  const SimulationBasis({
    required this.source,
    required this.assumesRepetition,
    required this.staleAfterDays,
  });

  factory SimulationBasis.fromJson(Map<String, dynamic> json) =>
      SimulationBasis(
        source: json['source'] as String,
        assumesRepetition: json['assumesRepetition'] as bool,
        staleAfterDays: (json['staleAfterDays'] as num).toInt(),
      );

  final String source;
  final bool assumesRepetition;
  final int staleAfterDays;

  Map<String, dynamic> toJson() => {
    'source': source,
    'assumesRepetition': assumesRepetition,
    'staleAfterDays': staleAfterDays,
  };
}

class SimulationItem {
  const SimulationItem({
    required this.ticker,
    required this.price,
    required this.monthlyDividend,
    required this.quantity,
    required this.finalQuantity,
    required this.investedAmount,
    required this.monthlyIncome,
    required this.totalIncome,
    this.missingPrice,
    this.missingDividend,
    this.staleDividend,
  });

  factory SimulationItem.fromJson(Map<String, dynamic> json) => SimulationItem(
    ticker: json['ticker'] as String,
    price: (json['price'] as num).toDouble(),
    monthlyDividend: (json['monthlyDividend'] as num).toDouble(),
    quantity: (json['quantity'] as num).toDouble(),
    finalQuantity: (json['finalQuantity'] as num).toDouble(),
    investedAmount: (json['investedAmount'] as num).toDouble(),
    monthlyIncome: (json['monthlyIncome'] as num).toDouble(),
    totalIncome: (json['totalIncome'] as num).toDouble(),
    missingPrice: json['missingPrice'] == null
        ? null
        : json['missingPrice'] as bool,
    missingDividend: json['missingDividend'] == null
        ? null
        : json['missingDividend'] as bool,
    staleDividend: json['staleDividend'] == null
        ? null
        : json['staleDividend'] as bool,
  );

  final String ticker;
  final double price;
  final double monthlyDividend;

  /// Cotas compradas com o aporte inicial.
  final double quantity;

  /// Cotas ao fim do horizonte; difere de `quantity` no reinvestimento.
  final double finalQuantity;
  final double investedAmount;
  final double monthlyIncome;
  final double totalIncome;

  /// Sem cotação utilizável: ficou fora da alocação.
  final bool? missingPrice;

  /// Sem último provento real conhecido: entrou com renda zero, declarada.
  final bool? missingDividend;

  /// Último provento real além de `basis.staleAfterDays`.
  final bool? staleDividend;

  Map<String, dynamic> toJson() => {
    'ticker': ticker,
    'price': price,
    'monthlyDividend': monthlyDividend,
    'quantity': quantity,
    'finalQuantity': finalQuantity,
    'investedAmount': investedAmount,
    'monthlyIncome': monthlyIncome,
    'totalIncome': totalIncome,
    if (missingPrice != null) 'missingPrice': missingPrice,
    if (missingDividend != null) 'missingDividend': missingDividend,
    if (staleDividend != null) 'staleDividend': staleDividend,
  };
}

class SimulationResult {
  const SimulationResult({
    required this.amount,
    required this.months,
    required this.mode,
    required this.allocatedAmount,
    required this.unallocatedAmount,
    required this.monthlyIncome,
    required this.totalIncome,
    required this.reinvestedAmount,
    required this.uninvestedIncome,
    required this.byTicker,
    required this.missingDividendTickers,
    required this.staleDividendTickers,
    required this.basis,
  });

  factory SimulationResult.fromJson(Map<String, dynamic> json) =>
      SimulationResult(
        amount: (json['amount'] as num).toDouble(),
        months: (json['months'] as num).toInt(),
        mode: SimulationMode.fromJson(json['mode'] as String),
        allocatedAmount: (json['allocatedAmount'] as num).toDouble(),
        unallocatedAmount: (json['unallocatedAmount'] as num).toDouble(),
        monthlyIncome: (json['monthlyIncome'] as num).toDouble(),
        totalIncome: (json['totalIncome'] as num).toDouble(),
        reinvestedAmount: (json['reinvestedAmount'] as num).toDouble(),
        uninvestedIncome: (json['uninvestedIncome'] as num).toDouble(),
        byTicker: (json['byTicker'] as List<dynamic>)
            .map((e) => SimulationItem.fromJson(e as Map<String, dynamic>))
            .toList(),
        missingDividendTickers:
            (json['missingDividendTickers'] as List<dynamic>)
                .map((e) => e as String)
                .toList(),
        staleDividendTickers: (json['staleDividendTickers'] as List<dynamic>)
            .map((e) => e as String)
            .toList(),
        basis: SimulationBasis.fromJson(json['basis'] as Map<String, dynamic>),
      );

  final double amount;
  final int months;
  final SimulationMode mode;
  final double allocatedAmount;

  /// Troco do aporte: não comprou cota inteira e não rende.
  final double unallocatedAmount;
  final double monthlyIncome;
  final double totalIncome;
  final double reinvestedAmount;
  final double uninvestedIncome;
  final List<SimulationItem> byTicker;
  final List<String> missingDividendTickers;
  final List<String> staleDividendTickers;
  final SimulationBasis basis;

  Map<String, dynamic> toJson() => {
    'amount': amount,
    'months': months,
    'mode': mode.toJson(),
    'allocatedAmount': allocatedAmount,
    'unallocatedAmount': unallocatedAmount,
    'monthlyIncome': monthlyIncome,
    'totalIncome': totalIncome,
    'reinvestedAmount': reinvestedAmount,
    'uninvestedIncome': uninvestedIncome,
    'byTicker': byTicker.map((e) => e.toJson()).toList(),
    'missingDividendTickers': missingDividendTickers,
    'staleDividendTickers': staleDividendTickers,
    'basis': basis.toJson(),
  };
}

/// Provedor de carteira sugerida e os meses que ele tem publicados.
class SimulationWalletOption {
  const SimulationWalletOption({
    required this.slug,
    required this.label,
    required this.provider,
    required this.months,
  });

  factory SimulationWalletOption.fromJson(
    Map<String, dynamic> json,
  ) => SimulationWalletOption(
    slug: json['slug'] as String,
    label: json['label'] as String,
    provider: RecommendedWalletProvider.fromJson(json['provider'] as String),
    months: (json['months'] as List<dynamic>).map((e) => e as String).toList(),
  );

  final String slug;
  final String label;
  final RecommendedWalletProvider provider;
  final List<String> months;

  Map<String, dynamic> toJson() => {
    'slug': slug,
    'label': label,
    'provider': provider.toJson(),
    'months': months,
  };
}

/// O provedor no resultado, sem a lista de meses.
class SimulationWalletProvider {
  const SimulationWalletProvider({
    required this.slug,
    required this.label,
    required this.provider,
  });

  factory SimulationWalletProvider.fromJson(Map<String, dynamic> json) =>
      SimulationWalletProvider(
        slug: json['slug'] as String,
        label: json['label'] as String,
        provider: RecommendedWalletProvider.fromJson(
          json['provider'] as String,
        ),
      );

  final String slug;
  final String label;
  final RecommendedWalletProvider provider;

  Map<String, dynamic> toJson() => {
    'slug': slug,
    'label': label,
    'provider': provider.toJson(),
  };
}

class WalletSimulationRequest {
  const WalletSimulationRequest({
    required this.amount,
    required this.months,
    this.mode,
    this.provider,
    this.month,
    this.tab,
  });

  factory WalletSimulationRequest.fromJson(Map<String, dynamic> json) =>
      WalletSimulationRequest(
        amount: json['amount'],
        months: (json['months'] as num).toInt(),
        mode: json['mode'] == null
            ? null
            : SimulationMode.fromJson(json['mode'] as String),
        provider: json['provider'] == null ? null : json['provider'] as String,
        month: json['month'] == null ? null : json['month'] as String,
        tab: json['tab'] == null
            ? null
            : AiSuggestionTab.fromJson(json['tab'] as String),
      );

  /// Número ou texto em pt-BR (`1.500,55`); a API converte.
  final Object amount;
  final int months;
  final SimulationMode? mode;

  /// Provedor da carteira sugerida; o padrão é o primeiro do catálogo.
  final String? provider;

  /// Mês da carteira; o padrão é a mais recente do provedor.
  final String? month;
  final AiSuggestionTab? tab;

  Map<String, dynamic> toJson() => {
    'amount': amount,
    'months': months,
    if (mode != null) 'mode': mode?.toJson(),
    if (provider != null) 'provider': provider,
    if (month != null) 'month': month,
    if (tab != null) 'tab': tab?.toJson(),
  };
}

class AssetSimulationRequest {
  const AssetSimulationRequest({
    required this.ticker,
    required this.amount,
    required this.months,
    this.mode,
  });

  factory AssetSimulationRequest.fromJson(Map<String, dynamic> json) =>
      AssetSimulationRequest(
        ticker: json['ticker'] as String,
        amount: json['amount'],
        months: (json['months'] as num).toInt(),
        mode: json['mode'] == null
            ? null
            : SimulationMode.fromJson(json['mode'] as String),
      );

  final String ticker;

  /// Número ou texto em pt-BR (`1.500,55`); a API converte.
  final Object amount;
  final int months;
  final SimulationMode? mode;

  Map<String, dynamic> toJson() => {
    'ticker': ticker,
    'amount': amount,
    'months': months,
    if (mode != null) 'mode': mode?.toJson(),
  };
}

/// Recurso de assinante (`projections`).
class AssetSimulationResponse {
  const AssetSimulationResponse({
    required this.amount,
    required this.months,
    required this.mode,
    required this.allocatedAmount,
    required this.unallocatedAmount,
    required this.monthlyIncome,
    required this.totalIncome,
    required this.reinvestedAmount,
    required this.uninvestedIncome,
    required this.byTicker,
    required this.missingDividendTickers,
    required this.staleDividendTickers,
    required this.basis,
    required this.ticker,
  });

  factory AssetSimulationResponse.fromJson(Map<String, dynamic> json) =>
      AssetSimulationResponse(
        amount: (json['amount'] as num).toDouble(),
        months: (json['months'] as num).toInt(),
        mode: SimulationMode.fromJson(json['mode'] as String),
        allocatedAmount: (json['allocatedAmount'] as num).toDouble(),
        unallocatedAmount: (json['unallocatedAmount'] as num).toDouble(),
        monthlyIncome: (json['monthlyIncome'] as num).toDouble(),
        totalIncome: (json['totalIncome'] as num).toDouble(),
        reinvestedAmount: (json['reinvestedAmount'] as num).toDouble(),
        uninvestedIncome: (json['uninvestedIncome'] as num).toDouble(),
        byTicker: (json['byTicker'] as List<dynamic>)
            .map((e) => SimulationItem.fromJson(e as Map<String, dynamic>))
            .toList(),
        missingDividendTickers:
            (json['missingDividendTickers'] as List<dynamic>)
                .map((e) => e as String)
                .toList(),
        staleDividendTickers: (json['staleDividendTickers'] as List<dynamic>)
            .map((e) => e as String)
            .toList(),
        basis: SimulationBasis.fromJson(json['basis'] as Map<String, dynamic>),
        ticker: json['ticker'] as String,
      );

  final double amount;
  final int months;
  final SimulationMode mode;
  final double allocatedAmount;

  /// Troco do aporte: não comprou cota inteira e não rende.
  final double unallocatedAmount;
  final double monthlyIncome;
  final double totalIncome;
  final double reinvestedAmount;
  final double uninvestedIncome;
  final List<SimulationItem> byTicker;
  final List<String> missingDividendTickers;
  final List<String> staleDividendTickers;
  final SimulationBasis basis;
  final String ticker;

  Map<String, dynamic> toJson() => {
    'amount': amount,
    'months': months,
    'mode': mode.toJson(),
    'allocatedAmount': allocatedAmount,
    'unallocatedAmount': unallocatedAmount,
    'monthlyIncome': monthlyIncome,
    'totalIncome': totalIncome,
    'reinvestedAmount': reinvestedAmount,
    'uninvestedIncome': uninvestedIncome,
    'byTicker': byTicker.map((e) => e.toJson()).toList(),
    'missingDividendTickers': missingDividendTickers,
    'staleDividendTickers': staleDividendTickers,
    'basis': basis.toJson(),
    'ticker': ticker,
  };
}

class WalletSimulationResponse {
  const WalletSimulationResponse({
    required this.amount,
    required this.months,
    required this.mode,
    required this.allocatedAmount,
    required this.unallocatedAmount,
    required this.monthlyIncome,
    required this.totalIncome,
    required this.reinvestedAmount,
    required this.uninvestedIncome,
    required this.byTicker,
    required this.missingDividendTickers,
    required this.staleDividendTickers,
    required this.basis,
    required this.provider,
    required this.walletMonth,
    required this.tab,
  });

  factory WalletSimulationResponse.fromJson(Map<String, dynamic> json) =>
      WalletSimulationResponse(
        amount: (json['amount'] as num).toDouble(),
        months: (json['months'] as num).toInt(),
        mode: SimulationMode.fromJson(json['mode'] as String),
        allocatedAmount: (json['allocatedAmount'] as num).toDouble(),
        unallocatedAmount: (json['unallocatedAmount'] as num).toDouble(),
        monthlyIncome: (json['monthlyIncome'] as num).toDouble(),
        totalIncome: (json['totalIncome'] as num).toDouble(),
        reinvestedAmount: (json['reinvestedAmount'] as num).toDouble(),
        uninvestedIncome: (json['uninvestedIncome'] as num).toDouble(),
        byTicker: (json['byTicker'] as List<dynamic>)
            .map((e) => SimulationItem.fromJson(e as Map<String, dynamic>))
            .toList(),
        missingDividendTickers:
            (json['missingDividendTickers'] as List<dynamic>)
                .map((e) => e as String)
                .toList(),
        staleDividendTickers: (json['staleDividendTickers'] as List<dynamic>)
            .map((e) => e as String)
            .toList(),
        basis: SimulationBasis.fromJson(json['basis'] as Map<String, dynamic>),
        provider: SimulationWalletProvider.fromJson(
          json['provider'] as Map<String, dynamic>,
        ),
        walletMonth: json['walletMonth'] as String,
        tab: AiSuggestionTab.fromJson(json['tab'] as String),
      );

  final double amount;
  final int months;
  final SimulationMode mode;
  final double allocatedAmount;

  /// Troco do aporte: não comprou cota inteira e não rende.
  final double unallocatedAmount;
  final double monthlyIncome;
  final double totalIncome;
  final double reinvestedAmount;
  final double uninvestedIncome;
  final List<SimulationItem> byTicker;
  final List<String> missingDividendTickers;
  final List<String> staleDividendTickers;
  final SimulationBasis basis;
  final SimulationWalletProvider provider;
  final String walletMonth;
  final AiSuggestionTab tab;

  Map<String, dynamic> toJson() => {
    'amount': amount,
    'months': months,
    'mode': mode.toJson(),
    'allocatedAmount': allocatedAmount,
    'unallocatedAmount': unallocatedAmount,
    'monthlyIncome': monthlyIncome,
    'totalIncome': totalIncome,
    'reinvestedAmount': reinvestedAmount,
    'uninvestedIncome': uninvestedIncome,
    'byTicker': byTicker.map((e) => e.toJson()).toList(),
    'missingDividendTickers': missingDividendTickers,
    'staleDividendTickers': staleDividendTickers,
    'basis': basis.toJson(),
    'provider': provider.toJson(),
    'walletMonth': walletMonth,
    'tab': tab.toJson(),
  };
}
