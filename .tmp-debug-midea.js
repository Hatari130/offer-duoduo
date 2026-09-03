// 美的招聘页面适配器调试脚本
// 在浏览器控制台中运行此脚本以检查适配器状态

(function() {
  console.log('=== 美的招聘页面适配器调试 ===\n');

  // 1. 检查插件是否加载
  console.log('1. 插件加载检查:');
  console.log('   window.OfferFlowAdapterRegistry:', !!window.OfferFlowAdapterRegistry);
  console.log('   window.OfferFlowFormAdapters:', !!window.OfferFlowFormAdapters);
  console.log('   window.OfferFlowControlDrivers:', !!window.OfferFlowControlDrivers);

  if (!window.OfferFlowFormAdapters) {
    console.error('   ❌ 插件未加载或版本过旧，请重新加载插件');
    return;
  }

  // 2. 检查适配器解析
  console.log('\n2. 适配器解析检查:');
  try {
    const resolved = window.OfferFlowFormAdapters.resolve(location);
    console.log('   解析结果:', {
      id: resolved?.id,
      name: resolved?.name,
      formAdapterId: resolved?.formAdapterId,
      layer: resolved?.route?.layer,
      companyId: resolved?.route?.companyId,
      platformId: resolved?.route?.platformId
    });

    if (resolved?.id !== 'midea' && resolved?.formAdapterId !== 'midea') {
      console.warn('   ⚠️ 未解析到美的适配器，当前适配器:', resolved?.id || resolved?.formAdapterId);
    } else {
      console.log('   ✅ 美的适配器已正确解析');
    }
  } catch (e) {
    console.error('   ❌ 解析失败:', e.message);
  }

  // 3. 检查表单字段扫描
  console.log('\n3. 表单字段扫描:');
  const mdFormItems = document.querySelectorAll('.md-form-item');
  console.log('   找到 .md-form-item 数量:', mdFormItems.length);

  if (mdFormItems.length === 0) {
    console.warn('   ⚠️ 未找到 .md-form-item 元素，可能页面未完全加载或 DOM 结构不同');
    return;
  }

  // 4. 检查字段标签提取
  console.log('\n4. 字段标签提取检查 (前 5 个字段):');
  const fields = [];
  for (let i = 0; i < Math.min(5, mdFormItems.length); i++) {
    const field = mdFormItems[i];
    const label = field.querySelector('.md-form-item__label');
    const content = field.querySelector('.md-form-item__content');
    const input = content?.querySelector('input, textarea, select, .ihr_dict_picker, .ihr_base_picker, .ihr_school_picker, [role="combobox"]');

    const fieldInfo = {
      index: i + 1,
      label: label?.textContent?.trim(),
      inputTag: input?.tagName,
      inputClass: input?.className?.substring(0, 80),
      hasInput: !!input
    };
    fields.push(fieldInfo);

    console.log(`   字段 ${i + 1}:`);
    console.log(`     标签: "${fieldInfo.label}"`);
    console.log(`     输入控件: ${fieldInfo.inputTag || '未找到'}`);
    console.log(`     控件类名: ${fieldInfo.inputClass || 'N/A'}`);
  }

  // 5. 检查控件驱动识别
  console.log('\n5. 控件驱动识别检查:');
  if (window.OfferFlowControlDrivers) {
    const picker = document.querySelector('.ihr_dict_picker, .ihr_base_picker, .ihr_school_picker');
    if (picker) {
      const identified = window.OfferFlowControlDrivers.identify(picker);
      console.log('   选择器控件识别:', identified ? {
        id: identified.id,
        type: identified.type,
        root: identified.root?.className?.substring(0, 80)
      } : '未识别');

      if (!identified) {
        console.warn('   ⚠️ mdesign driver 未识别选择器控件');
      } else if (identified.id === 'mdesign') {
        console.log('   ✅ mdesign driver 已正确识别');
      }
    } else {
      console.warn('   ⚠️ 未找到选择器控件 (.ihr_dict_picker, .ihr_base_picker, .ihr_school_picker)');
    }
  }

  // 6. 检查字段匹配
  console.log('\n6. 字段匹配检查 (测试 "学校名称" 标签):');
  if (window.OfferFlowFormAdapters?.match) {
    const testLabel = '学校名称';
    const testElement = document.querySelector('.ihr_school_picker');
    const match = window.OfferFlowFormAdapters.match(testElement, testLabel);
    console.log('   匹配结果:', match || '未匹配');

    if (!match) {
      console.warn('   ⚠️ 字段匹配失败，检查适配器 mappings 配置');
    } else {
      console.log('   ✅ 字段匹配成功:', match.key, '置信度:', match.confidence);
    }
  }

  console.log('\n=== 调试完成 ===');
  console.log('如果以上检查都通过，请尝试触发自动填充并观察结果。');
  console.log('如果仍有问题，请检查浏览器控制台是否有错误信息。');
})();
