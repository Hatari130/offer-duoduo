import type {
  ApplicationStage,
  DeepSeekExtraction,
  ExtractedJob,
  FormFieldMatch,
  OfferFlowSettings,
  PersonalProfile,
  ProfileFieldKey
} from "@/shared/types";
import { isRecruitmentCampaignCompany, normalizeExternalStage } from "@/features/workspace/workspaceUtils";

const API_URL = "https://api.deepseek.com/chat/completions";
const MODELS_URL = "https://api.deepseek.com/models";
export const DEFAULT_DEEPSEEK_MODEL = "deepseek-chat";

type ModelApplication = {
  company?: string;
  position?: string;
  department?: string;
  job_id?: string;
  city?: string;
  job_type?: string;
  stage?: string;
  summary?: string;
  responsibilities?: string[];
  requirements?: string[];
  confidence?: number;
};

type ModelResponse = {
  page_type?: DeepSeekExtraction["pageType"];
  applications?: ModelApplication[];
};

type FormMatchResponse = {
  matches?: Array<{
    id?: string;
    key?: string;
    confidence?: number;
    reason?: string;
  }>;
};

const FORM_PROFILE_FIELDS: Array<{ key: ProfileFieldKey; label: string }> = [
  { key: "fullName", label: "姓名" },
  { key: "gender", label: "性别" },
  { key: "phone", label: "手机号" },
  { key: "email", label: "邮箱" },
  { key: "birthDate", label: "出生日期" },
  { key: "graduationDate", label: "毕业时间" },
  { key: "currentCity", label: "现居城市" },
  { key: "nativePlace", label: "籍贯" },
  { key: "height", label: "身高" },
  { key: "weight", label: "体重" },
  { key: "recruitmentType", label: "是否统招" },
  { key: "graduateStatus", label: "应届或往届" },
  { key: "address", label: "联系地址" },
  { key: "targetRole", label: "目标岗位" },
  { key: "targetCities", label: "意向城市" },
  { key: "earliestStartDate", label: "最早到岗时间" },
  { key: "portfolioUrl", label: "作品集" },
  { key: "githubUrl", label: "GitHub" },
  { key: "school", label: "毕业院校" },
  { key: "major", label: "专业" },
  { key: "degree", label: "学历或学位" },
  { key: "gpa", label: "GPA 或绩点" },
  { key: "educationStartDate", label: "教育经历开始时间" },
  { key: "educationEndDate", label: "教育经历结束时间" },
  { key: "experienceOrganization", label: "工作经历公司" },
  { key: "experienceTitle", label: "工作经历职位" },
  { key: "experienceStartDate", label: "工作经历开始时间" },
  { key: "experienceEndDate", label: "工作经历结束时间" },
  { key: "experienceDescription", label: "工作职责或经历描述" },
  { key: "selfIntroduction", label: "自我介绍" },
  { key: "strengths", label: "个人优势" },
  { key: "careerPlan", label: "职业规划" },
  { key: "nationality", label: "民族" },
  { key: "idType", label: "证件类型" },
  { key: "idNumber", label: "证件号码" },
  { key: "wechat", label: "微信号" },
  { key: "qq", label: "QQ" },
  { key: "politicalStatus", label: "政治面貌" },
  { key: "maritalStatus", label: "婚姻状况" },
  { key: "healthStatus", label: "健康状况" },
  { key: "specialty", label: "特长" },
  { key: "workYears", label: "工作年限" },
  { key: "emergencyContactName", label: "紧急联系人姓名" },
  { key: "emergencyContactPhone", label: "紧急联系人电话" },
  { key: "countryRegion", label: "国家或地区" },
  { key: "expectedSalary", label: "期望薪资" },
  { key: "educationCollege", label: "学院或院系" },
  { key: "educationDegree", label: "学位" },
  { key: "educationForm", label: "学习形式" },
  { key: "educationCourses", label: "专业课程" },
  { key: "educationResearchDirection", label: "研究方向" },
  { key: "educationThesis", label: "毕业论文" },
  { key: "educationRank", label: "专业排名" },
  { key: "overseasEducation", label: "是否海外教育经历" },
  { key: "minorMajor", label: "辅修或双学位专业" },
  { key: "advisorName", label: "导师姓名" },
  { key: "experienceType", label: "工作类型" },
  { key: "experienceDepartment", label: "工作部门" },
  { key: "experienceSalary", label: "工作薪资" },
  { key: "experienceAchievements", label: "工作成果" },
  { key: "refereeName", label: "证明人姓名" },
  { key: "refereeTitle", label: "证明人职位" },
  { key: "refereeContact", label: "证明人联系方式" },
  { key: "leavingReason", label: "离职原因" },
  { key: "subordinateCount", label: "下属人数" },
  { key: "projectName", label: "项目名称" },
  { key: "projectRole", label: "项目职位或角色" },
  { key: "projectStartDate", label: "项目开始时间" },
  { key: "projectEndDate", label: "项目结束时间" },
  { key: "projectDescription", label: "项目内容" },
  { key: "projectAchievement", label: "项目成果" },
  { key: "projectLink", label: "项目链接" },
  { key: "campusExperienceType", label: "在校经历类型" },
  { key: "campusExperienceRole", label: "在校经历职位" },
  { key: "campusExperienceStartDate", label: "在校经历开始时间" },
  { key: "campusExperienceEndDate", label: "在校经历结束时间" },
  { key: "campusExperienceDescription", label: "在校经历内容" },
  { key: "awardDate", label: "获奖时间" },
  { key: "awardName", label: "奖励名称" },
  { key: "awardLevel", label: "奖励等级" },
  { key: "awardDescription", label: "奖励描述" },
  { key: "languageName", label: "外语语种" },
  { key: "languageCertificate", label: "语言证书名称" },
  { key: "englishLevel", label: "英语水平" },
  { key: "languageScore", label: "语言成绩" },
  { key: "languageProficiency", label: "语言掌握程度" },
  { key: "listeningSpeaking", label: "听说能力" },
  { key: "readingWriting", label: "读写能力" },
  { key: "computerSkillType", label: "计算机技能类型" },
  { key: "computerSkillProficiency", label: "计算机掌握程度" },
  { key: "qualificationDate", label: "资格证书获得时间" },
  { key: "qualificationName", label: "资格证书名称" },
  { key: "qualificationNumber", label: "资格证书编号" },
  { key: "qualificationDescription", label: "资格证书说明" },
  { key: "familyName", label: "家庭成员姓名" },
  { key: "familyRelation", label: "家庭成员关系" },
  { key: "familyPhone", label: "家庭成员电话" },
  { key: "familyCompany", label: "家庭成员公司" },
  { key: "familyPosition", label: "家庭成员职位" },
  { key: "familyPoliticalStatus", label: "家庭成员政治面貌" },
  { key: "publicationDate", label: "论文发表时间" },
  { key: "publicationJournal", label: "刊物名称" },
  { key: "publicationLevel", label: "刊物层级" },
  { key: "publicationTitle", label: "论文名称" },
  { key: "publicationDescription", label: "论文描述" },
  { key: "publicationAuthors", label: "论文作者" },
  { key: "publicationImpactFactor", label: "期刊影响因子" },
  { key: "publicationLink", label: "论文链接" },
  { key: "patentDate", label: "专利发表时间" },
  { key: "patentName", label: "专利名称" },
  { key: "patentNumber", label: "专利编号" },
  { key: "patentType", label: "专利类型" },
  { key: "patentAchievement", label: "专利成果" },
  { key: "hobbies", label: "兴趣爱好" },
  { key: "workName", label: "作品名称" },
  { key: "workLink", label: "作品链接" },
  { key: "workDescription", label: "作品描述" },
  { key: "competitionName", label: "竞赛名称" },
  { key: "competitionDate", label: "竞赛参与时间" },
  { key: "competitionDescription", label: "竞赛详情内容" },
  { key: "referralCode", label: "推荐码或内推码" },
  { key: "experienceCurrent", label: "工作经历是否至今" }
];

const FORM_PROFILE_KEY_SET = new Set<string>(FORM_PROFILE_FIELDS.map((field) => field.key));

function isProfileFieldKey(value?: string): value is ProfileFieldKey {
  return Boolean(value && FORM_PROFILE_KEY_SET.has(value));
}

function profileFieldAvailability(profile: PersonalProfile): Record<string, boolean> {
  const education = profile.education[0];
  const experience = profile.experiences[0];
  const project = profile.projects[0];
  const campusExperience = profile.campusExperiences[0];
  const award = profile.awards[0];
  const values: Record<string, string | undefined> = {
    fullName: profile.fullName,
    gender: profile.gender,
    phone: profile.phone,
    email: profile.email,
    birthDate: profile.birthDate,
    graduationDate: profile.graduationDate,
    currentCity: profile.currentCity,
    nativePlace: profile.nativePlace,
    height: profile.height,
    weight: profile.weight,
    recruitmentType: profile.recruitmentType,
    graduateStatus: profile.graduateStatus,
    address: profile.address,
    targetRole: profile.targetRole,
    targetCities: profile.targetCities,
    earliestStartDate: profile.earliestStartDate,
    portfolioUrl: profile.portfolioUrl,
    githubUrl: profile.githubUrl,
    school: education?.school,
    major: education?.major,
    degree: education?.degree,
    gpa: education?.gpa,
    educationCollege: education?.college,
    educationDegree: education?.educationDegree,
    educationForm: education?.educationForm,
    educationCourses: education?.courses,
    educationResearchDirection: education?.researchDirection,
    educationThesis: education?.thesis,
    educationRank: education?.rank,
    overseasEducation: education?.overseasEducation,
    minorMajor: education?.minorMajor,
    advisorName: education?.advisorName,
    educationStartDate: education?.startDate,
    educationEndDate: education?.endDate,
    experienceOrganization: experience?.organization,
    experienceTitle: experience?.title,
    experienceStartDate: experience?.startDate,
    experienceEndDate: experience?.isCurrent ? "至今" : experience?.endDate,
    experienceDescription: experience?.description,
    projectName: project?.name,
    projectRole: project?.role,
    projectStartDate: project?.startDate,
    projectEndDate: project?.endDate,
    projectDescription: project?.description,
    campusExperienceType: campusExperience?.type,
    campusExperienceRole: campusExperience?.role,
    campusExperienceStartDate: campusExperience?.startDate,
    campusExperienceEndDate: campusExperience?.endDate,
    campusExperienceDescription: campusExperience?.description,
    awardDate: award?.date,
    awardName: award?.name,
    awardLevel: award?.level,
    awardDescription: award?.description,
    selfIntroduction: profile.selfIntroduction,
    strengths: profile.strengths,
    careerPlan: profile.careerPlan,
    ...(profile.extraFields || {})
  };
  return Object.fromEntries(
    FORM_PROFILE_FIELDS.map(({ key }) => [key, Boolean(values[key])])
  );
}

function formMatchingPrompt(fields: FormFieldMatch[], profile: PersonalProfile): string {
  const availability = profileFieldAvailability(profile);
  const candidates = FORM_PROFILE_FIELDS.map(({ key, label }) => ({
    key,
    label,
    available: availability[key]
  }));
  const pageFields = fields.slice(0, 100).map((field) => ({
    id: field.id,
    label: field.label,
    section: field.section || "",
    type: field.type,
    required: Boolean(field.required),
    options: (field.options || []).slice(0, 30),
    rule_key: field.key || "",
    rule_confidence: field.confidence || 0,
    evidence: (field.evidence || []).slice(0, 5)
  }));
  return `你是网申表单字段匹配器。请把网页字段映射到候选人资料字段，只返回 JSON，不要解释。

输出结构：
{
  "matches": [
    { "id": "网页字段 id", "key": "候选资料 key 或空字符串", "confidence": 0.0, "reason": "不超过20字" }
  ]
}

候选资料字段（key 必须从这里选择）：
${JSON.stringify(candidates)}

规则：
1. 只在语义明确时匹配，不要猜测未知问题。
2. section、label、type、options 要一起判断；例如“是否接受调剂”不能匹配为性别。
3. 同一个网页字段只能匹配一个 key；无法匹配时 key 返回空字符串。
4. rule_key 是本地规则的初步结果，只有网页语义更明确时才覆盖它。
5. 不要返回候选人的任何实际资料值。
6. 重复标签必须结合 section 判断；“开始时间”可能是教育、工作、项目或在校经历，“职位”可能是工作职位、项目角色、在校职位或家庭成员职位。
7. “籍贯/户籍/户口/生源地”属于同一语义族；“职位名称/职位/工作职位/岗位名称”也属于同一语义族，但优先使用 section 对应的候选 key。

网页字段：
${JSON.stringify(pageFields)}`;
}

function normalizeStage(value?: string): ApplicationStage | undefined {
  const stage = (value || "").toLowerCase();
  if (!stage) return undefined;
  if (/offer|录用|待入职|已入职/.test(stage)) return "offer";
  if (/终止|结束|拒绝|淘汰|不合适|不通过|未通过|未录用|已撤回/.test(stage)) return "closed";
  if (/面试|一面|二面|三面|hr面|复试/.test(stage)) return "interview";
  if (/笔试|测评|在线测试/.test(stage)) return "assessment";
  if (/初筛|复筛|筛选|简历评估|简历审核|资格审核|已投递|投递简历|简历处理中/.test(stage)) return "applied";
  if (/待投递|网申/.test(stage)) return "interested";
  if (/感兴趣|收藏/.test(stage)) return "interested";
  return undefined;
}

function stripCodeFence(value: string): string {
  return value
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
}

function compactProgressEvidence(page: ExtractedJob) {
  return (page.progressEvidence || []).slice(0, 24).map((evidence) => ({
    jobId: evidence.jobId,
    position: evidence.position,
    currentStage: evidence.currentStage,
    terminalStatus: evidence.terminalStatus,
    context: evidence.context?.slice(0, 500),
    steps: evidence.steps.slice(0, 10)
  }));
}

function compactPageText(page: ExtractedJob): string {
  const maxLength = page.progressEvidence?.length ? 2400 : 8000;
  return sanitizeAiPageText(page.rawExcerpt || "").slice(0, maxLength);
}

function extractionPrompt(page: ExtractedJob): string {
  return `你是 JobKoI 的招聘页面结构化引擎。请判断页面类型，并提取页面中所有明确出现的求职岗位或投递记录。

只返回 JSON，不要解释。结构必须是：
{
  "page_type": "job_posting | application_list | application_update | career_information | unknown",
  "applications": [
    {
      "company": "公司名称",
      "position": "岗位名称，不要把公司或网站标题当岗位",
      "department": "",
      "job_id": "",
      "city": "",
      "job_type": "",
      "stage": "感兴趣/已投递/笔试测评/面试/Offer/已结束",
      "summary": "",
      "responsibilities": [],
      "requirements": [],
      "confidence": 0.0
    }
  ]
}

规则：
1. “投递记录、申请记录、我的申请”页面通常是 application_list，必须返回页面中每一条岗位。
2. 岗位编号可能在岗位名后的括号中，例如“产品经理（J101390）”。
3. 进度条中当前高亮或最新到达的节点是 stage。
4. 投递时间由本地规则从页面中明确标注的“投递时间、申请时间、提交时间”读取；不要猜测、补充或改写它。
5. 不要把“校园招聘、应届生招聘、招聘官网、职位列表”等网站或招聘类型名称当作岗位名称；“应届生招聘、校园招聘、秋招”等是招聘类型词，不是公司名，公司必须是雇主实体（例如“联想”）。
6. 页面没有明确公司名时，可以从网站域名和页面标题合理判断，但不要臆造。
7. 不确定的字段返回空字符串，不要编造。
8. 页面进度证据由 DOM 状态生成，优先级高于纯文本推断；不得把尚未到达的后续节点当作当前阶段。

页面信息：
标题：${cleanSiteName(page.position)}
规则初步识别公司：${promptCompanyHint(page.company)}
网址：${page.sourceUrl}
域名：${page.sourceHost}

页面可见文本：
${compactPageText(page)}

DOM 进度证据：
${JSON.stringify(compactProgressEvidence(page))}`;
}

function matchingProgressEvidence(page: ExtractedJob, item: ModelApplication) {
  const evidence = page.progressEvidence || [];
  const normalizedJobId = item.job_id?.trim().toLowerCase();
  if (normalizedJobId) {
    const byId = evidence.find(
      (entry) => entry.jobId?.trim().toLowerCase() === normalizedJobId
    );
    if (byId) return byId;
  }

  const normalizedPosition = normalizePositionIdentity(item.position);
  if (!normalizedPosition) return undefined;
  return evidence.find(
    (entry) => normalizePositionIdentity(entry.position) === normalizedPosition
  );
}

function normalizePositionIdentity(value?: string): string {
  return (value || "")
    .trim()
    .replace(/\s+(?:实习|全职|兼职|校招|社招|应届)$/i, "")
    .replace(/(实习生)实习$/i, "$1")
    .toLowerCase()
    .replace(/[\s\-—_｜|（）()【】\[\]]/g, "");
}

function documentSafe(value: string): string {
  return value.replace(/\u0000/g, "").trim();
}

const AI_NAV_PLACEHOLDER_WORDS = [
  "首页",
  "应聘记录",
  "投递记录",
  "申请记录",
  "我的申请",
  "校园招聘",
  "社会招聘",
  "实习生招聘",
  "招聘门户",
  "招聘首页",
  "编辑",
  "返回",
  "没有更多了",
  "登录",
  "注册",
  "登录/注册",
  "暂存投递"
];

const AI_CODE_COMMENT_PATTERN = /\/\*[\s\S]*?\*\/|<!--[\s\S]*?-->/g;

/**
 * Strip template code comments (for example the Beisen portal's
 * project-config markers) and standalone navigation labels so the model cannot
 * mistake them for a company or position.
 */
export function sanitizeAiPageText(value: string): string {
  return documentSafe(value)
    .replace(AI_CODE_COMMENT_PATTERN, " ")
    .replace(
      new RegExp(`(?:^|\\s)(?:${AI_NAV_PLACEHOLDER_WORDS.join("|")})(?=\\s|$)`, "g"),
      " "
    )
    .replace(/\s+/g, " ")
    .trim();
}

const SITE_SUFFIX_PATTERN = /(?:官方)?(?:招聘官网|招聘平台|招聘门户|招聘首页|校园招聘|社会招聘|人才招聘|招聘)$/;

function cleanSiteName(value: string): string {
  return sanitizeAiPageText(value).replace(SITE_SUFFIX_PATTERN, "");
}

function promptCompanyHint(value: string): string {
  const cleaned = cleanSiteName(value);
  return cleaned && !isRecruitmentCampaignCompany(cleaned) ? cleaned : "";
}

function sanitizeModeledCompany(value?: string): string {
  const company = value?.trim() || "";
  // Recruitment campaign labels such as 应届生招聘 are hiring types, not
  // employer entities; drop them so capture review falls back to page rules.
  return company && !isRecruitmentCampaignCompany(company) ? company : "";
}

export function inferApplicationListFromUrl(sourceUrl?: string): boolean {
  const normalized = (sourceUrl || "").toLowerCase();
  return /(?:personal|account|user)\/(?:delivery|application|apply)(?:[-_]?(?:record|list|history))?|(?:^|\/)(?:delivery|applications?)(?:[-_]?(?:record|list|history)|$|\/)|my[-_]?applications|投递记录|申请记录/.test(
    normalized
  );
}

export async function extractWithDeepSeek(
  page: ExtractedJob,
  settings: OfferFlowSettings
): Promise<DeepSeekExtraction> {
  const apiKey = settings.deepseekApiKey?.trim();
  if (!apiKey) throw new Error("请先在设置中填写 DeepSeek API Key");

  const response = await fetch(API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: settings.deepseekModel || DEFAULT_DEEPSEEK_MODEL,
      messages: [
        {
          role: "system",
          content:
            "你只负责从招聘网页文本中提取有证据支持的结构化数据，必须输出合法 JSON。"
        },
        {
          role: "user",
          content: extractionPrompt(page)
        }
      ],
      response_format: { type: "json_object" },
      thinking: { type: "disabled" },
      temperature: 0.1,
      max_tokens: page.progressEvidence?.length ? 3000 : 2400,
      stream: false
    })
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`DeepSeek 请求失败（${response.status}）：${detail.slice(0, 180)}`);
  }

  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = payload.choices?.[0]?.message?.content;
  if (!content) throw new Error("DeepSeek 没有返回可解析内容");

  let parsed: ModelResponse;
  try {
    parsed = JSON.parse(stripCodeFence(content)) as ModelResponse;
  } catch {
    throw new Error("DeepSeek 返回的不是合法 JSON");
  }

  const returnedApplications = [...(parsed.applications || [])];
  const evidenceCompany =
    returnedApplications
      .map((item) => sanitizeModeledCompany(item.company))
      .find(Boolean) || page.company;
  const reliableEvidence = (page.progressEvidence || [])
    .filter((evidence) => evidence.position && evidence.confidence >= 0.8)
    .sort((left, right) => Number(Boolean(right.jobId)) - Number(Boolean(left.jobId)))
    .filter((evidence, index, items) =>
      items.findIndex((candidate) => {
        const sameJobId = Boolean(
          evidence.jobId &&
          candidate.jobId &&
          evidence.jobId.trim().toLowerCase() === candidate.jobId.trim().toLowerCase()
        );
        return (
          sameJobId ||
          normalizePositionIdentity(evidence.position) ===
            normalizePositionIdentity(candidate.position)
        );
      }) === index
    );
  const modelApplications = reliableEvidence.length
    ? reliableEvidence.map((evidence) => {
        const matched = returnedApplications.find((item) => {
          if (
            evidence.jobId &&
            item.job_id?.trim().toLowerCase() === evidence.jobId.trim().toLowerCase()
          ) return true;
          return normalizePositionIdentity(item.position) === normalizePositionIdentity(evidence.position);
        });
        return {
          ...matched,
          company: sanitizeModeledCompany(matched?.company) || evidenceCompany,
          position: matched?.position?.trim() || evidence.position,
          job_id: matched?.job_id?.trim() || evidence.jobId,
          stage: evidence.terminalStatus || evidence.currentStage,
          confidence: evidence.confidence
        } satisfies ModelApplication;
      })
    : returnedApplications;

  const inferredPageType = inferApplicationListFromUrl(page.sourceUrl)
    ? "application_list"
    : page.progressEvidence?.length &&
      (!parsed.page_type || parsed.page_type === "unknown" || parsed.page_type === "job_posting")
      ? "application_list"
      : parsed.page_type;

  const extractedApplications = modelApplications
    .filter((item) => item.company || item.position)
    .map((item): ExtractedJob => {
      const progressEvidence = matchingProgressEvidence(page, item);
      const evidenceStage = normalizeStage(
        progressEvidence?.terminalStatus || progressEvidence?.currentStage
      );
      const trustedEvidence = Boolean(
        progressEvidence && progressEvidence.confidence >= 0.8 && evidenceStage
      );
      // When progress evidence exists (even with lower confidence), prefer it
      // over the AI model's stage guess, which is often wrong for application lists.
      const hasAnyEvidence = Boolean(progressEvidence && evidenceStage);
      const isProgressPage =
        inferredPageType === "application_list" || inferredPageType === "application_update";

      return {
        company: sanitizeModeledCompany(item.company) || page.company,
        position: item.position?.trim() || page.position,
        department: item.department?.trim() || undefined,
        jobId: item.job_id?.trim() || undefined,
        city: item.city?.trim() || undefined,
        jobType: item.job_type?.trim() || undefined,
        // Use only dates with page-level or same-record DOM evidence. Models are
        // intentionally not allowed to infer a submission time from other dates.
        appliedAt: progressEvidence?.appliedAt || page.appliedAt || undefined,
        summary: item.summary?.trim() || undefined,
        responsibilities: Array.isArray(item.responsibilities)
          ? item.responsibilities.filter(Boolean)
          : [],
        requirements: Array.isArray(item.requirements)
          ? item.requirements.filter(Boolean)
          : [],
        sourceUrl: page.sourceUrl,
        sourceHost: page.sourceHost,
        rawExcerpt: page.rawExcerpt,
        suggestedStage: trustedEvidence
          ? evidenceStage
          : hasAnyEvidence
            ? evidenceStage
            : isProgressPage
              ? undefined
              : normalizeStage(item.stage),
        externalStage: trustedEvidence
          ? (normalizeExternalStage(
              progressEvidence!.terminalStatus || progressEvidence!.currentStage
            ) ||
              progressEvidence!.terminalStatus ||
              progressEvidence!.currentStage ||
              undefined)
          : hasAnyEvidence
            ? (normalizeExternalStage(
                progressEvidence!.terminalStatus || progressEvidence!.currentStage
              ) ||
                progressEvidence!.terminalStatus ||
                progressEvidence!.currentStage ||
                undefined)
            : isProgressPage
              ? undefined
              : normalizeExternalStage(item.stage) || item.stage?.trim() || undefined,
        extractionSource: "deepseek",
        confidence: trustedEvidence
          ? progressEvidence!.confidence
          : typeof item.confidence === "number"
            ? Math.max(0, Math.min(isProgressPage ? 0.59 : 1, item.confidence))
            : isProgressPage
              ? 0.5
              : 0.8
      };
    });

  const applications = extractedApplications.filter(
    (application, index, items) =>
      items.findIndex((candidate) => {
        const sameJobId = Boolean(
          application.jobId &&
          candidate.jobId &&
          application.jobId.toLowerCase() === candidate.jobId.toLowerCase()
        );
        return (
          sameJobId ||
          (normalizePositionIdentity(application.position) ===
            normalizePositionIdentity(candidate.position) &&
            application.company.trim().toLowerCase() === candidate.company.trim().toLowerCase())
        );
      }) === index
  );

  if (!applications.length) throw new Error("DeepSeek 未识别到岗位记录");

  return {
    pageType: inferredPageType || (applications.length > 1 ? "application_list" : "job_posting"),
    applications
  };
}

export async function matchFormFields(
  fields: FormFieldMatch[],
  profile: PersonalProfile,
  settings: OfferFlowSettings
): Promise<FormFieldMatch[]> {
  const apiKey = settings.deepseekApiKey?.trim();
  // Rules and site adapters are authoritative for known labels. DeepSeek is
  // only called for fields that still have no local key, which keeps API cost
  // and accidental semantic overrides low.
  const unknownFields = fields.filter((field) => !field.key);
  if (!apiKey || !unknownFields.length) return fields;

  const response = await fetch(API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: settings.deepseekModel || DEFAULT_DEEPSEEK_MODEL,
      messages: [
        {
          role: "system",
          content: "你只负责网申字段语义匹配，必须输出合法 JSON，不返回任何个人资料值。"
        },
        {
          role: "user",
          content: formMatchingPrompt(unknownFields, profile)
        }
      ],
      response_format: { type: "json_object" },
      thinking: { type: "disabled" },
      temperature: 0,
      max_tokens: 2400,
      stream: false
    })
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`DeepSeek 字段匹配失败（${response.status}）：${detail.slice(0, 180)}`);
  }

  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = payload.choices?.[0]?.message?.content;
  if (!content) throw new Error("DeepSeek 没有返回字段匹配结果");

  let parsed: FormMatchResponse;
  try {
    parsed = JSON.parse(stripCodeFence(content)) as FormMatchResponse;
  } catch {
    throw new Error("DeepSeek 字段匹配结果不是合法 JSON");
  }

  const matches = new Map(
    (parsed.matches || [])
      .filter((item) => item.id)
      .map((item) => [item.id!, item])
  );

  return fields.map((field) => {
    if (field.key) return field;
    const match = matches.get(field.id);
    const confidence =
      typeof match?.confidence === "number"
        ? Math.max(0, Math.min(1, match.confidence))
        : 0;
    const aiKey = isProfileFieldKey(match?.key) ? match.key : undefined;
    const ruleConfidence = field.confidence || (field.key ? 0.82 : 0);
    const shouldUseAi = Boolean(
      aiKey &&
        confidence >= 0.65 &&
        (!field.key || confidence >= ruleConfidence - 0.05)
    );
    if (!shouldUseAi && !field.key) {
      return {
        ...field,
        confidence: confidence || undefined,
        source: "deepseek" as const,
        evidence: match?.reason ? [match.reason] : field.evidence
      };
    }
    return {
      ...field,
      key: shouldUseAi ? aiKey : field.key,
      confidence: shouldUseAi ? confidence : field.confidence,
      source: shouldUseAi ? ("deepseek" as const) : field.source,
      evidence: match?.reason
        ? [...(field.evidence || []).slice(0, 4), match.reason]
        : field.evidence
    };
  });
}

export async function testDeepSeekConnection(
  settings: OfferFlowSettings
): Promise<void> {
  const apiKey = settings.deepseekApiKey?.trim();
  if (!apiKey) throw new Error("请先填写 DeepSeek API Key");

  const response = await fetch(MODELS_URL, {
    headers: { Authorization: `Bearer ${apiKey}` }
  });
  if (!response.ok) {
    throw new Error(`连接失败（${response.status}）`);
  }

  const payload = (await response.json()) as {
    data?: Array<{ id?: string }>;
  };
  const model = settings.deepseekModel || DEFAULT_DEEPSEEK_MODEL;
  if (!payload.data?.some((item) => item.id === model)) {
    throw new Error(`API 可连接，但模型 ${model} 当前不可用`);
  }
}

