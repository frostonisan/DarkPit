// Index an already serialized JSON object without parsing its unchanged values.
// Strings are consumed as complete tokens, including escaped quotes/brackets.
export function splitJSONFields(text) {
    if (text[0] !== '{' || text.at(-1) !== '}') return null;
    const fields = new Map();
    const tokens = /"(?:\\[\s\S]|[^"\\])*"|[{}\[\],]/g;
    let depth = 0, key, start = 0;
    for (const match of text.matchAll(tokens)) {
        const token = match[0];
        if (token[0] === '"') {
            if (depth === 1 && key === undefined) {
                key = token.includes('\\') ? JSON.parse(token) : token.slice(1, -1);
                start = match.index;
            }
        } else if (token === '{' || token === '[') depth++;
        else if (token === ',' && depth === 1 || token === '}' && depth === 1) {
            if (key !== undefined) fields.set(key, text.slice(start, match.index));
            key = undefined;
            if (token === '}') depth--;
        } else if (token === '}' || token === ']') depth--;
    }
    return fields;
}

// Private, previously JSON-normalized combat records only. Callers must declare
// every changed top-level field; general writers still serialize the full record.
// Live entities never receive these shared, unchanged private subobjects.
export function serializeChangedJSONFields(record, changedFields, replacer) {
    const entity = record.entity;
    if (!record.text || !Array.isArray(changedFields) || !entity || typeof entity !== 'object'
        || Array.isArray(entity) || typeof entity.toJSON === 'function') return null;
    const previous = record.fields || splitJSONFields(record.text);
    if (!previous) return null;
    const patch = Object.fromEntries(changedFields.map(key => [key, entity[key]]));
    if (typeof patch.toJSON === 'function') return null;
    const patchText = JSON.stringify(patch, replacer);
    const updated = splitJSONFields(patchText);
    if (!updated) return null;
    const values = JSON.parse(patchText);
    const normalized = { ...entity }, fields = new Map(previous);
    for (const key of changedFields) {
        if (Object.hasOwn(values, key)) {
            Object.defineProperty(normalized, key, { value: values[key],
                enumerable: true, configurable: true, writable: true });
            fields.set(key, updated.get(key));
        } else {
            delete normalized[key];
            fields.delete(key);
        }
    }
    const keys = Object.keys(normalized);
    // A caller with a new, undeclared field needs the complete writer.
    if (keys.some(key => !fields.has(key))) return null;
    const text = '{' + keys.map(key => fields.get(key)).join(',') + '}';
    return { record, text, normalized, fields };
}
