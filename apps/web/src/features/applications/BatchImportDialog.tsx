import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Building2,
  Check,
  CheckCircle2,
  ClipboardPaste,
  FileSpreadsheet,
  HelpCircle,
  Loader2,
  Plus,
  RefreshCw,
  Sparkles,
  Upload,
  X
} from "lucide-react";
import { useCallback, useEffect, useId, useMemo, useRef, useState, type ChangeEvent } from "react";
import type { ApplicationSyncItem } from "@offerflow/contracts";
import {
  ASSESSMENT_TYPE_LABELS,
  CLOSED_STAGE_REASON_LABELS,
  INTERVIEW_ROUND_LABELS,
  RECRUITMENT_TYPES,
  RECRUITMENT_TYPE_LABELS,
  STAGE_LABELS,
  type ApplicationStage,
  type RecruitmentType
} from "@offerflow/domain";
import { api } from "../../app/api";
import "../../styles/batch-import.css";
import {
  buildImportCandidates,
  detectColumnMapping,
  executeApplicationImport,
  IMPORT_FIELD_LABELS,
  parseClipboardOrCsv,
  parseXlsxBuffer,
  type ColumnMappingItem,
  type ConflictStrategy,
  type ImportExecutionResult,
  type ImportTargetField,
  type NormalizedImportApplication,
  type ParseResult
} from "./applicationImport";

interface BatchImportDialogProps {
  existingItems: ApplicationSyncItem[];
  onClose: () => void;
  onImportComplete: (result: ImportExecutionResult) => void;
}

type InputTab = "paste" | "file";
type WizardStep = "input" | "preview" | "executing" | "done";

const SAMPLE_FEISHU_TSV = `公司名称\t投递岗位\t招聘批次\t当前进度\t投递日期\t工作城市\t备注说明
字节跳动\tAI产品经理\t秋招\t已投递\t2026-08-25\t北京\t抖音电商业务线
腾讯\t后台开发工程师\t秋招提前批\t技术一面\t2026-08-26\t深圳\tWXG事业群
阿里巴巴\t全栈工程师\t秋招\t笔试测评\t2026-08-27\t杭州\t淘天集团
美团\t商业化产品经理\t秋招\t二面\t2026-08-28\t上海\t到店业务
招商银行\tFinTech管培生\t秋招\t已投递\t2026-08-29\t深圳\t总行信息科技
小红书\t前端开发工程师\t秋招\t已获Offer\t2026-08-30\t上海\t社区业务线
快手\t推荐算法工程师\t秋招\t笔试未通过\t2026-08-24\t北京\t主站算法团队`;

function stageTone(stage: ApplicationStage): string {
  if (stage === "offer") return "success";
  if (stage === "closed") return "muted";
  if (stage === "interview") return "interview";
  if (stage === "assessment") return "assessment";
  if (stage === "applied") return "applied";
  return "interested";
}

export function BatchImportDialog({ existingItems, onClose, onImportComplete }: BatchImportDialogProps) {
  const [step, setStep] = useState<WizardStep>("input");
  const [tab, setTab] = useState<InputTab>("paste");
  const [pastedText, setPastedText] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [parseError, setParseError] = useState("");

  // Parse output
  const [parsedData, setParsedData] = useState<ParseResult | null>(null);
  const [columnMapping, setColumnMapping] = useState<ColumnMappingItem[]>([]);
  const [strategy, setStrategy] = useState<ConflictStrategy>("update_existing");

  // Candidates & execution
  const [candidates, setCandidates] = useState<NormalizedImportApplication[]>([]);
  const [showMappingConfig, setShowMappingConfig] = useState(false);
  const [executionProgress, setExecutionProgress] = useState<{ done: number; total: number }>({ done: 0, total: 0 });
  const [executionResult, setExecutionResult] = useState<ImportExecutionResult | null>(null);

  // Dialog animation and focus trap
  const [dialogPhase, setDialogPhase] = useState<"opening" | "open" | "closing">("opening");
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeTimerRef = useRef<number>();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const titleId = useId();

  const finishClose = useCallback(() => {
    if (closeTimerRef.current !== undefined) window.clearTimeout(closeTimerRef.current);
    onClose();
  }, [onClose]);

  const requestClose = useCallback(() => {
    if (dialogPhase === "closing") return;
    setDialogPhase("closing");
    closeTimerRef.current = window.setTimeout(finishClose, 200);
  }, [dialogPhase, finishClose]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setDialogPhase("open"));
    return () => window.cancelAnimationFrame(frame);
  }, []);

  // Keyboard trap
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        requestClose();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [requestClose]);

  // Handle parsing pasted text
  const handleParseText = () => {
    setParseError("");
    const trimmed = pastedText.trim();
    if (!trimmed) {
      setParseError("请先粘贴飞书表格或 Excel 的内容");
      return;
    }

    try {
      const parsed = parseClipboardOrCsv(trimmed);
      if (parsed.rows.length === 0) {
        setParseError("未能识别出有效的表格数据，请检查复制的内容");
        return;
      }
      setParsedData(parsed);
      const initialMapping = detectColumnMapping(parsed.headers);
      setColumnMapping(initialMapping);

      const generated = buildImportCandidates(parsed.rows, initialMapping, existingItems, strategy);
      setCandidates(generated);
      setStep("preview");
    } catch (err) {
      setParseError(err instanceof Error ? err.message : "解析失败，请检查输入格式");
    }
  };

  // Handle file selection
  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    setParseError("");
    const file = event.target.files?.[0];
    if (!file) return;

    setSelectedFile(file);
    setIsParsing(true);

    try {
      let parsed: ParseResult;
      if (file.name.endsWith(".xlsx")) {
        const buffer = await file.arrayBuffer();
        parsed = await parseXlsxBuffer(buffer);
      } else {
        const text = await file.text();
        parsed = parseClipboardOrCsv(text);
      }

      if (parsed.rows.length === 0) {
        setParseError("文件中未找到可导入的数据行");
        setIsParsing(false);
        return;
      }

      setParsedData(parsed);
      const initialMapping = detectColumnMapping(parsed.headers);
      setColumnMapping(initialMapping);

      const generated = buildImportCandidates(parsed.rows, initialMapping, existingItems, strategy);
      setCandidates(generated);
      setStep("preview");
    } catch (err) {
      setParseError(err instanceof Error ? err.message : "文件解析出错，请确认文件完整或尝试另存为 .csv 后重试");
    } finally {
      setIsParsing(false);
    }
  };

  // Re-generate candidates when mapping or strategy changes
  const handleMappingChange = (colIndex: number, newTarget: ImportTargetField) => {
    if (!parsedData) return;
    const updated = columnMapping.map((m) => (m.colIndex === colIndex ? { ...m, targetField: newTarget } : m));
    setColumnMapping(updated);
    const recomputed = buildImportCandidates(parsedData.rows, updated, existingItems, strategy);
    setCandidates(recomputed);
  };

  const handleStrategyChange = (newStrategy: ConflictStrategy) => {
    setStrategy(newStrategy);
    if (!parsedData) return;
    const recomputed = buildImportCandidates(parsedData.rows, columnMapping, existingItems, newStrategy);
    setCandidates(recomputed);
  };

  // Row selection toggles
  const toggleSelectCandidate = (id: string) => {
    setCandidates((prev) =>
      prev.map((c) => (c.id === id ? { ...c, selected: !c.selected } : c))
    );
  };

  const toggleSelectAll = (checked: boolean) => {
    setCandidates((prev) =>
      prev.map((c) => ({ ...c, selected: c.errors.length === 0 ? checked : false }))
    );
  };

  // Candidate field inline edits (e.g. if user wants to tweak stage or position)
  const updateCandidateStage = (id: string, nextStage: ApplicationStage) => {
    setCandidates((prev) =>
      prev.map((c) => (c.id === id ? { ...c, stage: nextStage } : c))
    );
  };

  const updateCandidateType = (id: string, nextType?: RecruitmentType) => {
    setCandidates((prev) =>
      prev.map((c) => (c.id === id ? { ...c, recruitmentType: nextType } : c))
    );
  };

  // Execute import
  const runImport = async () => {
    const toImport = candidates.filter((c) => c.selected && c.errors.length === 0);
    if (toImport.length === 0) return;

    setStep("executing");
    setExecutionProgress({ done: 0, total: toImport.length });

    try {
      const result = await executeApplicationImport(
        {
          createApplication: (body) => api.applications.create(body),
          updateApplication: (id, body) => api.applications.update(id, body)
        },
        candidates,
        (done, total) => setExecutionProgress({ done, total })
      );
      setExecutionResult(result);
      setStep("done");
      onImportComplete(result);
    } catch (err) {
      setParseError(err instanceof Error ? err.message : "批量导入过程中发生异常");
      setStep("preview");
    }
  };

  // Computed stats
  const stats = useMemo(() => {
    const total = candidates.length;
    const createCount = candidates.filter((c) => c.action === "create" && c.errors.length === 0).length;
    const updateCount = candidates.filter((c) => c.action === "update" && c.errors.length === 0).length;
    const errorCount = candidates.filter((c) => c.errors.length > 0).length;
    const selectedCount = candidates.filter((c) => c.selected && c.errors.length === 0).length;
    const allSelected = selectedCount > 0 && selectedCount === candidates.filter((c) => c.errors.length === 0).length;
    return { total, createCount, updateCount, errorCount, selectedCount, allSelected };
  }, [candidates]);

  return (
    <div
      className={`application-dialog-backdrop is-${dialogPhase}`}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && step !== "executing") requestClose();
      }}
    >
      <div
        ref={dialogRef}
        className="application-dialog batch-import-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        {/* Header */}
        <header className="batch-import-header">
          <div>
            <span className="page-kicker">批量导入与智能对齐</span>
            <h2 id={titleId}>从飞书 / Excel 导入投递记录</h2>
          </div>
          {step !== "executing" && (
            <button className="icon-button" type="button" aria-label="关闭" onClick={requestClose}>
              <X aria-hidden="true" size={20} />
            </button>
          )}
        </header>

        {/* Step 1: Input */}
        {step === "input" && (
          <div className="batch-import-body">
            <div className="batch-import-tabs">
              <button
                type="button"
                className={`import-tab-btn ${tab === "paste" ? "is-active" : ""}`}
                onClick={() => { setTab("paste"); setParseError(""); }}
              >
                <ClipboardPaste size={16} />直接粘贴 (飞书 / 剪贴板)
              </button>
              <button
                type="button"
                className={`import-tab-btn ${tab === "file" ? "is-active" : ""}`}
                onClick={() => { setTab("file"); setParseError(""); }}
              >
                <FileSpreadsheet size={16} />文件上传 (.xlsx / .csv)
              </button>
            </div>

            {tab === "paste" ? (
              <div className="import-paste-pane">
                <div className="import-paste-tip">
                  <Sparkles size={16} className="tip-icon" />
                  <span>
                    <strong>推荐体验：</strong>在飞书多维表格、飞书电子表格或 Excel 中，用鼠标框选记录按{" "}
                    <code>Ctrl+C</code> 复制，直接在下方按 <code>Ctrl+V</code> 粘贴即可，系统会自动解析制表符与列字段。
                  </span>
                  <button
                    type="button"
                    className="import-sample-btn"
                    onClick={() => {
                      setPastedText(SAMPLE_FEISHU_TSV);
                      setParseError("");
                    }}
                  >
                    填入秋招测试数据
                  </button>
                </div>
                <textarea
                  className="import-paste-textarea"
                  value={pastedText}
                  onChange={(e) => setPastedText(e.target.value)}
                  placeholder={`将飞书表格复制的文本粘贴在此处...\n例如：\n公司名称\t岗位\t状态\t时间\n字节跳动\tAI产品经理\t已投递\t2026-08-25\n腾讯\t后台开发\t一面\t2026-08-26`}
                  rows={9}
                />
              </div>
            ) : (
              <div className="import-file-pane">
                <div
                  className="import-dropzone"
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    if (e.dataTransfer.files?.[0]) {
                      const file = e.dataTransfer.files[0];
                      if (fileInputRef.current) {
                        const dt = new DataTransfer();
                        dt.items.add(file);
                        fileInputRef.current.files = dt.files;
                        handleFileChange({ target: fileInputRef.current } as any);
                      }
                    }
                  }}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".xlsx,.csv,.tsv,.txt"
                    style={{ display: "none" }}
                    onChange={handleFileChange}
                  />
                  <Upload size={32} className="dropzone-icon" />
                  <h3>点击选择或将文件拖放到此处</h3>
                  <p>支持 Microsoft Excel (<code>.xlsx</code>)、逗号分隔表 (<code>.csv</code>) 或制表符文本 (<code>.tsv</code>)</p>
                  {selectedFile && <span className="selected-file-badge">{selectedFile.name}</span>}
                </div>
              </div>
            )}

            {parseError && (
              <div className="import-error-banner" role="alert">
                <AlertCircle size={16} />
                <span>{parseError}</span>
              </div>
            )}

            <footer className="batch-import-footer">
              <button className="secondary-button" type="button" onClick={requestClose}>
                取消
              </button>
              {tab === "paste" ? (
                <button
                  className="primary-button"
                  type="button"
                  onClick={handleParseText}
                  disabled={!pastedText.trim()}
                >
                  下一步：解析与匹配规则 <ArrowRight size={16} />
                </button>
              ) : (
                <button
                  className="primary-button"
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isParsing}
                >
                  {isParsing ? <Loader2 size={16} className="spin" /> : <Upload size={16} />}
                  {isParsing ? "正在解析文件…" : "选择文件并解析"}
                </button>
              )}
            </footer>
          </div>
        )}

        {/* Step 2: Preview & Reconciliation */}
        {step === "preview" && (
          <div className="batch-import-body">
            {/* Stat summaries */}
            <div className="import-stat-row">
              <div className="stat-pill stat-pill--total">
                <span>解析条目</span>
                <strong>{stats.total}</strong>
              </div>
              <div className="stat-pill stat-pill--create">
                <span>✨ 新建投递</span>
                <strong>{stats.createCount}</strong>
              </div>
              <div className="stat-pill stat-pill--update">
                <span>🔄 匹配更新已有</span>
                <strong>{stats.updateCount}</strong>
              </div>
              {stats.errorCount > 0 && (
                <div className="stat-pill stat-pill--error">
                  <span>⚠️ 字段待补全</span>
                  <strong>{stats.errorCount}</strong>
                </div>
              )}
            </div>

            {/* Strategy radio selection */}
            <div className="import-strategy-bar">
              <div className="strategy-label">
                <Building2 size={15} />
                <span>与当前投递记录比对策略：</span>
              </div>
              <div className="strategy-options">
                <label className={`strategy-radio ${strategy === "update_existing" ? "is-selected" : ""}`}>
                  <input
                    type="radio"
                    name="strategy"
                    value="update_existing"
                    checked={strategy === "update_existing"}
                    onChange={() => handleStrategyChange("update_existing")}
                  />
                  <span>🔄 智能合并更新已有记录</span>
                </label>
                <label className={`strategy-radio ${strategy === "skip_existing" ? "is-selected" : ""}`}>
                  <input
                    type="radio"
                    name="strategy"
                    value="skip_existing"
                    checked={strategy === "skip_existing"}
                    onChange={() => handleStrategyChange("skip_existing")}
                  />
                  <span>⏭️ 跳过已存在记录</span>
                </label>
                <label className={`strategy-radio ${strategy === "create_all" ? "is-selected" : ""}`}>
                  <input
                    type="radio"
                    name="strategy"
                    value="create_all"
                    checked={strategy === "create_all"}
                    onChange={() => handleStrategyChange("create_all")}
                  />
                  <span>➕ 全部作为新记录创建</span>
                </label>
              </div>
            </div>

            {/* Column Mapping Toggle and Config */}
            <div className="import-mapping-wrapper">
              <button
                type="button"
                className="mapping-toggle-btn"
                onClick={() => setShowMappingConfig((prev) => !prev)}
              >
                <span>表头字段映射 ({columnMapping.filter((m) => m.targetField !== "ignore").length}/{columnMapping.length} 列已匹配)</span>
                <small>{showMappingConfig ? "收起映射设置" : "展开调整列映射"}</small>
              </button>

              {showMappingConfig && (
                <div className="mapping-grid">
                  {columnMapping.map((col) => (
                    <div key={col.colIndex} className="mapping-item">
                      <div className="mapping-col-name" title={col.headerName}>
                        {col.headerName || `第 ${col.colIndex + 1} 列`}
                      </div>
                      <ArrowRight size={13} className="mapping-arrow" />
                      <select
                        value={col.targetField}
                        onChange={(e) => handleMappingChange(col.colIndex, e.target.value as ImportTargetField)}
                      >
                        {Object.entries(IMPORT_FIELD_LABELS).map(([fieldKey, fieldLabel]) => (
                          <option key={fieldKey} value={fieldKey}>
                            {fieldLabel}
                          </option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Candidates Preview Table */}
            <div className="import-preview-table-wrap">
              <table className="import-preview-table">
                <thead>
                  <tr>
                    <th className="col-check">
                      <input
                        type="checkbox"
                        checked={stats.allSelected}
                        onChange={(e) => toggleSelectAll(e.target.checked)}
                        aria-label="全选可导入行"
                      />
                    </th>
                    <th className="col-action">匹配动作</th>
                    <th className="col-company">公司</th>
                    <th className="col-position">岗位</th>
                    <th className="col-type">岗位类型</th>
                    <th className="col-stage">当前阶段</th>
                    <th className="col-time">投递时间</th>
                    <th className="col-city">地点</th>
                  </tr>
                </thead>
                <tbody>
                  {candidates.map((cand) => {
                    const isError = cand.errors.length > 0;
                    return (
                      <tr key={cand.id} className={`${cand.selected ? "is-selected" : ""} ${isError ? "is-error" : ""}`}>
                        <td className="col-check">
                          <input
                            type="checkbox"
                            checked={cand.selected}
                            disabled={isError}
                            onChange={() => toggleSelectCandidate(cand.id)}
                            aria-label={`选择 ${cand.company} ${cand.position}`}
                          />
                        </td>
                        <td className="col-action">
                          {isError ? (
                            <span className="action-tag action-tag--error" title={cand.errors.join("; ")}>
                              ⚠️ {cand.errors[0]}
                            </span>
                          ) : cand.action === "update" ? (
                            <span
                              className="action-tag action-tag--update"
                              title={`匹配到已有投递：${cand.matchedExistingItem?.application.company} · ${cand.matchedExistingItem?.application.position}`}
                            >
                              🔄 更新已有
                            </span>
                          ) : cand.action === "skip" ? (
                            <span className="action-tag action-tag--skip">⏭️ 跳过</span>
                          ) : (
                            <span className="action-tag action-tag--create">✨ 新建</span>
                          )}
                        </td>
                        <td className="col-company">
                          <div className="company-cell">
                            <strong>{cand.company || "未填写"}</strong>
                            {cand.matchedDirectoryCompany && (
                              <span className="directory-badge" title="已自动对齐 JobKoi 企业库并关联校招官网">
                                已对齐官网
                              </span>
                            )}
                            {cand.department && <small className="dept-tag">{cand.department}</small>}
                          </div>
                        </td>
                        <td className="col-position">
                          <span>{cand.position || "未填写"}</span>
                        </td>
                        <td className="col-type">
                          <select
                            className="inline-select"
                            value={cand.recruitmentType || ""}
                            onChange={(e) => updateCandidateType(cand.id, (e.target.value || undefined) as any)}
                          >
                            <option value="">未指定</option>
                            {RECRUITMENT_TYPES.map((t) => (
                              <option key={t} value={t}>
                                {RECRUITMENT_TYPE_LABELS[t]}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="col-stage">
                          <div className="stage-cell">
                            <select
                              className={`inline-select stage-select stage-select--${stageTone(cand.stage)}`}
                              value={cand.stage}
                              onChange={(e) => updateCandidateStage(cand.id, e.target.value as ApplicationStage)}
                            >
                              {Object.entries(STAGE_LABELS).map(([sKey, sLabel]) => (
                                <option key={sKey} value={sKey}>
                                  {sLabel}
                                </option>
                              ))}
                            </select>
                            {cand.stage === "assessment" && cand.assessmentType && (
                              <small className="sub-tag">{ASSESSMENT_TYPE_LABELS[cand.assessmentType]}</small>
                            )}
                            {cand.interviewRound && (
                              <small className="sub-tag">{INTERVIEW_ROUND_LABELS[cand.interviewRound]}</small>
                            )}
                            {cand.closedReason && (
                              <small className="sub-tag sub-tag--closed">{CLOSED_STAGE_REASON_LABELS[cand.closedReason]}</small>
                            )}
                          </div>
                        </td>
                        <td className="col-time">
                          <span className="time-text">{cand.appliedAt || "未记录"}</span>
                        </td>
                        <td className="col-city">
                          <span>{cand.city || "未指定"}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <footer className="batch-import-footer">
              <button className="secondary-button" type="button" onClick={() => setStep("input")}>
                <ArrowLeft size={16} /> 重新编辑数据
              </button>
              <button
                className="primary-button"
                type="button"
                onClick={runImport}
                disabled={stats.selectedCount === 0}
              >
                <Check size={16} /> 确认导入 {stats.selectedCount} 条记录
              </button>
            </footer>
          </div>
        )}

        {/* Step 3: Executing */}
        {step === "executing" && (
          <div className="batch-import-body batch-import-executing">
            <Loader2 size={44} className="spin executing-spinner" />
            <h3>正在执行批量导入…</h3>
            <p>
              已处理 {executionProgress.done} / {executionProgress.total} 条
            </p>
            <div className="progress-bar-wrap">
              <div
                className="progress-bar-fill"
                style={{
                  width: `${executionProgress.total > 0 ? (executionProgress.done / executionProgress.total) * 100 : 0}%`
                }}
              />
            </div>
          </div>
        )}

        {/* Step 4: Done */}
        {step === "done" && executionResult && (
          <div className="batch-import-body batch-import-done">
            <CheckCircle2 size={54} className="done-icon" />
            <h3>批量导入已完成！</h3>
            <p className="done-summary">
              成功新建 <strong>{executionResult.createdCount}</strong> 条，更新{" "}
              <strong>{executionResult.updatedCount}</strong> 条已有记录
              {executionResult.skippedCount > 0 && `，跳过 ${executionResult.skippedCount} 条`}
              {executionResult.failedCount > 0 && `，失败 ${executionResult.failedCount} 条`}。
            </p>

            {executionResult.failedItems.length > 0 && (
              <div className="import-failed-box">
                <h4>以下记录未成功导入：</h4>
                <ul>
                  {executionResult.failedItems.map((f, idx) => (
                    <li key={idx}>
                      {f.company} - {f.position}：{f.error}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <footer className="batch-import-footer">
              <button className="primary-button" type="button" onClick={requestClose}>
                完成并查看投递
              </button>
            </footer>
          </div>
        )}
      </div>
    </div>
  );
}
