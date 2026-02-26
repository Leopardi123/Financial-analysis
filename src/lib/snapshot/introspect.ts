const snapshotSource = new WeakMap<object, unknown>();

export type SnapshotShape = {
  scalarKeys: string[];
  objectKeys: string[];
  arrayKeys: string[];
  arrayValueTypes: Record<string, string>;
  missingKeys: string[];
  notes: string[];
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function classifyScalar(value: unknown): 'number' | 'string' | 'boolean' | 'null' {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? 'number' : 'null';
  }
  if (typeof value === 'string') {
    return 'string';
  }
  if (typeof value === 'boolean') {
    return 'boolean';
  }
  return 'null';
}

function arrayElementType(value: unknown): string {
  if (value === null || value === undefined) {
    return 'null';
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? 'number' : 'null';
  }
  if (typeof value === 'string') {
    return 'string';
  }
  if (typeof value === 'boolean') {
    return 'boolean';
  }
  if (Array.isArray(value)) {
    return 'array';
  }
  if (isPlainObject(value)) {
    return 'object';
  }
  return 'null';
}

function summarizeArrayTypes(values: unknown[]): string {
  if (values.length === 0) {
    return 'empty';
  }

  const typeSet = new Set(values.map(arrayElementType));
  if (typeSet.size === 1) {
    return [...typeSet][0];
  }
  if (typeSet.size === 2 && typeSet.has('number') && typeSet.has('null')) {
    return 'number|null';
  }
  return 'mixed';
}

export function introspectSnapshot(obj: unknown): SnapshotShape {
  const empty: SnapshotShape = {
    scalarKeys: [],
    objectKeys: [],
    arrayKeys: [],
    arrayValueTypes: {},
    missingKeys: [],
    notes: [],
  };

  if (!isPlainObject(obj)) {
    return {
      ...empty,
      notes: ['Input snapshot is not a plain object.'],
    };
  }

  const scalarKeys: string[] = [];
  const objectKeys: string[] = [];
  const arrayKeys: string[] = [];
  const arrayValueTypes: Record<string, string> = {};

  const visit = (node: Record<string, unknown>, prefix: string): void => {
    const entries = Object.entries(node).sort(([a], [b]) => a.localeCompare(b));
    for (const [key, value] of entries) {
      const path = prefix.length > 0 ? `${prefix}.${key}` : key;
      if (Array.isArray(value)) {
        arrayKeys.push(path);
        arrayValueTypes[path] = summarizeArrayTypes(value);
        continue;
      }

      if (isPlainObject(value)) {
        objectKeys.push(path);
        visit(value, path);
        continue;
      }

      scalarKeys.push(path);
      const type = classifyScalar(value);
      if (type === 'null' && typeof value === 'number' && !Number.isFinite(value)) {
        empty.notes.push(`Top-level key ${path} had non-finite number and was classified as null.`);
      }
    }
  };

  visit(obj, '');

  const shape: SnapshotShape = {
    scalarKeys,
    objectKeys,
    arrayKeys,
    arrayValueTypes,
    missingKeys: [],
    notes: empty.notes,
  };
  snapshotSource.set(shape, obj);
  return shape;
}

function isNullishScalar(value: unknown): boolean {
  if (value === null || value === undefined) {
    return true;
  }
  if (typeof value === 'number' && !Number.isFinite(value)) {
    return true;
  }
  return false;
}

function isNullishArray(value: unknown): boolean {
  if (!Array.isArray(value) || value.length === 0) {
    return false;
  }
  return value.every((item) => item === null || item === undefined || (typeof item === 'number' && !Number.isFinite(item)));
}

export function compareSnapshotKeys(
  actual: SnapshotShape,
  expectedKeys: string[],
): {
  missing: string[];
  present: string[];
  presentButNullish: string[];
  arraysPresent: string[];
} {
  const source = snapshotSource.get(actual as unknown as object);
  const root = isPlainObject(source) ? source : {};

  const uniqueExpected = [...new Set(expectedKeys)].sort((a, b) => a.localeCompare(b));
  const present = uniqueExpected.filter((key) => key in root);
  const missing = uniqueExpected.filter((key) => !(key in root));
  actual.missingKeys = missing;

  const presentButNullish = present.filter((key) => {
    const value = root[key];
    if (Array.isArray(value)) {
      return isNullishArray(value);
    }
    return isNullishScalar(value);
  });

  const arraysPresent = present.filter((key) => Array.isArray(root[key]));

  return {
    missing,
    present,
    presentButNullish,
    arraysPresent,
  };
}

