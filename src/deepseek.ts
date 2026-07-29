import type {
  ApplicationStage,
  DeepSeekExtraction,
  ExtractedJob,
  OfferFlowSettings
} from "./types";

const API_URL = "https://api.deepseek.com/chat/completions";
const MODELS_URL = "https://api.deepseek.com/models";
export const DEFAULT_DEEPSEEK_MODEL = "deepseek-v4-flash";

type ModelApplication = {
  company?: string;
  position?: string;
  department?: string;
  job_id?: string;
  city?: string;
  job_type?: string;
  stage?: string;
  applied_at?: string;
  deadline?: string;
  next_action?: string;
  summary?: string;
  responsibilities?: string[];
  requirements?: string[];
  confidence?: number;
};

type ModelResponse = {
  page_type?: DeepSeekExtraction["pageType"];
  applications?: ModelApplication[];
};

function normalizeStage(value?: string): ApplicationStage | undefined {
  const stage = (value || "").toLowerCase();
  if (!stage) return undefined;
  if (/offer|录用|待入职|已入职/.test(stage)) return "offer";
  if (/终止|结束|拒绝|淘汰|不合适|不通过|未通过|未录用|已撤回/.test(stage)) return "closed";
  if (/面试|一面|二面|三面|hr面|复试/.test(stage)) return "interview";
  if (/笔试|测评|在线测试/.test(stage)) return "assessment";
  if (/初筛|复筛|筛选|简历评估|简历审核|资格审核|已投递|投递简历|简历处理中/.test(stage)) return "applied";
  if (/待投递|网申/.test(stage)) return "to_apply";
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
  return documentSafe(page.rawExcerpt || "").slice(0, maxLength);
}

function extractionPrompt(page: ExtractedJob): string {
  return `你是 OfferDuoDuo 的招聘页面结构化引擎。请判断页面类型，并提取页面中所有明确出现的求职岗位或投递记录。

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
      "stage": "感兴趣/待投递/已投递/笔试测评/面试/Offer/已结束",
      "applied_at": "实际投递时间，YYYY-MM-DD或YYYY-MM-DDTHH:mm，无则为空字符串",
      "deadline": "YYYY-MM-DD 或 YYYY-MM-DDTHH:mm，无则为空字符串",
      "next_action": "",
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
4. “投递时间、申请时间”必须写入 applied_at，不能把网页抓取时间当成投递时间。
5. 不要把“校园招聘、招聘官网、职位列表”等网站名称当作岗位名称。
6. 页面没有明确公司名时，可以从网站域名和页面标题合理判断，但不要臆造。
7. 不确定的字段返回空字符串，不要编造。
8. 页面进度证据由 DOM 状态生成，优先级高于纯文本推断；不得把尚未到达的后续节点当作当前阶段。

页面信息：
标题：${documentSafe(page.position)}
规则初步识别公司：${documentSafe(page.company)}
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
    returnedApplications.find((item) => item.company?.trim())?.company?.trim() || page.company;
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
          company: matched?.company?.trim() || evidenceCompany,
          position: matched?.position?.trim() || evidence.position,
          job_id: matched?.job_id?.trim() || evidence.jobId,
          stage: evidence.terminalStatus || evidence.currentStage,
          confidence: evidence.confidence
        } satisfies ModelApplication;
      })
    : returnedApplications;

  const inferredPageType =
    page.progressEvidence?.length &&
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
      const isProgressPage =
        inferredPageType === "application_list" || inferredPageType === "application_update";

      return {
        company: item.company?.trim() || page.company,
        position: item.position?.trim() || page.position,
        department: item.department?.trim() || undefined,
        jobId: item.job_id?.trim() || undefined,
        city: item.city?.trim() || undefined,
        jobType: item.job_type?.trim() || undefined,
        deadline: item.deadline?.trim() || undefined,
        appliedAt: item.applied_at?.trim() || undefined,
        nextAction: item.next_action?.trim() || "确认当前投递状态",
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
          : isProgressPage
            ? undefined
            : normalizeStage(item.stage),
        externalStage: trustedEvidence
          ? progressEvidence?.terminalStatus || progressEvidence?.currentStage
          : isProgressPage
            ? undefined
            : item.stage?.trim() || undefined,
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

