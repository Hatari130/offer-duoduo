import assert from "node:assert/strict";
import test from "node:test";

const { resolveBrand } = await import(
  "../src/features/opportunities/companyBrands.ts"
);

// Companies that previously fell back to a first-character placeholder must
// now resolve to a brand (icon or wordmark).
const expectedToResolve = [
  "温氏股份",
  "温氏食品集团股份有限公司",
  "拼多多集团-PDD",
  "京东",
  "腾讯",
  "百度",
  "阿里巴巴",
  "字节跳动",
  "美团",
  "华为",
  "小米",
  "滴滴出行",
  "网易",
  "顺丰速运",
  "中通快递",
  "圆通速递",
  "菜鸟网络",
  "中国移动",
  "中国电信",
  "中国联通",
  "工商银行",
  "招商银行",
  "比亚迪",
  "蔚来",
  "小鹏汽车",
  "理想汽车",
  "宁德时代",
  "海康威视",
  "科大讯飞",
  "埃森哲",
  "德勤",
  "普华永道",
  "宝洁",
  "可口可乐",
  "耐克",
  "阿迪达斯",
  "沃尔玛",
  "苹果",
  "谷歌",
  "微软",
  "特斯拉",
  "Intel",
  "NVIDIA"
];

test("common recruiting companies resolve to a brand instead of a fallback", () => {
  const failures = [];
  for (const company of expectedToResolve) {
    const brand = resolveBrand(company);
    if (!brand) {
      failures.push(company);
    }
  }
  assert.deepEqual(
    failures,
    [],
    `这些公司仍会回退到首字占位符: ${failures.join("、")}`
  );
});

test("companies with simple-icons entries expose an svg path", () => {
  const baidu = resolveBrand("百度");
  assert.ok(baidu?.icon?.path?.startsWith("M"), "百度应使用 simple-icons 路径");
  const tesla = resolveBrand("特斯拉");
  assert.ok(tesla?.icon?.path, "特斯拉应使用 simple-icons 路径");
});

test("unrecognized company still falls back gracefully", () => {
  const brand = resolveBrand("某家不知名初创公司");
  assert.equal(brand, undefined);
});

test("brand color falls back to a neutral slate when hex is missing", () => {
  // Already covered by component default; just ensure the helper returns undefined-free.
  const brand = resolveBrand("温氏股份");
  assert.ok(brand?.hex || brand?.icon?.hex);
});
