import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import type {
  AssetSimulationRequest,
  AssetSimulationResponse,
  SimulationWalletOption,
  WalletSimulationRequest,
  WalletSimulationResponse,
} from 'dindin-shared-types';

/**
 * Simulação de proventos (issue #396).
 *
 * O valor vai como texto: o campo é monetário brasileiro e a conversão de
 * `1.500,55` fica na API, junto da validação — assim a regra do que é um
 * aporte válido não existe em duas versões.
 */
@Injectable({ providedIn: 'root' })
export class SimulationService {
  private readonly http = inject(HttpClient);

  listWallets(): Observable<SimulationWalletOption[]> {
    return this.http.get<SimulationWalletOption[]>('/api/simulations/wallets');
  }

  simulateWallet(
    body: WalletSimulationRequest,
  ): Observable<WalletSimulationResponse> {
    return this.http.post<WalletSimulationResponse>(
      '/api/simulations/wallet',
      body,
    );
  }

  /** Recurso de assinante: a API responde 403 SUBSCRIPTION_REQUIRED (#397). */
  simulateAsset(
    body: AssetSimulationRequest,
  ): Observable<AssetSimulationResponse> {
    return this.http.post<AssetSimulationResponse>(
      '/api/simulations/asset',
      body,
    );
  }
}
