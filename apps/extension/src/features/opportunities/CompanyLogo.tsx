import type { CSSProperties } from "react";
import type { SimpleIcon } from "simple-icons";
import {
  siAlibabacloud,
  siAlibabadotcom,
  siAlipay,
  siApple,
  siBaidu,
  siBilibili,
  siBytedance,
  siDazhongdianping,
  siDji,
  siDouban,
  siGoogle,
  siHuawei,
  siKuaishou,
  siLenovo,
  siMeituan,
  siOppo,
  siShopee,
  siSinaweibo,
  siTaobao,
  siTesla,
  siTiktok,
  siTripdotcom,
  siVivo,
  siWechat,
  siXiaohongshu,
  siXiaomi,
  siZhihu
} from "simple-icons";

type BrandDefinition = {
  aliases: string[];
  icon?: SimpleIcon;
  wordmark?: string;
  hex?: string;
};

// SVG paths are bundled locally; no company or page URL is sent to an image CDN.
const BRANDS: BrandDefinition[] = [
  { aliases: ["阿里云", "alibaba cloud"], icon: siAlibabacloud },
  { aliases: ["阿里巴巴", "阿里", "alibaba"], icon: siAlibabadotcom },
  { aliases: ["蚂蚁集团", "蚂蚁金服", "蚂蚁", "支付宝", "ant group", "alipay"], icon: siAlipay },
  { aliases: ["淘宝", "taobao"], icon: siTaobao },
  { aliases: ["字节跳动", "字节", "bytedance"], icon: siBytedance },
  { aliases: ["百度", "baidu"], icon: siBaidu },
  { aliases: ["华为", "huawei"], icon: siHuawei },
  { aliases: ["美团", "meituan"], icon: siMeituan },
  { aliases: ["小米", "xiaomi"], icon: siXiaomi },
  { aliases: ["哔哩哔哩", "bilibili", "b站"], icon: siBilibili },
  { aliases: ["快手", "kuaishou"], icon: siKuaishou },
  { aliases: ["携程", "trip.com", "trip group", "ctrip"], icon: siTripdotcom },
  { aliases: ["大众点评", "dianping"], icon: siDazhongdianping },
  { aliases: ["联想", "lenovo"], icon: siLenovo },
  { aliases: ["oppo", "欧珀"], icon: siOppo },
  { aliases: ["vivo", "维沃"], icon: siVivo },
  { aliases: ["大疆", "dji"], icon: siDji },
  { aliases: ["小红书", "xiaohongshu", "rednote"], icon: siXiaohongshu },
  { aliases: ["微博", "新浪", "weibo"], icon: siSinaweibo },
  { aliases: ["知乎", "zhihu"], icon: siZhihu },
  { aliases: ["豆瓣", "douban"], icon: siDouban },
  { aliases: ["微信", "wechat", "weixin"], icon: siWechat },
  { aliases: ["抖音", "tiktok"], icon: siTiktok },
  { aliases: ["shopee", "虾皮"], icon: siShopee },
  { aliases: ["苹果", "apple"], icon: siApple },
  { aliases: ["谷歌", "google"], icon: siGoogle },
  { aliases: ["特斯拉", "tesla"], icon: siTesla },
  { aliases: ["拼多多", "pinduoduo", "pdd holdings", "pdd"], wordmark: "PDD", hex: "E02E24" },
  { aliases: ["京东", "jd.com", "jd集团", "jd"], wordmark: "JD", hex: "E2231A" },
  { aliases: ["腾讯", "tencent"], wordmark: "腾讯", hex: "1769AA" },
  { aliases: ["滴滴", "didi"], wordmark: "DiDi", hex: "FF7A1A" },
  { aliases: ["网易", "netease"], wordmark: "网易", hex: "D43C33" },
  { aliases: ["微软", "microsoft"], wordmark: "MS", hex: "5E5E5E" },
  { aliases: ["亚马逊", "amazon"], wordmark: "a", hex: "FF9900" }
];

const normalizeBrandName = (value: string) =>
  value
    .toLowerCase()
    .replace(/[（(][^）)]*[）)]/g, "")
    .replace(/集团|控股|科技|有限责任公司|有限公司|公司|中国|china|inc\.?|group|holdings/g, "")
    .replace(/[\s·._-]+/g, "");

const resolveBrand = (company: string) => {
  const normalizedCompany = normalizeBrandName(company);
  if (!normalizedCompany) return undefined;
  return BRANDS.find((brand) =>
    brand.aliases.some((alias) => {
      const normalizedAlias = normalizeBrandName(alias);
      return normalizedCompany.includes(normalizedAlias);
    })
  );
};

const fallbackMark = (company: string) => {
  const latin = company.match(/[A-Za-z0-9]+/)?.[0];
  if (latin) return latin.slice(0, 2).toUpperCase();
  return company.replace(/[（(].*$/, "").trim().slice(0, 1) || "企";
};

export default function CompanyLogo({ company }: { company: string }) {
  const brand = resolveBrand(company);
  const color = `#${brand?.icon?.hex || brand?.hex || "405247"}`;
  const style = { "--company-brand": color } as CSSProperties;

  return (
    <span
      className={`opportunity-company-logo ${brand ? "opportunity-company-logo--brand" : "opportunity-company-logo--fallback"}`}
      style={style}
      aria-hidden="true"
    >
      {brand?.icon ? (
        <svg viewBox="0 0 24 24" role="presentation">
          <path d={brand.icon.path} />
        </svg>
      ) : (
        <strong className={(brand?.wordmark || "").length > 2 ? "compact" : ""}>
          {brand?.wordmark || fallbackMark(company)}
        </strong>
      )}
    </span>
  );
}
