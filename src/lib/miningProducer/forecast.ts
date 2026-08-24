import type {
  CostDisclosure,
  CostModel,
  ForecastCostRule,
  ForecastProductionRule,
  NumericClaim,
  ProducerJsonV1,
  ProducerProject,
  ProductionDisclosure,
} from './types.ts';

export type ProducerForecastMaterialization = {
  producer: ProducerJsonV1;
  diagnostics: string[];
  appliedRuleIds: string[];
};

type ProductionCandidate = {
  ruleId: string;
  key: string;
  disclosure: ProductionDisclosure;
};

type CostCandidate = {
  ruleId: string;
  disclosure: CostDisclosure;
};

function ruleApplies(startYear: number, endYear: number, year: number): boolean {
  return year >= startYear && year <= endYear;
}

function forecastClaim(claim: NumericClaim, factor = 1): NumericClaim {
  switch (claim.kind) {
    case 'point':
      return { kind: 'approximate', value: claim.value * factor };
    case 'approximate':
      return { kind: 'approximate', value: claim.value * factor };
    case 'range':
      return { kind: 'range', low: claim.low * factor, high: claim.high * factor };
    case 'upper_bound':
      return { kind: 'upper_bound', value: claim.value * factor };
    case 'lower_bound':
      return { kind: 'lower_bound', value: claim.value * factor };
  }
}

function annualFactor(rate: number, elapsedYears: number): number | null {
  if (!Number.isFinite(rate) || rate <= -1 || !Number.isInteger(elapsedYears) || elapsedYears < 0) return null;
  const factor = Math.pow(1 + rate, elapsedYears);
  return Number.isFinite(factor) && factor >= 0 ? factor : null;
}

function exactYearProductionExists(project: ProducerProject, year: number, metal: string, measure: ProductionDisclosure['measure']): boolean {
  return project.production.some((item) =>
    item.period.kind === 'year'
    && item.period.year === year
    && item.metal === metal
    && item.measure === measure,
  );
}

function productionCandidate(
  project: ProducerProject,
  rule: ForecastProductionRule,
  year: number,
): { candidate: ProductionCandidate | null; diagnostics: string[] } {
  const diagnostics: string[] = [];
  if (!ruleApplies(rule.appliesTo.startYear, rule.appliesTo.endYear, year)) return { candidate: null, diagnostics };

  if (rule.method === 'explicit') {
    return {
      candidate: {
        ruleId: rule.id,
        key: `${rule.metal}|${rule.measure}`,
        disclosure: {
          id: `forecast:${rule.id}:${year}`,
          metal: rule.metal,
          measure: rule.measure,
          period: { kind: 'year', year },
          quantity: forecastClaim(rule.quantity),
          unit: rule.unit,
          basis: rule.basis,
          provenance: rule.provenance,
        },
      },
      diagnostics,
    };
  }

  const source = project.production.find((item) => item.id === rule.sourceDisclosureId);
  if (!source) {
    diagnostics.push(`FORECAST_RULE_INVALID: ${project.id}/${rule.id} source production ${rule.sourceDisclosureId} not found`);
    return { candidate: null, diagnostics };
  }

  let quantity = source.quantity;
  if (rule.method === 'carry_forward') {
    if (source.period.kind !== 'year') {
      diagnostics.push(`FORECAST_RULE_INVALID: ${project.id}/${rule.id} carry_forward requires an exact-year source disclosure`);
      return { candidate: null, diagnostics };
    }
    const factor = annualFactor(rule.annualChangePct, year - source.period.year);
    if (factor === null) {
      diagnostics.push(`FORECAST_RULE_INVALID: ${project.id}/${rule.id} annualChangePct/source-year combination is invalid`);
      return { candidate: null, diagnostics };
    }
    quantity = forecastClaim(source.quantity, factor);
  } else {
    if (source.period.kind === 'year_range_total' && rule.quantity === undefined) {
      diagnostics.push(`FORECAST_RULE_INVALID: ${project.id}/${rule.id} cannot periodize a year_range_total without an explicit scenario quantity`);
      return { candidate: null, diagnostics };
    }
    quantity = forecastClaim(rule.quantity ?? source.quantity);
  }

  return {
    candidate: {
      ruleId: rule.id,
      key: `${source.metal}|${source.measure}`,
      disclosure: {
        id: `forecast:${rule.id}:${year}`,
        metal: source.metal,
        measure: source.measure,
        period: { kind: 'year', year },
        quantity,
        unit: source.unit,
        basis: source.basis,
        provenance: rule.provenance,
      },
    },
    diagnostics,
  };
}

function scaleCostModel(model: CostModel, factor: number): { model: CostModel | null; diagnostic?: string } {
  switch (model.type) {
    case 'fixed_amount':
      return { model: { ...model, amount: forecastClaim(model.amount, factor) } };
    case 'per_unit':
      return { model: { ...model, amount: forecastClaim(model.amount, factor) } };
    case 'percent_revenue':
      if (Math.abs(factor - 1) > 1e-12) {
        return { model: null, diagnostic: 'percent_revenue carry-forward cannot apply monetary escalation; use annualEscalationPct=0 or an explicit rule' };
      }
      return { model: { ...model, rate: forecastClaim(model.rate) } };
    case 'price_linked':
      return { model: { ...model, referenceValue: forecastClaim(model.referenceValue, factor) } };
    case 'reported_total':
      return { model: { ...model, amount: forecastClaim(model.amount, factor) } };
    case 'derived':
      return { model: null, diagnostic: 'derived cost models are not carry-forwardable; use an explicit forecast cost rule after making the derivation explicit' };
  }
}

function coveredComponents(disclosure: CostDisclosure): Set<string> {
  return new Set([disclosure.component, ...(disclosure.definition?.includesComponents ?? [])]);
}

function exactYearCostOverlaps(costs: readonly CostDisclosure[], year: number, candidate: CostDisclosure): boolean {
  const candidateCoverage = coveredComponents(candidate);
  return costs.some((cost) => {
    if (cost.period.kind !== 'year' || cost.period.year !== year) return false;
    return [...coveredComponents(cost)].some((component) => candidateCoverage.has(component));
  });
}

function costCandidate(
  costs: readonly CostDisclosure[],
  rule: ForecastCostRule,
  year: number,
  scopeLabel: string,
): { candidate: CostCandidate | null; diagnostics: string[] } {
  const diagnostics: string[] = [];
  if (!ruleApplies(rule.appliesTo.startYear, rule.appliesTo.endYear, year)) return { candidate: null, diagnostics };

  if (rule.method === 'explicit') {
    return {
      candidate: {
        ruleId: rule.id,
        disclosure: {
          id: `forecast:${rule.id}:${year}`,
          component: rule.component,
          period: { kind: 'year', year },
          economicBasis: rule.economicBasis,
          canonicalClassification: rule.canonicalClassification,
          model: rule.model,
          definition: rule.definition,
          provenance: rule.provenance,
        },
      },
      diagnostics,
    };
  }

  const source = costs.find((item) => item.id === rule.sourceCostId);
  if (!source) {
    diagnostics.push(`FORECAST_RULE_INVALID: ${scopeLabel}/${rule.id} source cost ${rule.sourceCostId} not found`);
    return { candidate: null, diagnostics };
  }
  if (source.period.kind !== 'year') {
    diagnostics.push(`FORECAST_RULE_INVALID: ${scopeLabel}/${rule.id} carry_forward requires an exact-year source cost`);
    return { candidate: null, diagnostics };
  }
  const factor = annualFactor(rule.annualEscalationPct, year - source.period.year);
  if (factor === null) {
    diagnostics.push(`FORECAST_RULE_INVALID: ${scopeLabel}/${rule.id} annualEscalationPct/source-year combination is invalid`);
    return { candidate: null, diagnostics };
  }
  const scaled = scaleCostModel(source.model, factor);
  if (!scaled.model) {
    diagnostics.push(`FORECAST_RULE_INVALID: ${scopeLabel}/${rule.id} ${scaled.diagnostic ?? 'cost model cannot be forecast'}`);
    return { candidate: null, diagnostics };
  }

  return {
    candidate: {
      ruleId: rule.id,
      disclosure: {
        ...source,
        id: `forecast:${rule.id}:${year}`,
        period: { kind: 'year', year },
        model: scaled.model,
        provenance: rule.provenance,
      },
    },
    diagnostics,
  };
}

function materializeProjectProduction(project: ProducerProject, year: number): { production: ProductionDisclosure[]; diagnostics: string[]; applied: string[] } {
  const diagnostics: string[] = [];
  const applied: string[] = [];
  const candidates: ProductionCandidate[] = [];
  for (const rule of project.forecastAssumptions?.production ?? []) {
    const result = productionCandidate(project, rule, year);
    diagnostics.push(...result.diagnostics);
    if (result.candidate) candidates.push(result.candidate);
  }

  const grouped = new Map<string, ProductionCandidate[]>();
  for (const candidate of candidates) grouped.set(candidate.key, [...(grouped.get(candidate.key) ?? []), candidate]);
  const additions: ProductionDisclosure[] = [];
  for (const [key, rows] of grouped) {
    const [metal, measure] = key.split('|') as [string, ProductionDisclosure['measure']];
    if (exactYearProductionExists(project, year, metal, measure)) {
      diagnostics.push(`FORECAST_RULE_SKIPPED_EXPLICIT: ${project.id}/${year}/${metal}/${measure}; explicit annual disclosure wins over forecast assumption`);
      continue;
    }
    if (rows.length > 1) {
      diagnostics.push(`FORECAST_RULE_CONFLICT: ${project.id}/${year}/${metal}/${measure} has overlapping rules ${rows.map((row) => row.ruleId).join(', ')}`);
      continue;
    }
    additions.push(rows[0].disclosure);
    applied.push(rows[0].ruleId);
    diagnostics.push(`FORECAST_RULE_APPLIED: ${project.id}/${rows[0].ruleId} materialized ${year} ${metal}/${measure}`);
  }
  return { production: [...project.production, ...additions], diagnostics, applied };
}

function materializeCosts(
  costs: readonly CostDisclosure[],
  rules: readonly ForecastCostRule[],
  year: number,
  scopeLabel: string,
): { costs: CostDisclosure[]; diagnostics: string[]; applied: string[] } {
  const diagnostics: string[] = [];
  const applied: string[] = [];
  const candidates: CostCandidate[] = [];
  for (const rule of rules) {
    const result = costCandidate(costs, rule, year, scopeLabel);
    diagnostics.push(...result.diagnostics);
    if (result.candidate) candidates.push(result.candidate);
  }

  const conflicting = new Set<string>();
  for (let i = 0; i < candidates.length; i += 1) {
    for (let j = i + 1; j < candidates.length; j += 1) {
      const left = coveredComponents(candidates[i].disclosure);
      const right = coveredComponents(candidates[j].disclosure);
      if ([...left].some((component) => right.has(component))) {
        conflicting.add(candidates[i].ruleId);
        conflicting.add(candidates[j].ruleId);
      }
    }
  }
  if (conflicting.size > 0) {
    diagnostics.push(`FORECAST_RULE_CONFLICT: ${scopeLabel}/${year} overlapping cost coverage in rules ${[...conflicting].join(', ')}`);
  }

  const additions: CostDisclosure[] = [];
  for (const candidate of candidates) {
    if (conflicting.has(candidate.ruleId)) continue;
    if (exactYearCostOverlaps(costs, year, candidate.disclosure)) {
      diagnostics.push(`FORECAST_RULE_SKIPPED_EXPLICIT: ${scopeLabel}/${candidate.ruleId}/${year}; explicit annual cost coverage wins over forecast assumption`);
      continue;
    }
    additions.push(candidate.disclosure);
    applied.push(candidate.ruleId);
    diagnostics.push(`FORECAST_RULE_APPLIED: ${scopeLabel}/${candidate.ruleId} materialized ${year} ${candidate.disclosure.component}`);
  }
  return { costs: [...costs, ...additions], diagnostics, applied };
}

export function materializeProducerForecastForYear(
  producer: ProducerJsonV1,
  year: number,
): ProducerForecastMaterialization {
  const diagnostics: string[] = [];
  const appliedRuleIds: string[] = [];
  const projects = producer.projects.map((project) => {
    const production = materializeProjectProduction(project, year);
    const costs = materializeCosts(project.costs ?? [], project.forecastAssumptions?.costs ?? [], year, project.id);
    diagnostics.push(...production.diagnostics, ...costs.diagnostics);
    appliedRuleIds.push(...production.applied, ...costs.applied);
    return {
      ...project,
      production: production.production,
      costs: costs.costs,
    };
  });

  const corporate = materializeCosts(
    producer.corporateCosts ?? [],
    producer.forecastAssumptions?.corporateCosts ?? [],
    year,
    'company',
  );
  diagnostics.push(...corporate.diagnostics);
  appliedRuleIds.push(...corporate.applied);

  return {
    producer: {
      ...producer,
      projects,
      corporateCosts: corporate.costs,
    },
    diagnostics: [...new Set(diagnostics)],
    appliedRuleIds: [...new Set(appliedRuleIds)],
  };
}
