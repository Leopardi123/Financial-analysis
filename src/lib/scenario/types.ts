export type ScenarioKey = 'SPOT' | 'LOW' | 'HIGH';

export type PriceScenarioSet = {
  SPOT: Record<string, (number | null)[]>;
  LOW: Record<string, (number | null)[]>;
  HIGH: Record<string, (number | null)[]>;
};
