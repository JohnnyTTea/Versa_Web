const catalogNames = /ikon(?:\s+v\d+)?|oem?(?:\s+factory)?|factory|ams|ap|u1|cs|tr|type[ -]r|t-r|jdm(?:\s+mugen|\s+sir)?|mugen|modulo(?:\s+md)?|md|rocker|gt500|gli|20ae|vr|gr|fm|ctr|rs|hpd|trd|lp|ik6|m4|slim|gv\s*(?:type\s*)?\d|[acepr]|v\d+/.source;
const beforeLabel = new RegExp('\\b(' + catalogNames + ')\\s+(?:style|sty)\\b', 'g');
const afterLabel = new RegExp('\\b(?:style|sty)\\s*:\\s*(' + catalogNames + ')\\b', 'g');

function normalize(value: string) {
  return value.trim().toLowerCase()
    .replace(/^(?:tr|type-r|t-r)$/, 'type r').replace(/^(?:oem|factory|oe factory)$/, 'oe')
    .replace(/^(?:ik(?:on)?\s*v\s*|ik)(\d+)$/, 'ikon v$1').replace(/^ik$/, 'ikon')
    .replace(/^gv\s*(?:type\s*)?(\d)$/, 'gv$1').replace(/^modulo(?:\s+md)?$/, 'md');
}

export function catalogStyle(sku: string, description: string) {
  const text = description.toLowerCase().replace(/\s+/g, ' ')
    .replace(/\b(ams|cs|ikon(?:\s+v\d+)?|oe|tr)\s*s\s+ty(?=\b|urethane)/g, '$1 style ')
    .replace(/\bsty\s+le\b/g, 'style');
  const named = [...text.matchAll(beforeLabel), ...text.matchAll(afterLabel)].map(match => normalize(match[1]));
  const gv = text.match(/\bgv\s*type\s*(\d)\b/);
  if (gv) named.push('gv' + gv[1]);
  if (named.length) return { value: [...new Set(named)].sort().join(' | '), source: 'Desc1 / Desc2' };
  const loose = text.match(/\b(oe|oem)\b(?=\s*(?:-|$))|\b(gv\s?\d)\b|\b(ap|cs|ctr)\s+(?=(?:pu|pp|abs|front|rear)\b)/);
  if (loose) return { value: normalize(loose[1] || loose[2] || loose[3]), source: 'Desc1 / Desc2' };

  const code = sku.toUpperCase().split('-')[1];
  const skuStyle = code?.match(/(IK(?:V([1-9]))?|AMS|CS|TR|CTR|OE|OEM|HPD|TRD|RS|M4|GT500|GR|FM|GLI|20AE|IK6)(?:\d+P)?(?:LED)?$/);
  return skuStyle ? { value: normalize(skuStyle[1]), source: 'SKU 款式代码 ' + skuStyle[1] } :
    { value: '', source: '未提供' };
}
