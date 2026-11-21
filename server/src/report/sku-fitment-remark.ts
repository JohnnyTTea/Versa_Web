import type { DimensionCheck, FitmentPriceQuote, PageEvidence } from './sku-fitment';

type RemarkInput = {
  verdict: string;
  reason?: string;
  page?: PageEvidence;
  internal?: { text?: string };
  external?: { text?: string };
  dimensions?: DimensionCheck[];
  fitmentDetails?: DimensionCheck[];
};

const names: Record<string, string> = {
  fitmentRange: '适配年份', model: '车型', make: '车辆品牌', chassis: '底盘', body: '车身',
  trim: '配置', exclusions: '适配排除条件', partPosition: '安装位置', color: '颜色',
};

function displayValue(dimension: string, value: string, original = '') {
  if (dimension !== 'color') return value.replaceAll(' | ', ' / ');
  return value.split(' | ').map(part => {
    if (part === 'carbon fiber look' && /\bcarbon fiber print\b/i.test(original)) {
      return 'Carbon Fiber Print';
    }
    return part.replace(/\b[a-z]/g, letter => letter.toUpperCase());
  }).join(' / ');
}

export function fitmentRemark(row: RemarkInput, current: FitmentPriceQuote | null) {
  const fields = row.dimensions || [];
  const dimension = (field: string) => fields.find(item => item.field === field);
  const sides = (item: DimensionCheck) => {
    const local = displayValue(item.field, item.internal, row.internal?.text);
    const reference = displayValue(item.field, item.external, row.page?.title || row.external?.text);
    return '我们的是 ' + local + '，对方的是 ' + reference;
  };
  const color = dimension('color');
  const differentColor = color?.status === 'different' ? color : null;
  const priceLabel = current?.kind === 'featured_offer' ? 'Amazon 新品推荐报价' :
    current?.kind === 'promotion' ? '参考页促销售价' : '参考页显示售价';
  const price = current ? priceLabel + '为 ' + current.currency + ' ' + current.amount : row.page?.priceReason || '参考售价未核实';
  const fitment = ['fitmentRange', 'model'].map(field => dimension(field)?.status);
  const alike = fitment.every(status => status === 'same') ? '适配相同' :
    fitment.every(status => status === 'same' || status === 'partial') ? '适配范围有交集' : '';

  if (row.verdict === 'FIT') {
    const identity = differentColor ? '同款不同色，' + sides(differentColor) :
      color?.status === 'unknown' ? '同款，颜色待定' : '同款';
    return [identity, [alike, '产品类型一致'].filter(Boolean).join('，'), price].join('。') + '。';
  }

  if (row.verdict === 'NOT FIT') {
    const qualifiers = (row.fitmentDetails || []).filter(item => item.status === 'different');
    const differences = fields.filter(item => item.status === 'different' && Object.hasOwn(names, item.field) &&
      (item.field !== 'model' || !qualifiers.some(detail => detail.field !== 'partPosition')))
      .concat(qualifiers).map(item => {
        const name = names[item.field] || item.field;
        return item.internal && item.external ? name + '不同，' + sides(item) : name + '有冲突，' + item.reason;
      });
    return '不是同款，' + (alike ? alike + '，但' : '') + (differences.join('；') || row.reason || '商品资料不同') + '。' + price + '。';
  }

  const detail = row.reason || row.page?.reason || '缺少可用商品资料';
  if (row.verdict === 'PENDING') return '待补查，' + detail.replace(/[。；]+$/, '') + '。';
  const prefix = row.verdict === 'INVALID' ? '输入无效' : '待人工复核';
  return prefix + '，' + detail.replace(/[。；]+$/, '') + '。' + price + '。';
}
