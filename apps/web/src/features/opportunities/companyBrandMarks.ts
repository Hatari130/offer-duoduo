import type { SimpleIcon } from "simple-icons";
import {
  siAccenture,
  siAdidas,
  siAlibabadotcom,
  siAlipay,
  siAnta,
  siApple,
  siBaidu,
  siBilibili,
  siBytedance,
  siCocacola,
  siDji,
  siHuawei,
  siIntel,
  siKuaishou,
  siLenovo,
  siMeituan,
  siMihoyo,
  siNike,
  siNvidia,
  siOppo,
  siSinaweibo,
  siTesla,
  siTripdotcom,
  siUnilever,
  siVivo,
  siXiaohongshu,
  siXiaomi,
  siZhihu
} from "simple-icons";

interface CompanyBrandMark {
  aliases: string[];
  color: string;
  icon?: SimpleIcon;
  wordmark?: string;
}

const mark = (
  aliases: string[],
  color: string,
  icon?: SimpleIcon,
  wordmark?: string
): CompanyBrandMark => ({ aliases, color, icon, wordmark });

// SVG paths are bundled with the app. Text marks cover brands that do not have
// an entry in Simple Icons, so this component never depends on remote favicons.
const companyBrandMarks: CompanyBrandMark[] = [
  mark(["字节跳动", "bytedance"], siBytedance.hex, siBytedance),
  mark(["阿里巴巴", "alibaba"], siAlibabadotcom.hex, siAlibabadotcom),
  mark(["蚂蚁集团", "antgroup", "alipay"], siAlipay.hex, siAlipay),
  mark(["百度", "baidu"], siBaidu.hex, siBaidu),
  mark(["美团", "meituan"], siMeituan.hex, siMeituan),
  mark(["哔哩哔哩", "bilibili"], siBilibili.hex, siBilibili),
  mark(["快手", "kuaishou"], siKuaishou.hex, siKuaishou),
  mark(["小红书", "xiaohongshu"], siXiaohongshu.hex, siXiaohongshu),
  mark(["携程", "tripcom", "ctrip"], siTripdotcom.hex, siTripdotcom),
  mark(["知乎", "zhihu"], siZhihu.hex, siZhihu),
  mark(["新浪", "weibo"], siSinaweibo.hex, siSinaweibo),
  mark(["华为", "huawei"], siHuawei.hex, siHuawei),
  mark(["小米", "xiaomi"], siXiaomi.hex, siXiaomi),
  mark(["联想", "lenovo"], siLenovo.hex, siLenovo),
  mark(["oppo"], siOppo.hex, siOppo),
  mark(["vivo"], siVivo.hex, siVivo),
  mark(["大疆", "dji"], siDji.hex, siDji),
  mark(["苹果", "apple"], siApple.hex, siApple),
  mark(["英特尔", "intel"], siIntel.hex, siIntel),
  mark(["英伟达", "nvidia"], siNvidia.hex, siNvidia),
  mark(["特斯拉", "tesla"], siTesla.hex, siTesla),
  mark(["耐克", "nike"], siNike.hex, siNike),
  mark(["阿迪达斯", "adidas"], siAdidas.hex, siAdidas),
  mark(["可口可乐", "cocacola"], siCocacola.hex, siCocacola),
  mark(["联合利华", "unilever"], siUnilever.hex, siUnilever),
  mark(["埃森哲", "accenture"], siAccenture.hex, siAccenture),
  mark(["腾讯", "tencent"], "0052D9", undefined, "腾讯"),
  mark(["京东", "jd"], "E1251B", undefined, "JD"),
  mark(["网易", "netease"], "D43C33", undefined, "网易"),
  mark(["拼多多", "pdd"], "E02E24", undefined, "PDD"),
  mark(["滴滴", "didi"], "FF7D41", undefined, "DiDi"),
  mark(["招商银行", "cmb"], "C41230", undefined, "CMB"),
  mark(["工商银行", "icbc"], "C41230", undefined, "ICBC"),
  mark(["建设银行", "ccb"], "003B8F", undefined, "CCB"),
  mark(["中国银行", "boc"], "A71E32", undefined, "BOC"),
  mark(["农业银行", "abc"], "008C4C", undefined, "ABC"),
  mark(["交通银行", "bocom"], "003D79", undefined, "BOCOM"),
  mark(["邮储银行", "psbc"], "007E3A", undefined, "PSBC"),
  mark(["平安", "pingan"], "F58A3D", undefined, "平安"),
  mark(["欧莱雅", "loreal"], "111111", undefined, "L'Oréal"),
  mark(["宝洁", "procter", "pg"], "003DA5", undefined, "P&G"),
  mark(["百事", "pepsi"], "004B93", undefined, "PEPSI"),
  mark(["安踏", "anta"], siAnta.hex, siAnta),
  mark(["李宁", "lining"], "D71920", undefined, "LI-NING"),
  mark(["比亚迪", "byd"], "E60012", undefined, "BYD"),
  mark(["宁德时代", "catl"], "004B87", undefined, "CATL"),
  mark(["海康威视", "hikvision"], "D91E1E", undefined, "HIK"),
  mark(["京东方", "boe"], "0072CE", undefined, "BOE"),
  mark(["中芯国际", "smic"], "005BAC", undefined, "SMIC"),
  mark(["麦肯锡", "mckinsey"], "194F90", undefined, "McK"),
  mark(["波士顿咨询", "bcg"], "00856A", undefined, "BCG"),
  mark(["贝恩", "bain"], "CC0000", undefined, "Bain"),
  mark(["普华永道", "pwc"], "D04A02", undefined, "PwC"),
  mark(["德勤", "deloitte"], "86BC25", undefined, "Deloitte"),
  mark(["安永", "ey"], "FFE600", undefined, "EY"),
  mark(["毕马威", "kpmg"], "00338D", undefined, "KPMG"),
  mark(["蔚来", "nio"], "00BCD4", undefined, "NIO"),
  mark(["小鹏", "xpeng"], "00B462", undefined, "XPENG"),
  mark(["理想汽车", "liauto"], "0066B3", undefined, "理想"),
  mark(["吉利", "geely"], "1E5AA8", undefined, "GEELY"),
  mark(["强生", "jnj"], "D51920", undefined, "J&J"),
  mark(["辉瑞", "pfizer"], "0093D0", undefined, "Pfizer"),
  mark(["罗氏", "roche"], "0B41A0", undefined, "Roche"),
  mark(["米哈游", "mihoyo"], siMihoyo.hex, siMihoyo),
  mark(["腾讯音乐", "tme"], "0052D9", undefined, "TME")
];

const normalize = (value: string) => value
  .toLocaleLowerCase("zh-CN")
  .replace(/[^\p{L}\p{N}]/gu, "");

export function resolveCompanyBrandMark(company: string): CompanyBrandMark | undefined {
  const candidate = normalize(company);
  return companyBrandMarks.find((brand) => brand.aliases.some((alias) => {
    const normalizedAlias = normalize(alias);
    return candidate.includes(normalizedAlias) || normalizedAlias.includes(candidate);
  }));
}
