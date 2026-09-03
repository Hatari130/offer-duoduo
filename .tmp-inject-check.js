// 注入到页面检查 DOM 结构
(function() {
  const fields = document.querySelectorAll('.md-form-item');
  const result = {
    totalFields: fields.length,
    fields: []
  };

  fields.forEach((field, index) => {
    const label = field.querySelector('.md-form-item__label');
    const content = field.querySelector('.md-form-item__content');
    const input = content?.querySelector('input, textarea, select, .ihr_dict_picker, .ihr_base_picker, .ihr_school_picker, [role="combobox"]');

    const fieldInfo = {
      index: index + 1,
      label: label?.textContent?.trim(),
      inputTag: input?.tagName,
      inputClass: input?.className?.substring(0, 100),
      inputName: input?.getAttribute('name'),
      inputId: input?.getAttribute('id'),
      inputPlaceholder: input?.getAttribute('placeholder'),
      hasIhrPicker: input?.classList?.contains('ihr_dict_picker') || input?.classList?.contains('ihr_base_picker') || input?.classList?.contains('ihr_school_picker')
    };

    result.fields.push(fieldInfo);
  });

  // 检查适配器
  result.adapterRegistry = !!window.OfferFlowAdapterRegistry;
  result.formAdapters = !!window.OfferFlowFormAdapters;

  if (window.OfferFlowFormAdapters) {
    try {
      const resolved = window.OfferFlowFormAdapters.resolve(location);
      result.resolvedAdapter = {
        id: resolved?.id,
        name: resolved?.name,
        formAdapterId: resolved?.formAdapterId,
        route: resolved?.route
      };
    } catch (e) {
      result.resolveError = e.message;
    }
  }

  console.log(JSON.stringify(result, null, 2));
  return result;
})();
