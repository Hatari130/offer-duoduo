export type CompanyCategoryId =
  | "internet"
  | "finance"
  | "consumer"
  | "hardware"
  | "professional"
  | "mobility"
  | "healthcare"
  | "entertainment";

export interface CompanyDirectoryEntry {
  name: string;
  shortName: string;
  aliases: string[];
  careerUrl: string;
}

export interface CompanyDirectoryCategory {
  id: CompanyCategoryId;
  label: string;
  description: string;
  companies: CompanyDirectoryEntry[];
}

const company = (
  name: string,
  shortName: string,
  careerUrl: string,
  aliases: string[] = []
): CompanyDirectoryEntry => ({ name, shortName, careerUrl, aliases: [name, ...aliases] });

export const companyDirectory: CompanyDirectoryCategory[] = [
  {
    id: "internet",
    label: "互联网与 AI",
    description: "平台、内容、电商与人工智能",
    companies: [
      company("字节跳动", "字节", "https://jobs.bytedance.com/campus", ["ByteDance", "字节"]),
      company("腾讯", "腾讯", "https://join.qq.com/", ["Tencent"]),
      company("阿里巴巴", "阿里", "https://talent.alibaba.com/campus", ["阿里", "Alibaba"]),
      company("美团", "美团", "https://zhaopin.meituan.com/web/campus", ["Meituan"]),
      company("百度", "百度", "https://talent.baidu.com/jobs/list", ["Baidu"]),
      company("京东", "京东", "https://campus.jd.com/", ["京东集团", "JD"]),
      company("快手", "快手", "https://campus.kuaishou.cn/", ["Kuaishou"]),
      company("小红书", "小红", "https://job.xiaohongshu.com/", ["XHS"]),
      company("网易", "网易", "https://campus.163.com/", ["NetEase"]),
      company("拼多多", "拼多", "https://careers.pddglobalhr.com/campus", ["PDD"]),
      company("哔哩哔哩", "B站", "https://jobs.bilibili.com/", ["B站", "bilibili"]),
      company("携程集团", "携程", "https://campus.ctrip.com/", ["携程", "Trip.com", "Ctrip"]),
      company("滴滴", "DiDi", "https://talent.didiglobal.com/campus", ["滴滴出行", "Didi"]),
      company("蚂蚁集团", "蚂蚁", "https://talent.antgroup.com/campus", ["蚂蚁金服", "Ant Group"]),
      company("知乎", "知乎", "https://www.zhihu.com/careers", ["Zhihu"]),
      company("得物 App", "得物", "https://campus.dewu.com/", ["得物", "识装信息科技"]),
      company("新浪", "新浪", "https://career.sina.com.cn/", ["新浪集团", "Sina"]),
      company("度小满", "度小满", "https://campus.duxiaoman.com/", ["度小满金融", "Du Xiaoman"]),
      company("作业帮", "作业帮", "https://app.mokahr.com/campus-recruitment/zuoyebang/144908", ["Zuoyebang"])
    ]
  },
  {
    id: "finance",
    label: "银行与金融",
    description: "国有大行、股份行与综合金融",
    companies: [
      company("招商银行", "招行", "https://career.cmbchina.com/", ["招行", "CMB"]),
      company("中国工商银行", "工行", "https://job.icbc.com.cn/", ["工商银行", "工行", "ICBC"]),
      company("中国建设银行", "建行", "http://job2.ccb.com/cn/job/index.html", ["建设银行", "建行", "CCB"]),
      company("中国银行", "中行", "https://www.boc.cn/aboutboc/bi4/", ["中行", "BOC"]),
      company("中国农业银行", "农行", "https://career.abchina.com/", ["农业银行", "农行", "ABC"]),
      company("交通银行", "交行", "https://job.bankcomm.com/", ["交行", "BOCOM"]),
      company("平安银行", "平安", "https://campus.pingan.com/", ["Ping An Bank"]),
      company("中信银行", "中信", "https://job.citicbank.com/", ["CITIC"]),
      company("浦发银行", "浦发", "https://job.spdb.com.cn/", ["上海浦东发展银行", "SPDB"]),
      company("中国邮政储蓄银行", "邮储", "https://psbc2026.zhaopin.com/", ["邮储银行", "PSBC"]),
      company("兴业银行", "兴业", "https://job.cib.com.cn/", ["CIB"]),
      company("中国民生银行", "民生", "https://career.cmbc.com.cn/", ["民生银行", "CMBC"]),
      company("中国光大银行", "光大", "https://cebbank.51job.com/", ["光大银行", "CEB"]),
      company("广发银行", "广发", "https://www.cgbchina.com.cn/career/", ["广东发展银行", "CGB"]),
      company("厦门银行", "厦行", "https://xmbank.mokahr.vip/campus-recruitment/xmbankonline/182209/", ["Xiamen Bank"]),
      company("中国平安", "平安", "https://campus.pingan.com/freshGraduates", ["平安集团", "Ping An"]),
      company("光大证券", "光证", "https://ebscn.zhiye.com/campus", ["Everbright Securities"])
    ]
  },
  {
    id: "consumer",
    label: "品牌与消费",
    description: "美妆、快消、食品与生活方式",
    companies: [
      company("欧莱雅", "L'Oréal", "https://careers.loreal.com/zh_CN/content/ChinaCampus", ["L'Oreal", "Loreal"]),
      company("宝洁", "P&G", "https://www.pgcareers.com/cn/zh/", ["Procter & Gamble", "P&G"]),
      company("联合利华", "联合", "https://careers.unilever.com/china", ["Unilever"]),
      company("雀巢", "雀巢", "https://www.nestle.com.cn/jobs", ["Nestle"]),
      company("可口可乐", "可口", "https://www.coca-colacompany.com/careers", ["Coca-Cola"]),
      company("百事公司", "百事", "https://www.pepsicojobs.com/main/", ["百事", "PepsiCo"]),
      company("耐克", "NIKE", "https://jobs.nike.com/zh-cn/", ["Nike"]),
      company("阿迪达斯", "adidas", "https://careers.adidas-group.com/", ["Adidas"]),
      company("雅诗兰黛", "雅诗", "https://www.elcompanies.com/en/careers", ["Estée Lauder", "Estee Lauder"]),
      company("玛氏", "Mars", "https://careers.mars.com/cn/zh", ["Mars"]),
      company("SHEIN", "SHEIN", "https://careers.shein.com/", ["希音"]),
      company("安踏集团", "ANTA", "https://career.anta.com/", ["安踏", "ANTA"]),
      company("李宁", "李宁", "https://career.lining.com/", ["李宁公司", "Li-Ning"]),
      company("泡泡玛特", "POP", "https://www.popmart.com/cn/careers", ["POP MART"]),
      company("蒙牛乳业", "蒙牛", "https://mengniu.zhiye.com/campus", ["蒙牛", "Mengniu"]),
      company("Babycare", "Babycare", "https://babycare.zhiye.com/campus", ["白贝壳"]),
      company("卫龙美味", "卫龙", "https://weilongmeiwei.jobs.feishu.cn/index/position/list", ["卫龙", "Weilong"])
    ]
  },
  {
    id: "hardware",
    label: "硬件与智能制造",
    description: "终端、消费电子、汽车与先进制造",
    companies: [
      company("华为", "华为", "https://career.huawei.com/reccampportal/portal5/campus-recruitment.html", ["Huawei"]),
      company("小米", "小米", "https://hr.xiaomi.com/campus", ["小米集团", "Xiaomi"]),
      company("联想", "Lenovo", "https://talent.lenovo.com.cn/", ["联想集团", "Lenovo"]),
      company("OPPO", "OPPO", "https://careers.oppo.com/campus", ["广东欧珀"]),
      company("vivo", "vivo", "https://hr-campus.vivo.com/", ["维沃"]),
      company("大疆创新", "DJI", "https://we.dji.com/zh-CN/campus", ["大疆", "DJI"]),
      company("荣耀", "HONOR", "https://career.hihonor.com/", ["荣耀终端", "Honor"]),
      company("海尔", "海尔", "https://maker.haier.net/client/campus", ["海尔集团", "Haier"]),
      company("美的集团", "美的", "https://careers.midea.com/schoolOut", ["美的", "Midea"]),
      company("比亚迪", "BYD", "https://job.byd.com/", ["BYD"]),
      company("宁德时代", "CATL", "https://career.catl.com/", ["CATL"]),
      company("海康威视", "海康", "https://campushr.hikvision.com/", ["Hikvision"]),
      company("TCL 科技", "TCL", "https://career.tcl.com/", ["TCL"]),
      company("海信集团", "海信", "https://hisense.zhiye.com/campus", ["海信", "Hisense"]),
      company("格力电器", "格力", "https://gree.zhiye.com/campus", ["格力", "Gree"]),
      company("安克创新", "Anker", "https://anker-in.com/campus.html", ["Anker"]),
      company("传音控股", "TECNO", "https://transsion.zhiye.com/campus", ["传音", "Transsion"]),
      company("苹果", "Apple", "https://jobs.apple.com/zh-cn/search", ["Apple苹果", "Apple"]),
      company("英特尔中国", "Intel", "https://chinacampus.jobs.intel.cn/intel/home/index/", ["英特尔", "Intel China"]),
      company("英伟达", "NVIDIA", "https://app.mokahr.com/campus-recruitment/nvidia/47111", ["NVIDIA英伟达", "NVIDIA"]),
      company("TP-Link 联洲", "TP-Link", "https://join.tplinkglobal.com/campus", ["TP-Link联洲", "联洲国际"]),
      company("京东方", "BOE", "https://campus.boe.com/", ["京东方科技集团", "BOE"]),
      company("新华三集团", "H3C", "https://career.h3c.com/campus/jobs", ["新华三", "H3C"]),
      company("中芯国际", "SMIC", "https://smics.zhiye.com/campus", ["SMIC"]),
      company("地平线", "Horizon", "https://wecruit.hotjob.cn/SU6409ef49bef57c635fd390a6/pb/school.html", ["北京地平线", "Horizon Robotics"]),
      company("大华股份", "Dahua", "https://job.dahuatech.com/", ["大华技术", "Dahua"])
    ]
  },
  {
    id: "professional",
    label: "咨询与专业服务",
    description: "战略咨询、审计、数字化与企业服务",
    companies: [
      company("麦肯锡", "McK", "https://www.mckinsey.com/careers/search-jobs", ["McKinsey"]),
      company("波士顿咨询", "BCG", "https://careers.bcg.com/", ["BCG", "Boston Consulting Group"]),
      company("贝恩公司", "Bain", "https://www.bain.com/careers/", ["贝恩咨询", "Bain & Company"]),
      company("普华永道", "PwC", "https://www.pwccn.com/zh/careers.html", ["PwC"]),
      company("德勤", "Deloitte", "https://www2.deloitte.com/cn/zh/careers.html", ["Deloitte"]),
      company("安永", "EY", "https://www.ey.com/zh_cn/careers", ["Ernst & Young"]),
      company("毕马威", "KPMG", "https://kpmg.com/cn/zh/home/careers.html", ["KPMG"]),
      company("埃森哲", "Accenture", "https://www.accenture.com/cn-zh/careers", ["Accenture"]),
      company("艾意凯咨询", "L.E.K.", "https://lek.tal.net/", ["L.E.K.中国 艾意凯咨询", "LEK", "L.E.K. Consulting"]),
      company("罗兰贝格", "RB", "https://www.rolandberger.com/en/Join/All-Jobs/", ["Roland Berger"])
    ]
  },
  {
    id: "mobility",
    label: "汽车与新能源",
    description: "智能汽车、出行科技与新能源产业",
    companies: [
      company("特斯拉", "Tesla", "https://www.tesla.cn/careers/search/", ["Tesla"]),
      company("蔚来", "NIO", "https://www.nio.cn/careers", ["蔚来汽车", "NIO"]),
      company("小鹏汽车", "XPENG", "https://job.xiaopeng.com/", ["小鹏", "XPeng"]),
      company("理想汽车", "理想", "https://www.lixiang.com/careers", ["理想", "Li Auto"]),
      company("极氪", "ZEEKR", "https://zeekrglobal.com/careers", ["极氪汽车", "Zeekr"]),
      company("吉利汽车", "吉利", "https://campus.geely.com/", ["吉利集团", "吉利控股集团", "吉利控股", "Geely"]),
      company("长城汽车", "长城", "https://career.gwm.com.cn/", ["GWM"]),
      company("上汽集团", "上汽", "https://career.saicmotor.com/", ["上海汽车集团", "SAIC"]),
      company("东风汽车", "东风", "https://app.mokahr.com/campus-recruitment/dfmc/168424", ["东风汽车研发总院", "东风集团", "Dongfeng"])
    ]
  },
  {
    id: "healthcare",
    label: "医药与医疗",
    description: "创新药、医疗器械与生命科学",
    companies: [
      company("强生", "J&J", "https://www.careers.jnj.com/", ["Johnson & Johnson"]),
      company("罗氏", "Roche", "https://careers.roche.com/global/en", ["Roche"]),
      company("辉瑞", "Pfizer", "https://www.pfizer.com/about/careers", ["Pfizer"]),
      company("阿斯利康", "AZ", "https://careers.astrazeneca.com/", ["AstraZeneca"]),
      company("诺华", "Novartis", "https://www.novartis.com/careers", ["Novartis"]),
      company("赛诺菲", "Sanofi", "https://jobs.sanofi.com/", ["Sanofi"]),
      company("葛兰素史克", "GSK", "https://www.gsk.com/en-gb/careers/", ["GSK"]),
      company("拜耳", "Bayer", "https://career.bayer.cn/", ["Bayer"]),
      company("镁信健康", "镁信", "https://jobs.meditrusthealth.com/campus", ["MediTrust Health"]),
      company("英科医疗", "INTCO", "https://global-intco.jobs.feishu.cn/840753/position/list", ["INTCO Medical"]),
      company("大参林医药集团", "大参林", "https://campus.dslyy.com/campus-recruitment/dslyy/136052", ["大参林", "Dashenlin"])
    ]
  },
  {
    id: "entertainment",
    label: "游戏与文娱",
    description: "游戏研发、音乐、视频与数字内容",
    companies: [
      company("米哈游", "miHoYo", "https://jobs.mihoyo.com/", ["miHoYo", "HoYoverse"]),
      company("莉莉丝游戏", "Lilith", "https://www.lilith.com/cn/career", ["莉莉丝", "Lilith Games"]),
      company("叠纸游戏", "叠纸", "https://career.papegames.com/", ["叠纸", "Papergames"]),
      company("完美世界", "完美", "https://recruit.wanmei.com/", ["完美世界游戏", "Perfect World"]),
      company("腾讯音乐", "TME", "https://careers.tencentmusic.com/", ["腾讯音乐娱乐集团", "TME"]),
      company("爱奇艺", "iQIYI", "https://careers.iqiyi.com/", ["IQIYI"]),
      company("芒果 TV", "芒果", "https://career.mgtv.com/", ["芒果TV", "Mango TV"]),
      company("快看漫画", "快看", "https://www.kuaikanmanhua.com/webs/careers", ["快看", "Kuaikan"]),
      company("三七互娱", "37", "https://app.mokahr.com/campus-recruitment/37/58016", ["37 Interactive Entertainment"]),
      company("巨人网络", "Giant", "https://app.mokahr.com/campus-recruitment/ztgame/92438", ["巨人集团", "Giant Network"]),
      company("鹰角网络", "鹰角", "https://app.mokahr.com/campus-recruitment/hypergryph/26326", ["Hypergryph"])
    ]
  }
];

export const companyDirectoryCount = companyDirectory.reduce(
  (total, category) => total + category.companies.length,
  0
);
