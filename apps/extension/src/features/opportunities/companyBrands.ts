import type { SimpleIcon } from "simple-icons";
import {
  siAdidas,
  siAirbnb,
  siAirbus,
  siAlibabacloud,
  siAlibabadotcom,
  siAlipay,
  siAmd,
  siApple,
  siBaidu,
  siBankofamerica,
  siBilibili,
  siBytedance,
  siBookingdotcom,
  siBoeing,
  siBroadcom,
  siAccenture,
  siCisco,
  siCocacola,
  siDazhongdianping,
  siDior,
  siDji,
  siDouban,
  siGoogle,
  siHermes,
  siHsbc,
  siGoldmansachs,
  siHuawei,
  siHyundai,
  siIntel,
  siKuaishou,
  siLenovo,
  siMeituan,
  siMediatek,
  siMg,
  siNike,
  siNvidia,
  siNxp,
  siOppo,
  siPuma,
  siQualcomm,
  siSamsung,
  siShopee,
  siSinaweibo,
  siStmicroelectronics,
  siTaobao,
  siTesla,
  siTiktok,
  siTripdotcom,
  siUbereats,
  siUber,
  siUnilever,
  siUniqlo,
  siVivo,
  siWechat,
  siWellsfargo,
  siXiaohongshu,
  siXiaomi,
  siZhihu,
  siZara
} from "simple-icons";

export type BrandDefinition = {
  aliases: string[];
  icon?: SimpleIcon;
  wordmark?: string;
  hex?: string;
};

// SVG paths are bundled locally; no company or page URL is sent to an image CDN.
// `icon` 来自 simple-icons（官方标准色，已内置 hex）；`wordmark` 用于没有
// simple-icons 条目的公司，hex 取各公司官方品牌色（公开 VI 手册 / 官网提取）。
export const BRANDS: BrandDefinition[] = [
  // ---- 互联网 / 科技大厂 ----
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
  { aliases: ["微软", "microsoft"], wordmark: "Microsoft", hex: "5E5E5E" },
  { aliases: ["亚马逊", "amazon"], wordmark: "Amazon", hex: "FF9900" },
  { aliases: ["新浪", "sina"], wordmark: "SINA", hex: "E6162D" },
  { aliases: ["搜狐", "sohu"], wordmark: "SOHU", hex: "FF6600" },
  { aliases: ["360", "奇虎"], wordmark: "360", hex: "FF7A00" },
  { aliases: ["金山", "kingsoft"], wordmark: "金山", hex: "008CFF" },
  { aliases: ["哔哩", "bilibili"], wordmark: "B", hex: "FB7299" },

  // ---- 电商 / 物流 / O2O ----
  { aliases: ["顺丰", "sf express", "sf"], wordmark: "SF", hex: "000000" },
  { aliases: ["中通", "zto", "zhongtong"], wordmark: "ZTO", hex: "004F9E" },
  { aliases: ["圆通", "yto", "yuantong"], wordmark: "YTO", hex: "FF6A00" },
  { aliases: ["韵达", "yunda"], wordmark: "YD", hex: "0099CC" },
  { aliases: ["申通", "sto", "shentong"], wordmark: "STO", hex: "FF4A00" },
  { aliases: ["菜鸟", "cainiao"], wordmark: "菜鸟", hex: "0088FF" },
  { aliases: ["中国邮政", "ems", "post"], wordmark: "中国邮政", hex: "007E3A" },
  { aliases: ["达达", "dada"], wordmark: "DADA", hex: "FF6A00" },
  { aliases: ["饿了么", "eleme"], wordmark: "饿了么", hex: "0085FF" },
  { aliases: ["唯品会", "vipshop"], wordmark: "VIP", hex: "E60012" },
  { aliases: ["苏宁", "suning"], wordmark: "SN", hex: "FFAA00" },
  { aliases: ["国美", "gome"], wordmark: "GOME", hex: "E60012" },

  // ---- 通信 / 运营商 ----
  { aliases: ["中国移动", "移动", "china mobile"], wordmark: "中国移动", hex: "0085D0" },
  { aliases: ["中国电信", "电信", "china telecom"], wordmark: "中国电信", hex: "2037AC" },
  { aliases: ["中国联通", "联通", "china unicom"], wordmark: "中国联通", hex: "E60012" },
  { aliases: ["中国铁塔", "铁塔", "tower"], wordmark: "铁塔", hex: "005BAB" },
  { aliases: ["中兴", "zte"], wordmark: "ZTE", hex: "003D79" },

  // ---- 银行 / 金融 ----
  { aliases: ["工商银行", "工行", "icbc"], wordmark: "ICBC", hex: "C41230" },
  { aliases: ["建设银行", "建行", "ccb"], wordmark: "CCB", hex: "003B8F" },
  { aliases: ["农业银行", "农行", "abc"], wordmark: "ABC", hex: "008C4C" },
  { aliases: ["中国银行", "中行", "boc"], wordmark: "BOC", hex: "A71E32" },
  { aliases: ["招商银行", "招行", "cmb"], wordmark: "CMB", hex: "E60012" },
  { aliases: ["平安", "平安银行", "ping an", "pa"], wordmark: "平安", hex: "FF6A00" },
  { aliases: ["浦发银行", "浦发", "spdb"], wordmark: "SPDB", hex: "1D4E89" },
  { aliases: ["中信银行", "中信", "citic"], wordmark: "CITIC", hex: "E60012" },
  { aliases: ["光大银行", "光大", "ceb"], wordmark: "CEB", hex: "3B8CFF" },
  { aliases: ["华夏银行", "华夏", "hxb"], wordmark: "HXB", hex: "E60012" },
  { aliases: ["民生银行", "民生", "cmbc"], wordmark: "CMBC", hex: "0096D6" },
  { aliases: ["兴业银行", "兴业", "cib"], wordmark: "CIB", hex: "003D79" },
  { aliases: ["广发银行", "广发", "cgb"], wordmark: "CGB", hex: "E60012" },
  { aliases: ["北京银行", "北京", "bob"], wordmark: "BOB", hex: "A71E32" },
  { aliases: ["上海银行", "上海", "bos"], wordmark: "BOS", hex: "003D79" },
  { aliases: ["南京银行", "南京", "njcb"], wordmark: "NJCB", hex: "E60012" },
  { aliases: ["江苏银行", "江苏", "jsb"], wordmark: "JSB", hex: "003D79" },
  { aliases: ["宁波银行", "宁波", "nbcb"], wordmark: "NBCB", hex: "003D79" },
  { aliases: ["交通银行", "交行", "bocom"], wordmark: "BOCOM", hex: "003D79" },
  { aliases: ["邮储银行", "邮储", "psbc"], wordmark: "PSBC", hex: "007E3A" },
  { aliases: ["汇丰", "hsbc"], icon: siHsbc },
  { aliases: ["渣打", "standard chartered"], wordmark: "SC", hex: "006699" },
  { aliases: ["花旗", "citibank", "citi"], wordmark: "CITI", hex: "003B70" },
  { aliases: ["摩根大通", "jp morgan", "jpmorgan"], wordmark: "JPM", hex: "005EB8" },
  { aliases: ["摩根士丹利", "morgan stanley"], wordmark: "MS", hex: "003087" },
  { aliases: ["高盛", "goldman sachs", "goldman"], icon: siGoldmansachs },
  { aliases: ["美国银行", "bank of america"], icon: siBankofamerica },
  { aliases: ["富国银行", "wells fargo"], icon: siWellsfargo },

  // ---- 咨询 / 专业服务 ----
  { aliases: ["埃森哲", "accenture"], icon: siAccenture },
  { aliases: ["德勤", "deloitte"], wordmark: "Deloitte", hex: "86BC25" },
  { aliases: ["普华永道", "pwc"], wordmark: "PwC", hex: "D93954" },
  { aliases: ["毕马威", "kpmg"], wordmark: "KPMG", hex: "00338D" },
  { aliases: ["安永", "ernst", "ey"], wordmark: "EY", hex: "003D79" },
  { aliases: ["麦肯锡", "mckinsey"], wordmark: "McK", hex: "0036FF" },
  { aliases: ["波士顿咨询", "bcg"], wordmark: "BCG", hex: "003D79" },
  { aliases: ["贝恩", "bain"], wordmark: "Bain", hex: "CC0000" },

  // ---- 汽车 / 出行 ----
  { aliases: ["比亚迪", "byd"], wordmark: "BYD", hex: "009944" },
  { aliases: ["吉利", "geely"], wordmark: "GEELY", hex: "003D79" },
  { aliases: ["长城", "great wall", "gwm"], wordmark: "GWM", hex: "C41230" },
  { aliases: ["长安", "changan"], wordmark: "CHANGAN", hex: "003D79" },
  { aliases: ["广汽", "gac"], wordmark: "GAC", hex: "003D79" },
  { aliases: ["一汽", "faw"], wordmark: "FAW", hex: "C41230" },
  { aliases: ["东风", "dongfeng"], wordmark: "DFM", hex: "003D79" },
  { aliases: ["奇瑞", "chery"], wordmark: "CHERY", hex: "003D79" },
  { aliases: ["上汽", "saic"], wordmark: "SAIC", hex: "003D79" },
  { aliases: ["北汽", "baic"], wordmark: "BAIC", hex: "C41230" },
  { aliases: ["蔚来", "nio"], wordmark: "NIO", hex: "0066FF" },
  { aliases: ["小鹏", "xpeng"], wordmark: "XPENG", hex: "FF6A00" },
  { aliases: ["理想", "li auto", "liauto"], wordmark: "Li", hex: "003D79" },
  { aliases: ["极氪", "zeekr"], wordmark: "ZEEKR", hex: "000000" },
  { aliases: ["问界", "aito"], wordmark: "AITO", hex: "000000" },
  { aliases: ["赛力斯", "seres"], wordmark: "SERES", hex: "000000" },
  { aliases: ["零跑", "leapmotor"], wordmark: "LEAPMOTOR", hex: "003D79" },
  { aliases: ["哪吒", "neta"], wordmark: "NETA", hex: "003D79" },
  { aliases: ["小米汽车", "xiaomi ev"], wordmark: "小米", hex: "FF6900" },

  // ---- 半导体 / 硬件 ----
  { aliases: ["海康威视", "hikvision"], wordmark: "HIKVISION", hex: "003D79" },
  { aliases: ["大华", "dahua"], wordmark: "DAHUA", hex: "FF6A00" },
  { aliases: ["科大讯飞", "iflytek"], wordmark: "科大讯飞", hex: "FF6A00" },
  { aliases: ["商汤", "sensetime"], wordmark: "SenseTime", hex: "000000" },
  { aliases: ["寒武纪", "cambricon"], wordmark: "Cambricon", hex: "003D79" },
  { aliases: ["比特大陆", "bitmain"], wordmark: "BITMAIN", hex: "000000" },
  { aliases: ["地平线", "horizon"], wordmark: "Horizon", hex: "FF6A00" },
  { aliases: ["中芯国际", "smic"], wordmark: "SMIC", hex: "003D79" },
  { aliases: ["台积电", "tsmc"], wordmark: "TSMC", hex: "003D79" },
  { aliases: ["联发科", "mediatek"], icon: siMediatek },
  { aliases: ["英伟达", "nvidia"], icon: siNvidia },
  { aliases: ["英特尔", "intel"], icon: siIntel },
  { aliases: ["超威", "amd"], icon: siAmd },
  { aliases: ["高通", "qualcomm"], icon: siQualcomm },
  { aliases: ["三星", "samsung"], icon: siSamsung },

  // ---- 快消 / 零售 / 食品 ----
  { aliases: ["温氏股份", "温氏", "wens"], wordmark: "WENS", hex: "009944" },
  { aliases: ["伊利", "yili"], wordmark: "伊利", hex: "008C4C" },
  { aliases: ["蒙牛", "mengniu"], wordmark: "蒙牛", hex: "0099CC" },
  { aliases: ["茅台", "moutai"], wordmark: "MOUTAI", hex: "A71E32" },
  { aliases: ["农夫山泉", "nongfu"], wordmark: "农夫山泉", hex: "008C4C" },
  { aliases: ["娃哈哈", "wahaha"], wordmark: "娃哈哈", hex: "008C4C" },
  { aliases: ["统一", "uni-president", "president"], wordmark: "统一", hex: "E60012" },
  { aliases: ["康师傅", "master kong", "kong"], wordmark: "康师傅", hex: "E60012" },
  { aliases: ["雀巢", "nestle"], wordmark: "Nestlé", hex: "0099CC" },
  { aliases: ["联合利华", "unilever"], icon: siUnilever },
  { aliases: ["宝洁", "pg", "procter"], wordmark: "P&G", hex: "003D79" },
  { aliases: ["可口可乐", "coca-cola", "coca"], icon: siCocacola },
  { aliases: ["百事", "pepsi"], wordmark: "PEPSI", hex: "004883" },
  { aliases: ["欧莱雅", "loreal"], wordmark: "L'Oréal", hex: "000000" },
  { aliases: ["耐克", "nike"], icon: siNike },
  { aliases: ["阿迪达斯", "adidas"], icon: siAdidas },
  { aliases: ["彪马", "puma"], icon: siPuma },
  { aliases: ["安踏", "anta"], wordmark: "ANTA", hex: "E60012" },
  { aliases: ["李宁", "li-ning", "lining"], wordmark: "LI-NING", hex: "E60012" },
  { aliases: ["优衣库", "uniqlo"], icon: siUniqlo },
  { aliases: ["迪卡侬", "decathlon"], wordmark: "Decathlon", hex: "008C4C" },
  { aliases: ["沃尔玛", "walmart"], wordmark: "Walmart", hex: "0071CE" },
  { aliases: ["家乐福", "carrefour"], wordmark: "Carrefour", hex: "0046AD" },
  { aliases: ["永辉", "yh"], wordmark: "YH", hex: "E60012" },
  { aliases: ["海底捞", "haidilao"], wordmark: "海底捞", hex: "C41230" },

  // ---- 能源 / 制造 / 其他 ----
  { aliases: ["国家电网", "国网", "state grid"], wordmark: "国家电网", hex: "006633" },
  { aliases: ["中石油", "petrochina", "cnpc"], wordmark: "CNPC", hex: "C41230" },
  { aliases: ["中石化", "sinopec"], wordmark: "SINOPEC", hex: "E60012" },
  { aliases: ["中国建筑", "中建", "cscec"], wordmark: "CSCEC", hex: "003D79" },
  { aliases: ["中国中铁", "中铁", "crec"], wordmark: "CREC", hex: "003D79" },
  { aliases: ["中国铁建", "铁建", "crcc"], wordmark: "CRCC", hex: "003D79" },
  { aliases: ["格力", "gree"], wordmark: "GREE", hex: "003D79" },
  { aliases: ["美的", "midea"], wordmark: "Midea", hex: "008C4C" },
  { aliases: ["海尔", "haier"], wordmark: "Haier", hex: "003D79" },
  { aliases: ["海信", "hisense"], wordmark: "Hisense", hex: "003D79" },
  { aliases: ["TCL"], wordmark: "TCL", hex: "003D79" },
  { aliases: ["京东方", "boe"], wordmark: "BOE", hex: "003D79" },
  { aliases: ["立讯精密", "luxshare"], wordmark: "Luxshare", hex: "003D79" },
  { aliases: ["工业富联", "fii"], wordmark: "Fii", hex: "003D79" },
  { aliases: ["隆基", "longi"], wordmark: "LONGi", hex: "009944" },
  { aliases: ["宁德时代", "catl"], wordmark: "CATL", hex: "003D79" },

  // ---- 外企 / 外资 ----
  { aliases: ["脸书", "meta", "facebook"], wordmark: "Meta", hex: "0668E1" },
  { aliases: ["甲骨文", "oracle"], wordmark: "Oracle", hex: "F80000" },
  { aliases: ["SAP"], wordmark: "SAP", hex: "0FAAFF" },
  { aliases: ["西门子", "siemens"], wordmark: "Siemens", hex: "009999" },
  { aliases: ["博世", "bosch"], wordmark: "BOSCH", hex: "E2001A" },
  { aliases: ["博通", "broadcom"], icon: siBroadcom },
  { aliases: ["优食", "uber eats"], icon: siUbereats },
  { aliases: ["飞利浦", "philips"], wordmark: "Philips", hex: "0F47AF" },
  { aliases: ["松下", "panasonic"], wordmark: "Panasonic", hex: "003D79" },
  { aliases: ["索尼", "sony"], wordmark: "SONY", hex: "000000" },
  { aliases: ["三星电子", "samsung"], wordmark: "SAMSUNG", hex: "1428A0" },
  { aliases: ["LG"], wordmark: "LG", hex: "A50034" },
  { aliases: ["现代", "hyundai"], icon: siHyundai },
  { aliases: ["起亚", "kia"], wordmark: "KIA", hex: "C41230" },
  { aliases: ["丰田", "toyota"], wordmark: "TOYOTA", hex: "EB0A1E" },
  { aliases: ["本田", "honda"], wordmark: "HONDA", hex: "CC0000" },
  { aliases: ["日产", "nissan"], wordmark: "NISSAN", hex: "C3002F" },
  { aliases: ["宝马", "bmw"], wordmark: "BMW", hex: "0066B1" },
  { aliases: ["奔驰", "mercedes"], wordmark: "MB", hex: "000000" },
  { aliases: ["奥迪", "audi"], wordmark: "AUDI", hex: "BB0A30" },
  { aliases: ["大众", "volkswagen", "vw"], wordmark: "VW", hex: "0099DA" },
  { aliases: ["通用", "gm"], wordmark: "GM", hex: "003D79" },
  { aliases: ["福特", "ford"], wordmark: "Ford", hex: "003478" },
  { aliases: ["空客", "airbus"], icon: siAirbus },
  { aliases: ["波音", "boeing"], icon: siBoeing },
  { aliases: ["强生", "jnj", "johnson"], wordmark: "J&J", hex: "E2001A" },
  { aliases: ["辉瑞", "pfizer"], wordmark: "Pfizer", hex: "0093D0" },
  { aliases: ["罗氏", "roche"], wordmark: "Roche", hex: "C41230" },
  { aliases: ["爱彼迎", "airbnb"], icon: siAirbnb },
  { aliases: ["优步", "uber"], icon: siUber },
  { aliases: ["booking", "booking.com"], wordmark: "Booking", hex: "003580" },
  { aliases: ["爱马仕", "hermes"], icon: siHermes },
  { aliases: ["迪奥", "dior"], icon: siDior },
  { aliases: ["ZARA"], wordmark: "ZARA", hex: "000000" }
];

export const normalizeBrandName = (value: string) =>
  value
    .toLowerCase()
    .replace(/[（(][^）)]*[）)]/g, "")
    .replace(
      /集团|控股|股份|科技|有限责任|有限公司|公司|中国|china|inc\.?|group|holdings|corp\.?|co\.?\s*ltd\.?/g,
      ""
    )
    .replace(/[\s·._-]+/g, "");

export const resolveBrand = (company: string) => {
  const normalizedCompany = normalizeBrandName(company);
  if (!normalizedCompany) return undefined;
  return BRANDS.find((brand) =>
    brand.aliases.some((alias) => {
      const normalizedAlias = normalizeBrandName(alias);
      if (!normalizedAlias) return false;
      return normalizedCompany.includes(normalizedAlias);
    })
  );
};

export const fallbackMark = (company: string) => {
  const latin = company.match(/[A-Za-z0-9]+/)?.[0];
  if (latin) return latin.slice(0, 2).toUpperCase();
  return company.replace(/[（(].*$/, "").trim().slice(0, 1) || "企";
};
