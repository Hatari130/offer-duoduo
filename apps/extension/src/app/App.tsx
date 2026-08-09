import { useEffect, useMemo, useState } from "react";
import { useRef } from "react";
import {
  AlertTriangle,
  ArrowRight,
  BriefcaseBusiness,
  CalendarDays,
  CalendarClock,
  Check,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  CircleDot,
  Download,
  ExternalLink,
  FileText,
  FolderOpen,
  LayoutDashboard,
  MapPin,
  Megaphone,
  MonitorUp,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  Sparkles,
  Star,
  KeyRound,
  Target,
  Trash2,
  Wand2,
  X
} from "lucide-react";
import {
  DEFAULT_DEEPSEEK_MODEL,
  extractWithDeepSeek,
  testDeepSeekConnection
} from "@/integrations/deepseek/deepseek";
import {
  chooseObsidianDirectory,
  downloadBackup,
  getStoredDirectory,
  syncJobToObsidian
} from "@/integrations/obsidian/obsidian";
import {
  ACTIVE_RESUME_KEY,
  AUTO_SYNC_NOTICE_KEY,
  EMPTY_PROFILE,
  findDuplicate,
  JOBS_KEY,
  loadActiveResumeId,
  loadJobs,
  loadProfile,
  loadResumeLibrary,
  loadSettings,
  PROFILE_KEY,
  RESUMES_KEY,
  saveJobs,
  saveProfile,
  saveSettings
} from "@/infrastructure/storage/storage";
import {
  DEFAULT_OPPORTUNITY_FEED_URL,
  loadOpportunityCache,
  OPPORTUNITY_CACHE_KEY,
  refreshOpportunityFeed
} from "@/features/opportunities/opportunities";
import {
  OPPORTUNITY_PUBLISH_STATUS_KEY,
  publishOpportunityFeed
} from "@/infrastructure/sync/opportunitySync";
import {
  STAGES,
  STAGE_LABELS,
  type ApplicationStage,
  type ExtractedJob,
  type JobApplication,
  type OfferFlowSettings,
  type OpportunityFeedSnapshot,
  type PersonalProfile,
  type RecruitmentOpportunity
} from "@/shared/types";
import OpportunityView from "@/features/opportunities/OpportunityView";
import CloudSyncSettings from "@/features/settings/CloudSyncSettings";
import { normalizeTailorContext, type TailorContext } from "@/features/tailor/types";

import {
  CalendarView,
  CandidatePicker,
  CaptureForm,
  EditDrawer,
  JobCard,
  OverlayPanel,
  captureCandidatesFromProgress,
  compactStages,
  createId,
  dueState,
  inferAppliedAt,
  isCapturePositionRejected,
  prepareCaptureForReview,
  shouldUseDeepSeekForCapture,
  type View
} from "@/features/workspace/WorkspaceViews";

export default function App({ overlay = false }: { overlay?: boolean }) {
  const [jobs, setJobs] = useState<JobApplication[]>([]);
  const [settings, setSettings] = useState<OfferFlowSettings>({});
  const [opportunitySnapshot, setOpportunitySnapshot] = useState<OpportunityFeedSnapshot>({
    opportunities: []
  });
  const [opportunityLoading, setOpportunityLoading] = useState(false);
  const [opportunityError, setOpportunityError] = useState("");
  const [profile, setProfile] = useState<PersonalProfile>(() => ({
    ...EMPTY_PROFILE,
    education: [],
    experiences: [],
    projects: [],
    campusExperiences: [],
    awards: []
  }));
  const [view, setView] = useState<View>(() => {
    const requested = new URLSearchParams(location.search).get("view");
    return requested === "calendar" || requested === "settings"
      ? requested
      : "dashboard";
  });
  const [capture, setCapture] = useState<ExtractedJob | null>(null);
  const [captureCandidates, setCaptureCandidates] = useState<ExtractedJob[]>([]);
  const [editing, setEditing] = useState<JobApplication | null>(null);
  const [query, setQuery] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [testingAi, setTestingAi] = useState(false);
  const [publishState, setPublishState] = useState<{
    syncedAt?: string;
    count?: number;
    error?: string;
  }>({});

  useEffect(() => {
    Promise.all([
      loadJobs(),
      loadSettings(),
      loadProfile(),
      loadOpportunityCache(),
      loadResumeLibrary(),
      loadActiveResumeId()
    ]).then(([storedJobs, storedSettings, storedProfile, cachedOpportunities, resumeLibrary, activeResumeId]) => {
      let migrationChanged = false;
      const migratedJobs = storedJobs.map((job) => {
        const appliedAt = inferAppliedAt(job);
        if (!job.appliedAt && appliedAt) {
          migrationChanged = true;
          return { ...job, appliedAt };
        }
        return job;
      });
      setJobs(migratedJobs);
      if (migrationChanged) void saveJobs(migratedJobs);
      const effectiveSettings = storedSettings.opportunityFeedUrl?.trim()
        ? storedSettings
        : { ...storedSettings, opportunityFeedUrl: DEFAULT_OPPORTUNITY_FEED_URL };
      setSettings(effectiveSettings);
      if (!storedSettings.opportunityFeedUrl) void saveSettings(effectiveSettings);
      const currentResumeId = activeResumeId && resumeLibrary.some((resume) => resume.id === activeResumeId)
        ? activeResumeId
        : resumeLibrary[0]?.id;
      const currentResume = resumeLibrary.find((resume) => resume.id === currentResumeId);
      setProfile(currentResume?.profile || storedProfile);
      if (currentResume) void saveProfile(currentResume.profile);
      setOpportunitySnapshot(cachedOpportunities);
      setOpportunityLoading(true);
      refreshOpportunityFeed(effectiveSettings.opportunityFeedUrl)
        .then((snapshot) => {
          setOpportunitySnapshot(snapshot);
          setOpportunityError("");
          publishSnapshot(snapshot);
        })
        .catch((error) => {
          if (storedSettings.opportunityFeedUrl) {
            setOpportunityError(error instanceof Error ? error.message : "机会数据同步失败");
          }
        })
        .finally(() => setOpportunityLoading(false));
    });

    if (typeof chrome === "undefined" || !chrome.storage?.onChanged) return;

    const handleStorageChange = (
      changes: Record<string, chrome.storage.StorageChange>,
      areaName: string
    ) => {
      if (areaName !== "local") return;
      if (changes[JOBS_KEY]?.newValue) {
        setJobs(changes[JOBS_KEY].newValue as JobApplication[]);
      }
      if (changes[PROFILE_KEY]?.newValue) {
        setProfile(changes[PROFILE_KEY].newValue as PersonalProfile);
      }
      if (changes[RESUMES_KEY] || changes[ACTIVE_RESUME_KEY]) {
        void (async () => {
          const [library, activeId] = await Promise.all([loadResumeLibrary(), loadActiveResumeId()]);
          const currentId = activeId && library.some((resume) => resume.id === activeId) ? activeId : library[0]?.id || "";
          const current = library.find((resume) => resume.id === currentId);
          if (current && !changes[PROFILE_KEY]) setProfile(current.profile);
        })();
      }
      if (changes[OPPORTUNITY_CACHE_KEY]?.newValue) {
        setOpportunitySnapshot(
          changes[OPPORTUNITY_CACHE_KEY].newValue as OpportunityFeedSnapshot
        );
      }
      if (changes[OPPORTUNITY_PUBLISH_STATUS_KEY]?.newValue) {
        setPublishState(
          changes[OPPORTUNITY_PUBLISH_STATUS_KEY].newValue as {
            syncedAt?: string;
            count?: number;
            error?: string;
          }
        );
      }
      if (changes[AUTO_SYNC_NOTICE_KEY]?.newValue) {
        const autoNotice = changes[AUTO_SYNC_NOTICE_KEY].newValue as {
          message?: string;
        };
        if (autoNotice.message) setNotice(autoNotice.message);
      }
    };

    chrome.storage.local
      .get(OPPORTUNITY_PUBLISH_STATUS_KEY)
      .then((result) => {
        const stored = result[OPPORTUNITY_PUBLISH_STATUS_KEY] as
          | { syncedAt?: string; count?: number; error?: string }
          | undefined;
        if (stored) setPublishState(stored);
      })
      .catch(() => undefined);

    chrome.storage.onChanged.addListener(handleStorageChange);
    chrome.tabs
      ?.query({ active: true, currentWindow: true })
      .then(([tab]) => {
        if (tab?.id) return chrome.action.setBadgeText({ text: "", tabId: tab.id });
      })
      .catch(() => undefined);

    return () => chrome.storage.onChanged.removeListener(handleStorageChange);
  }, []);

  const persistJobs = async (next: JobApplication[]) => {
    setJobs(next);
    await saveJobs(next);
  };

  const toggleFavorite = async (job: JobApplication) => {
    const next = jobs.map((item) =>
      item.id === job.id ? { ...item, isFavorite: !item.isFavorite } : item
    );
    await persistJobs(next);
    setNotice(job.isFavorite ? "已移出收藏夹" : "已加入收藏夹");
  };

  const persistProfile = async (next: PersonalProfile) => {
    const updated = { ...next, updatedAt: new Date().toISOString() };
    setProfile(updated);
    await saveProfile(updated);
  };

  const refreshOpportunities = async (sourceUrl = settings.opportunityFeedUrl) => {
    setOpportunityLoading(true);
    setOpportunityError("");
    try {
      const snapshot = await refreshOpportunityFeed(sourceUrl);
      setOpportunitySnapshot(snapshot);
      publishSnapshot(snapshot);
      return snapshot;
    } catch (error) {
      const message = error instanceof Error ? error.message : "机会数据同步失败";
      setOpportunityError(message);
      throw error;
    } finally {
      setOpportunityLoading(false);
    }
  };

  const publishSnapshot = (snapshot: OpportunityFeedSnapshot) => {
    publishOpportunityFeed(snapshot)
      .then((count) =>
        setPublishState({ syncedAt: new Date().toISOString(), count })
      )
      .catch((error) =>
        setPublishState({
          error: error instanceof Error ? error.message : "Web 端同步失败"
        })
      );
  };

  const saveOpportunityFeedUrl = async (sourceUrl: string) => {
    const normalizedUrl = sourceUrl.trim() || DEFAULT_OPPORTUNITY_FEED_URL;
    const next: OfferFlowSettings = {
      ...settings,
      opportunityFeedUrl: normalizedUrl || undefined
    };
    setSettings(next);
    await saveSettings(next);
    try {
      const snapshot = await refreshOpportunities(next.opportunityFeedUrl || "");
      setNotice(`机会数据已同步：${snapshot.opportunities.length} 条`);
    } catch {
      setNotice("数据源已保存，但当前无法读取；请检查地址和访问权限");
    }
  };

  const openOpportunity = async (opportunity: RecruitmentOpportunity) => {
    try {
      const source = new URL(opportunity.officialUrl);
      if (source.protocol !== "http:" && source.protocol !== "https:") {
        throw new Error("unsupported opportunity URL");
      }
      const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!activeTab?.id) throw new Error("active tab unavailable");
      await chrome.tabs.update(activeTab.id, { url: source.href });
    } catch {
      setNotice("该机会没有可用的官方招聘链接");
    }
  };

  const filteredJobs = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return jobs;
    return jobs.filter((job) =>
      [job.company, job.position, job.city, job.jobId]
        .filter(Boolean)
        .some((value) => value!.toLowerCase().includes(normalized))
    );
  }, [jobs, query]);

  const duplicate = capture
    ? findDuplicate(jobs, {
        company: capture.company,
        position: capture.position,
        jobId: capture.jobId,
        city: capture.city,
        sourceUrl: capture.sourceUrl
      })
    : undefined;

  const capturePage = async () => {
    setBusy(true);
    setNotice("");
    try {
      if (typeof chrome === "undefined" || !chrome.tabs) {
        setCapture({
          company: "示例科技",
          position: "产品经理",
          city: "上海",
          jobId: "DEMO-001",
          deadline: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
          nextAction: "完成网申",
          summary: "负责产品规划、需求分析与跨团队协作。",
          responsibilities: ["负责产品规划", "推进项目落地"],
          requirements: ["具备产品分析能力"],
          sourceUrl: location.href,
          sourceHost: "preview.local",
          confidence: 0.92
        });
      } else {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab.id || !tab.url?.startsWith("http")) {
          throw new Error("请在招聘网页中使用 OfferDuoDuo");
        }
        const requestExtraction = () =>
          chrome.tabs.sendMessage(tab.id!, {
            type: "OFFERFLOW_EXTRACT_PAGE"
          }) as Promise<{ ok: boolean; data?: ExtractedJob; error?: string }>;

        let response: { ok: boolean; data?: ExtractedJob; error?: string };
        try {
          response = await requestExtraction();
        } catch (messageError) {
          const reason =
            messageError instanceof Error ? messageError.message : String(messageError);
          const receiverMissing = reason.includes("Receiving end does not exist");
          if (!receiverMissing || !chrome.scripting) throw messageError;

          await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            files: ["extraction-rules.js", "form-adapters.js", "content.js"]
          });
          response = await requestExtraction();
        }

        if (!response.ok || !response.data) {
          throw new Error(response.error || "页面解析失败");
        }
        const localProgressCandidates = captureCandidatesFromProgress(response.data);
        if (localProgressCandidates.length > 1) {
          setCaptureCandidates(localProgressCandidates);
          setCapture(null);
        } else if (localProgressCandidates.length === 1) {
          setCapture(localProgressCandidates[0]);
          setCaptureCandidates([]);
        } else if (settings.deepseekApiKey && shouldUseDeepSeekForCapture(response.data)) {
          try {
            const aiResult = await extractWithDeepSeek(response.data, settings);
            const validApplications = aiResult.applications
              .filter((application) => !isCapturePositionRejected(application.position))
              .map(prepareCaptureForReview);
            if (!validApplications.length) {
              throw new Error("识别结果只有流程节点，没有可信岗位名称");
            }
            if (validApplications.length > 1) {
              setCaptureCandidates(validApplications);
              setCapture(null);
            } else {
              setCapture(validApplications[0]);
              setCaptureCandidates([]);
            }
          } catch (aiError) {
            setCapture(prepareCaptureForReview(response.data));
            setCaptureCandidates([]);
            setNotice(
              `DeepSeek识别失败，已使用本地规则：${
                aiError instanceof Error ? aiError.message : "未知错误"
              }`
            );
          }
        } else {
          setCapture(prepareCaptureForReview(response.data));
          setCaptureCandidates([]);
        }
      }
      setView("capture");
    } catch (error) {
      const message = error instanceof Error ? error.message : "无法抓取当前页面";
      setNotice(
        message.includes("Cannot access") ||
          message.includes("The extensions gallery cannot be scripted")
          ? "浏览器内部页面无法抓取，请打开实际的招聘网页后重试"
          : message
      );
    } finally {
      setBusy(false);
    }
  };

  const saveCapture = async (mode: "create" | "update") => {
    if (!capture) return;
    const now = new Date().toISOString();

    if (mode === "update" && duplicate) {
      const updated: JobApplication = {
        ...duplicate,
        ...capture,
        id: duplicate.id,
        stage: duplicate.stage,
        createdAt: duplicate.createdAt,
        updatedAt: now,
        events: [
          ...duplicate.events,
          {
            id: createId("evt"),
            type: "captured",
            title: "从招聘网页重新抓取并更新岗位",
            occurredAt: now,
            sourceUrl: capture.sourceUrl
          }
        ]
      };
      await persistJobs(jobs.map((job) => (job.id === duplicate.id ? updated : job)));
      setNotice("已有岗位已更新");
    } else {
      const created: JobApplication = {
        ...capture,
        id: createId("job"),
        stage: capture.suggestedStage || "interested",
        createdAt: now,
        updatedAt: now,
        events: [
          {
            id: createId("evt"),
            type: "created",
            title: "从招聘网页加入 OfferDuoDuo",
            occurredAt: now,
            sourceUrl: capture.sourceUrl
          }
        ]
      };
      await persistJobs([created, ...jobs]);
      setNotice("岗位已加入 OfferDuoDuo");
    }

    setCapture(null);
    setCaptureCandidates([]);
    setView("dashboard");
  };

  const importCandidates = async (candidates: ExtractedJob[]) => {
    const now = new Date().toISOString();
    let nextJobs = [...jobs];
    let createdCount = 0;
    let updatedCount = 0;

    for (const candidate of candidates) {
      const duplicate = findDuplicate(nextJobs, {
        company: candidate.company,
        position: candidate.position,
        jobId: candidate.jobId,
        city: candidate.city,
        sourceUrl: candidate.sourceUrl
      });

      if (duplicate) {
        const trustedStage =
          candidate.confidence >= 0.8 ? candidate.suggestedStage : undefined;
        const updated: JobApplication = {
          ...duplicate,
          ...candidate,
          id: duplicate.id,
          stage: trustedStage || duplicate.stage,
          externalStage: trustedStage
            ? candidate.externalStage || duplicate.externalStage
            : duplicate.externalStage,
          createdAt: duplicate.createdAt,
          updatedAt: now,
          events: [
            ...duplicate.events,
            {
              id: createId("evt"),
              type: "captured",
              title: "从投递记录页同步岗位进度",
              occurredAt: now,
              sourceUrl: candidate.sourceUrl
            }
          ]
        };
        nextJobs = nextJobs.map((job) => (job.id === duplicate.id ? updated : job));
        updatedCount += 1;
      } else {
        const created: JobApplication = {
          ...candidate,
          id: createId("job"),
          stage: candidate.suggestedStage || "applied",
          createdAt: now,
          updatedAt: now,
          events: [
            {
              id: createId("evt"),
              type: "created",
              title: "从投递记录页导入 OfferDuoDuo",
              occurredAt: now,
              sourceUrl: candidate.sourceUrl
            }
          ]
        };
        nextJobs.unshift(created);
        createdCount += 1;
      }
    }

    await persistJobs(nextJobs);
    setCaptureCandidates([]);
    setCapture(null);
    setView("dashboard");
    setNotice(`导入完成：新建 ${createdCount} 条，更新 ${updatedCount} 条`);
  };

  const handleTailor = async () => {
    setBusy(true);
    setNotice("");
    try {
      if (typeof chrome === "undefined" || !chrome.tabs) {
        setNotice("请在 Chrome 浏览器中使用定制功能");
        return;
      }
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab.id || !tab.url?.startsWith("http")) {
        throw new Error("请在招聘网页中使用 OfferDuoDuo");
      }
      const requestExtraction = () =>
        chrome.tabs.sendMessage(tab.id!, {
          type: "OFFERFLOW_EXTRACT_PAGE"
        }) as Promise<{ ok: boolean; data?: ExtractedJob; error?: string }>;

      let response = await requestExtraction();
      if (!response.ok) {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ["extraction-rules.js", "form-adapters.js", "content.js"]
        });
        response = await requestExtraction();
      }
      if (!response.ok || !response.data) {
        throw new Error(response.error || "页面解析失败");
      }
      const job = response.data;
      const [resumeLibrary, activeResumeId] = await Promise.all([
        loadResumeLibrary(),
        loadActiveResumeId()
      ]);
      const sourceResume = resumeLibrary.find((resume) => resume.id === activeResumeId) || resumeLibrary[0];
      if (!sourceResume?.sourcePdf) {
        throw new Error("当前网申简历没有原始 PDF 母版，请在简历库重新导入 PDF 后再使用一键改简历");
      }
      const context: TailorContext = normalizeTailorContext({
        jobKey: "",
        sourceResumeId: sourceResume.id,
        company: job.company,
        position: job.position,
        city: job.city,
        sourceUrl: job.sourceUrl,
        summary: job.summary,
        responsibilities: job.responsibilities || [],
        requirements: job.requirements || [],
        rawExcerpt: job.rawExcerpt || undefined
      });
      const payload = encodeURIComponent(JSON.stringify({
        jobKey: context.jobKey,
        context
      }));
      const url = chrome.runtime.getURL(`tailor.html?context=${payload}&auto=1`);
      await chrome.tabs.create({ url });
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : "定制功能暂时不可用，请先识别当前页面的岗位信息"
      );
    } finally {
      setBusy(false);
    }
  };

  const updateStage = async (job: JobApplication, stage: ApplicationStage) => {
    if (job.stage === stage) return;
    const now = new Date().toISOString();
    const updated: JobApplication = {
      ...job,
      stage,
      updatedAt: now,
      events: [
        ...job.events,
        {
          id: createId("evt"),
          type: "stage_changed",
          title: `阶段更新：${STAGE_LABELS[job.stage]} → ${STAGE_LABELS[stage]}`,
          occurredAt: now
        }
      ]
    };
    await persistJobs(jobs.map((item) => (item.id === job.id ? updated : item)));
  };

  const saveEditedJob = async (draft: JobApplication) => {
    const original = jobs.find((job) => job.id === draft.id);
    if (!original) return;
    const now = new Date().toISOString();
    const events = [...draft.events];
    if (original.stage !== draft.stage) {
      events.push({
        id: createId("evt"),
        type: "stage_changed",
        title: `阶段更新：${STAGE_LABELS[original.stage]} → ${STAGE_LABELS[draft.stage]}`,
        occurredAt: now
      });
    } else {
      events.push({
        id: createId("evt"),
        type: "updated",
        title: "更新岗位信息",
        occurredAt: now
      });
    }
    const updated = { ...draft, updatedAt: now, events };
    await persistJobs(jobs.map((job) => (job.id === draft.id ? updated : job)));
    setEditing(null);
    setNotice("岗位进度已保存");
  };

  const deleteJob = async (job: JobApplication) => {
    await persistJobs(jobs.filter((item) => item.id !== job.id));
    setEditing(null);
    setNotice(`已删除：${job.position}`);
  };

  const chooseFolder = async () => {
    try {
      const directory = await chooseObsidianDirectory();
      const next = { ...settings, obsidianFolderName: directory.name };
      setSettings(next);
      await saveSettings(next);
      setNotice(`已连接目录：${directory.name}`);
    } catch (error) {
      if ((error as DOMException).name !== "AbortError") {
        setNotice(error instanceof Error ? error.message : "目录连接失败");
      }
    }
  };

  const syncOne = async (job: JobApplication) => {
    setBusy(true);
    try {
      const filename = await syncJobToObsidian(job);
      const updated = {
        ...job,
        obsidianPath: filename,
        updatedAt: new Date().toISOString()
      };
      await persistJobs(jobs.map((item) => (item.id === job.id ? updated : item)));
      setEditing(updated);
      setNotice(`已同步：${filename}`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "同步失败");
    } finally {
      setBusy(false);
    }
  };

  const syncAll = async () => {
    setBusy(true);
    try {
      const directory = await getStoredDirectory();
      if (!directory) throw new Error("请先选择 Obsidian 中的岗位目录");
      const synced: JobApplication[] = [];
      for (const job of jobs) {
        const filename = await syncJobToObsidian(job, directory);
        synced.push({ ...job, obsidianPath: filename });
      }
      const timestamp = new Date().toISOString();
      await persistJobs(synced.map((job) => ({ ...job, updatedAt: timestamp })));
      const next = { ...settings, lastExportAt: timestamp };
      setSettings(next);
      await saveSettings(next);
      setNotice(`已同步 ${jobs.length} 个岗位`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "同步失败");
    } finally {
      setBusy(false);
    }
  };

  const saveDeepSeekSettings = async () => {
    const next = {
      ...settings,
      deepseekModel: settings.deepseekModel || DEFAULT_DEEPSEEK_MODEL,
      autoMonitorEnabled: settings.autoMonitorEnabled ?? true
    };
    setSettings(next);
    await saveSettings(next);
    setNotice("DeepSeek配置已保存在本机");
  };

  const testAi = async () => {
    setTestingAi(true);
    try {
      await testDeepSeekConnection({
        ...settings,
        deepseekModel: settings.deepseekModel || DEFAULT_DEEPSEEK_MODEL
      });
      await saveDeepSeekSettings();
      setNotice("DeepSeek连接成功，模型可用");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "DeepSeek连接失败");
    } finally {
      setTestingAi(false);
    }
  };

  const activeCount = jobs.filter((job) => job.stage !== "closed").length;
  const urgentCount = jobs.filter((job) => dueState(job.deadline) === "soon").length;
  const openWebDashboard = () => {
    const url =
      typeof chrome !== "undefined" && chrome.runtime?.getURL
        ? chrome.runtime.getURL("resume.html")
        : new URL("resume.html", window.location.href).href;
    if (typeof chrome !== "undefined" && chrome.tabs?.create) {
      void chrome.tabs.create({ url });
      return;
    }
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const openResumeManager = () => {
    const url =
      typeof chrome !== "undefined" && chrome.runtime?.getURL
        ? chrome.runtime.getURL("resume.html")
        : new URL("resume.html", window.location.href).href;
    if (typeof chrome !== "undefined" && chrome.tabs?.create) {
      void chrome.tabs.create({ url });
      return;
    }
    window.open(url, "_blank", "noopener,noreferrer");
  };

  if (overlay) {
    const captureActive =
      view === "capture" && (captureCandidates.length > 1 || Boolean(capture));
    const closeOverlay = () =>
      window.parent.postMessage({ type: "OFFERFLOW_CLOSE_OVERLAY" }, "*");
    const openJobSource = async (job: JobApplication) => {
      try {
        const source = new URL(job.sourceUrl);
        if (source.protocol !== "http:" && source.protocol !== "https:") {
          throw new Error("unsupported source URL");
        }

        const [activeTab] = await chrome.tabs.query({
          active: true,
          currentWindow: true
        });
        if (!activeTab?.id) throw new Error("active tab unavailable");
        await chrome.tabs.update(activeTab.id, { url: source.href });
      } catch {
        setEditing(job);
        setNotice("该岗位还没有可用的网申链接，请先补充链接");
      }
    };

    return (
      <main className="overlay-shell">
        {notice && (
          <button className="overlay-notice" onClick={() => setNotice("")}>
            <Check size={14} />
            <span>{notice}</span>
            <X size={13} />
          </button>
        )}

        {captureActive ? (
          <div className="overlay-capture-screen">
            <header className="overlay-header">
              <button
                className="overlay-capture-back"
                onClick={() => {
                  setCapture(null);
                  setCaptureCandidates([]);
                  setView("dashboard");
                }}
              >
                <ChevronLeft size={17} /> 返回
              </button>
              <strong>页面识别</strong>
              <button className="overlay-close-button" onClick={closeOverlay}>
                <X size={19} />
              </button>
            </header>
            <div className="overlay-capture-content">
              {captureCandidates.length > 1 ? (
                <CandidatePicker
                  candidates={captureCandidates}
                  jobs={jobs}
                  onCancel={() => {
                    setCaptureCandidates([]);
                    setView("dashboard");
                  }}
                  onImport={importCandidates}
                />
              ) : capture ? (
                <CaptureForm
                  value={capture}
                  duplicate={duplicate}
                  onChange={setCapture}
                  onCancel={() => {
                    setCapture(null);
                    setView("dashboard");
                  }}
                  onSave={saveCapture}
                />
              ) : null}
            </div>
          </div>
        ) : (
          <OverlayPanel
            jobs={jobs}
            settings={settings}
            opportunitySnapshot={opportunitySnapshot}
            opportunityLoading={opportunityLoading}
            opportunityError={opportunityError}
            profile={profile}
            onSaveProfile={persistProfile}
            onSaveOpportunityFeed={saveOpportunityFeedUrl}
            onCapture={capturePage}
            onTailor={handleTailor}
            onOpenOpportunity={(opportunity) => void openOpportunity(opportunity)}
            onOpenSource={(job) => void openJobSource(job)}
            onEdit={setEditing}
            onToggleFavorite={(job) => {
              void toggleFavorite(job);
            }}
            onRefresh={() => {
              void loadJobs().then(setJobs);
              void refreshOpportunities().catch(() => undefined);
            }}
            onRefreshOpportunities={() => void refreshOpportunities().catch(() => undefined)}
            onOpenDashboard={openWebDashboard}
            onOpenResumeManager={openResumeManager}
            onClose={closeOverlay}
          />
        )}

        {editing && (
          <EditDrawer
            job={editing}
            onClose={() => setEditing(null)}
            onSave={saveEditedJob}
            onSync={syncOne}
            onDelete={(job) => void deleteJob(job)}
          />
        )}
      </main>
    );
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <button className="brand" onClick={() => setView("dashboard")}>
          <span className="brand-glyph">
            <ArrowRight size={19} strokeWidth={3} />
          </span>
          <span>
            OFFER<strong>FLOW</strong>
          </span>
        </button>
        <div className="topbar-actions">
          <button
            className="workspace-button"
            onClick={openResumeManager}
            title="打开简历中心"
          >
            <FileText size={16} />
            简历中心
          </button>
          <button
            className="workspace-button"
            onClick={openWebDashboard}
            title="打开网页工作台"
          >
            <MonitorUp size={16} />
            网页工作台
          </button>
          <button
            className="capture-button"
            onClick={capturePage}
            disabled={busy}
            title="抓取当前招聘网页"
          >
            {busy ? <RefreshCw className="spin" size={16} /> : <Plus size={17} />}
            抓取当前岗位
          </button>
        </div>
      </header>

      <nav className="rail">
        <button
          className={view === "dashboard" ? "active" : ""}
          onClick={() => setView("dashboard")}
          title="岗位看板"
        >
          <LayoutDashboard size={19} />
        </button>
        <button
          className={view === "calendar" ? "active" : ""}
          onClick={() => setView("calendar")}
          title="投递日历"
        >
          <CalendarDays size={19} />
        </button>
        <button onClick={capturePage} title="抓取岗位">
          <Target size={19} />
        </button>
        <button
          className={view === "settings" ? "active" : ""}
          onClick={() => setView("settings")}
          title="设置与备份"
        >
          <Settings2 size={19} />
        </button>
      </nav>

      <div className="workspace">
        {notice && (
          <button className="notice" onClick={() => setNotice("")}>
            <Check size={14} />
            {notice}
            <X size={13} />
          </button>
        )}

        {view === "capture" && captureCandidates.length > 1 ? (
          <CandidatePicker
            candidates={captureCandidates}
            jobs={jobs}
            onCancel={() => {
              setCaptureCandidates([]);
              setView("dashboard");
            }}
            onImport={importCandidates}
          />
        ) : view === "capture" && capture ? (
          <CaptureForm
            value={capture}
            duplicate={duplicate}
            onChange={setCapture}
            onCancel={() => {
              setCapture(null);
              setCaptureCandidates([]);
              setView("dashboard");
            }}
            onSave={saveCapture}
          />
        ) : view === "calendar" ? (
          <CalendarView jobs={jobs} onEdit={setEditing} onCapture={capturePage} />
        ) : view === "settings" ? (
          <section className="settings-view">
            <div className="page-heading">
              <div>
                <span className="eyebrow">数据与连接</span>
                <h1>把记录留在你手里</h1>
                <p>OfferDuoDuo 保存主数据，Obsidian 接收可阅读、可继续补充的 Markdown。</p>
              </div>
            </div>

            <CloudSyncSettings />

            <div className="settings-card opportunity-source-card">
              <div className="setting-icon opportunity-source-icon">
                <Megaphone size={24} />
              </div>
              <div className="setting-copy">
                <h3>校招机会数据源</h3>
                <p>接入飞书云表格或公开 JSON，在插件中完整展示招聘批次并直达官方申请页。</p>
                <label className="opportunity-source-field">
                  <span>飞书云表格链接或公开 JSON 地址</span>
                  <input
                    type="url"
                    value={settings.opportunityFeedUrl || ""}
                    placeholder="飞书云表格链接或公开 JSON 地址"
                    onChange={(event) =>
                      setSettings({ ...settings, opportunityFeedUrl: event.target.value })
                    }
                  />
                </label>
                <div className="connection-state">
                  <span className={opportunitySnapshot.opportunities.length ? "connected-dot" : "empty-dot"} />
                  {opportunitySnapshot.opportunities.length
                    ? `已载入 ${opportunitySnapshot.opportunities.length} 条机会`
                    : "当前没有机会数据"}
                </div>
                <div className="connection-state">
                  <span className={publishState?.error ? "empty-dot" : publishState?.count ? "connected-dot" : "empty-dot"} />
                  {publishState?.error
                    ? `Web 端同步失败：${publishState.error}`
                    : publishState?.count
                      ? `Web 端已同步 ${publishState.count} 条 · ${new Date(publishState.syncedAt || "").toLocaleTimeString("zh-CN", { hour12: false })}`
                      : "Web 端等待同步：打开本地 API 后自动推送"}
                </div>
              </div>
              <button
                className="button button--secondary"
                onClick={() => void saveOpportunityFeedUrl(settings.opportunityFeedUrl || "")}
                disabled={opportunityLoading}
              >
                <RefreshCw className={opportunityLoading ? "spin" : ""} size={16} />
                保存并同步
              </button>
            </div>

            <div className="settings-card obsidian-card">
              <div className="setting-icon">
                <FileText size={24} />
              </div>
              <div className="setting-copy">
                <h3>Obsidian Markdown</h3>
                <p>
                  选择 Vault 中的岗位目录。同步只更新 OfferDuoDuo 管理区域，不覆盖你的准备笔记。
                </p>
                <div className="connection-state">
                  <span className={settings.obsidianFolderName ? "connected-dot" : "empty-dot"} />
                  {settings.obsidianFolderName
                    ? `已连接：${settings.obsidianFolderName}`
                    : "尚未连接目录"}
                </div>
              </div>
              <button className="button button--secondary" onClick={chooseFolder}>
                <FolderOpen size={16} />
                {settings.obsidianFolderName ? "更换目录" : "选择目录"}
              </button>
            </div>

            <div className="settings-card ai-card">
              <div className="setting-icon deepseek-icon">
                <Sparkles size={24} />
              </div>
              <div className="setting-copy">
                <h3>DeepSeek 页面理解</h3>
                <p>
                  用于识别投递列表、流程页面和网申字段。页面理解会发送必要的页面文本；
                  网申匹配只发送字段标签、类型和选项，不发送个人资料值。
                </p>
                <div className="ai-fields">
                  <label>
                    <span>API Key（仅保存在当前浏览器）</span>
                    <div className="secret-input">
                      <KeyRound size={14} />
                      <input
                        type="password"
                        autoComplete="off"
                        value={settings.deepseekApiKey || ""}
                        placeholder="sk-..."
                        onChange={(event) =>
                          setSettings({
                            ...settings,
                            deepseekApiKey: event.target.value
                          })
                        }
                      />
                    </div>
                  </label>
                  <label>
                    <span>模型</span>
                    <input
                      value={settings.deepseekModel || DEFAULT_DEEPSEEK_MODEL}
                      onChange={(event) =>
                        setSettings({
                          ...settings,
                          deepseekModel: event.target.value
                        })
                      }
                    />
                  </label>
                </div>
                <label className="monitor-toggle">
                  <input
                    type="checkbox"
                    checked={settings.autoMonitorEnabled ?? true}
                    onChange={(event) =>
                      setSettings({
                        ...settings,
                        autoMonitorEnabled: event.target.checked
                      })
                    }
                  />
                  <span className="toggle-track">
                    <span />
                  </span>
                  <span className="toggle-copy">
                    <strong>实时监听投递进度页</strong>
                    <small>页面保持打开时，发现阶段变化后自动更新匹配岗位</small>
                  </span>
                </label>
              </div>
              <div className="ai-actions">
                <button className="button button--ghost" onClick={saveDeepSeekSettings}>
                  保存
                </button>
                <button
                  className="button button--secondary"
                  onClick={testAi}
                  disabled={testingAi}
                >
                  {testingAi ? <RefreshCw className="spin" size={16} /> : <Check size={16} />}
                  测试连接
                </button>
              </div>
            </div>

            <div className="settings-grid">
              <div className="settings-card compact">
                <Download size={20} />
                <h3>完整备份</h3>
                <p>导出所有岗位、事件与同步信息。</p>
                <div className="button-row">
                  <button onClick={() => downloadBackup(jobs, "json")}>JSON</button>
                  <button onClick={() => downloadBackup(jobs, "csv")}>CSV</button>
                </div>
              </div>
              <div className="settings-card compact">
                <RefreshCw size={20} />
                <h3>同步全部</h3>
                <p>
                  {settings.lastExportAt
                    ? `上次同步：${new Date(settings.lastExportAt).toLocaleString("zh-CN")}`
                    : "尚未执行过全量同步"}
                </p>
                <button className="text-button" onClick={syncAll} disabled={busy}>
                  立即同步 <ArrowRight size={15} />
                </button>
              </div>
            </div>
          </section>
        ) : (
          <section className="dashboard-view">
            <div className="page-heading dashboard-heading">
              <div>
                <span className="eyebrow">2026 秋招作战台</span>
                <h1>下一步，比收藏更多。</h1>
              </div>
              <div className="metrics">
                <div>
                  <strong>{activeCount}</strong>
                  <span>推进中</span>
                </div>
                <div className={urgentCount ? "metric-urgent" : ""}>
                  <strong>{urgentCount}</strong>
                  <span>三日内截止</span>
                </div>
                <div>
                  <strong>{jobs.filter((job) => job.stage === "offer").length}</strong>
                  <span>Offer</span>
                </div>
              </div>
            </div>

            <div className="toolbar">
              <label className="search">
                <Search size={16} />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="搜索公司、岗位或城市"
                />
              </label>
              <button className="sync-button" onClick={syncAll} disabled={busy || !jobs.length}>
                <RefreshCw size={15} className={busy ? "spin" : ""} />
                同步 Obsidian
              </button>
            </div>

            {jobs.length === 0 ? (
              <div className="empty-state">
                <div className="empty-orbit">
                  <BriefcaseBusiness size={30} />
                </div>
                <span className="eyebrow">从第一个岗位开始</span>
                <h2>别让好机会消失在标签页里</h2>
                <p>打开一个招聘岗位页面，点击“抓取当前岗位”。</p>
                <button className="button button--primary" onClick={capturePage}>
                  <Target size={17} /> 抓取当前页面
                </button>
              </div>
            ) : (
              <div className="kanban">
                {compactStages.map((stage) => {
                  const stageJobs = filteredJobs.filter((job) => job.stage === stage);
                  return (
                    <section className="kanban-column" key={stage}>
                      <header>
                        <span>{STAGE_LABELS[stage]}</span>
                        <strong>{stageJobs.length}</strong>
                      </header>
                      <div className="column-body">
                        {stageJobs.map((job) => (
                          <JobCard
                            key={job.id}
                            job={job}
                            onStageChange={updateStage}
                            onEdit={setEditing}
                          />
                        ))}
                        {!stageJobs.length && <div className="column-empty">暂无岗位</div>}
                      </div>
                    </section>
                  );
                })}
              </div>
            )}
          </section>
        )}
      </div>

      {editing && (
        <EditDrawer
          job={editing}
          onClose={() => setEditing(null)}
          onSave={saveEditedJob}
          onSync={syncOne}
          onDelete={(job) => void deleteJob(job)}
        />
      )}
    </main>
  );
}
