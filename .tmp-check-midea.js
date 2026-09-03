// 检查美的表单字段 DOM 结构
const fields = document.querySelectorAll('.md-form-item');
console.log('找到 md-form-item 数量:', fields.length);

fields.forEach((field, index) => {
  const label = field.querySelector('.md-form-item__label');
  const content = field.querySelector('.md-form-item__content');
  const input = content?.querySelector('input, textarea, select, .ihr_dict_picker, .ihr_base_picker, .ihr_school_picker, [role="combobox"]');

  console.log(`\n字段 ${index + 1}:`);
  console.log('  标签:', label?.textContent?.trim());
  console.log('  输入控件:', input?.tagName, input?.className);
  console.log('  name 属性:', input?.getAttribute('name'));
  console.log('  id 属性:', input?.getAttribute('id'));
  console.log('  placeholder:', input?.getAttribute('placeholder'));

  // 检查是否有 data 属性
  if (input) {
    const attrs = Array.from(input.attributes).map(a => `${a.name}="${a.value}"`).join(', ');
    console.log('  所有属性:', attrs);
  }
});

// 检查适配器注册
console.log('\n=== 适配器注册检查 ===');
console.log('OfferFlowAdapterRegistry:', !!window.OfferFlowAdapterRegistry);
console.log('OfferFlowFormAdapters:', !!window.OfferFlowFormAdapters);

if (window.OfferFlowAdapterRegistry) {
  const snapshot = window.OfferFlowAdapterRegistry.snapshot();
  console.log('Companies:', Object.keys(snapshot.companies));
  console.log('Platforms:', Object.keys(snapshot.platforms));
  console.log('Midea company:', snapshot.companies.midea);
}

if (window.OfferFlowFormAdapters) {
  const resolved = window.OfferFlowFormAdapters.resolve(location);
  console.log('Resolved adapter:', resolved);
}

// 检查控件驱动
console.log('\n=== 控件驱动检查 ===');
console.log('OfferFlowControlDrivers:', !!window.OfferFlowControlDrivers);
if (window.OfferFlowControlDrivers) {
  console.log('Drivers:', window.OfferFlowControlDrivers.drivers);

  // 测试识别第一个选择器控件
  const picker = document.querySelector('.ihr_dict_picker, .ihr_base_picker, .ihr_school_picker');
  if (picker) {
    const identified = window.OfferFlowControlDrivers.identify(picker);
    console.log('识别选择器控件:', identified);
  }
}
