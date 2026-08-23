const GENERATED_EDITOR_METADATA_PREFIXES = [
  '_description',
  '_choices',
  '_example',
  '_reference',
  '_hard_rules',
  '_how_to_fill',
  '_calculability_requirements',
  '_known_limitations',
  '_replacement_rules',
  '_source_hierarchy_guidance',
  '_production_methods',
  '_cost_methods',
  '_precedence',
  '_alternatives',
  '_alternative_',
] as const;

function isGeneratedEditorMetadataKey(key: string): boolean {
  return GENERATED_EDITOR_METADATA_PREFIXES.some((prefix) => key === prefix || key.startsWith(`${prefix}_`));
}

/**
 * Removes only generated template/documentation metadata from a Producer payload.
 *
 * Company-specific notes such as `_producer_note*` are deliberately preserved,
 * as are all non-underscore evidence fields. This lets an older saved Corporate
 * JSON be re-decorated with the current template without stale `_description_*`
 * or `_example_*` content winning over the latest editor contract.
 */
export function stripGeneratedProducerEditorMetadata<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => stripGeneratedProducerEditorMetadata(item)) as T;
  }
  if (!value || typeof value !== 'object') return value;

  const output: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (isGeneratedEditorMetadataKey(key)) continue;
    output[key] = stripGeneratedProducerEditorMetadata(child);
  }
  return output as T;
}
